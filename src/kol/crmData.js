// K9 Operations — CRM (Ignite intake) model (pure, framework-free)
//
// The logic half of the CRM page (src/kol/pages/CrmPage.jsx): classifying Ignite
// submissions into booking vs employment, shaping the parsed form data for the
// Submission Details expander, and managing the per-submission outreach log.
//
// Deliberately free of React and of ./theme/supabase so every helper is
// unit-testable in isolation (see src/__tests__/crmData.test.js). The only
// import is the framework-free Ignite constants module.

import { LEAD_TYPES, MATCH_STATUSES } from "../ignite/constants.js";

// ─────────────────────────────────────────────────────────────────────────────
// Lead types + match status
// ─────────────────────────────────────────────────────────────────────────────

export const LEAD_TYPE_LABELS = {
  [LEAD_TYPES.WEB_FORM]: "Web Form",
  [LEAD_TYPES.PHONE_CALL]: "Phone Call",
  [LEAD_TYPES.AD_CLICK]: "Ad Click",
};

/** Human label for a lead_type enum value. */
export function leadTypeLabel(type) {
  return LEAD_TYPE_LABELS[type] || "Submission";
}

// Pill meta for a lead's match status. `tone` keys into the list-surface
// STATUS_PALETTE so the CRM table reuses the canonical status-pill colors.
export const MATCH_STATUS_META = {
  [MATCH_STATUSES.MATCHED]: { label: "Matched", tone: "success" },
  [MATCH_STATUSES.REVIEW]: { label: "Needs Review", tone: "warning" },
  [MATCH_STATUSES.NO_MATCH]: { label: "New Lead", tone: "info" },
  [MATCH_STATUSES.NEW]: { label: "New", tone: "info" },
};

/** Resolve { label, tone } for a lead's match status, defaulting to neutral. */
export function matchStatusMeta(status) {
  return MATCH_STATUS_META[status] || { label: humanizeFieldKey(status || "New"), tone: "neutral" };
}

/**
 * Coarse status bucket used by the quick-filter pills. `matched` and `review`
 * map 1:1; everything else (new / no_match / unknown) is a fresh "new" lead.
 */
export function statusBucket(lead) {
  const s = lead && lead.match_status;
  if (s === MATCH_STATUSES.MATCHED) return "matched";
  if (s === MATCH_STATUSES.REVIEW) return "review";
  return "new";
}

/** Match confidence (0–1) as a whole percentage, or null when absent. */
export function confidencePct(confidence) {
  if (confidence == null || Number.isNaN(Number(confidence))) return null;
  return Math.round(Number(confidence) * 100);
}

// ─────────────────────────────────────────────────────────────────────────────
// Submission categories (subtabs) + classification
// ─────────────────────────────────────────────────────────────────────────────

// Tokens that mark a submission as an employment / hiring inquiry rather than a
// booking inquiry. Matched as substrings against a lowercased haystack built
// from the subject, source detail, and form-data keys + values.
export const EMPLOYMENT_KEYWORDS = [
  "employ", "career", "job", "hiring", "hire", "apply", "applicant",
  "application", "resume", "résumé", "position", "vacancy", "recruit",
  "openings", "work with us", "join our team", "join the team",
];

// The CRM subtabs. `live` categories render the submissions table; the rest are
// reserved (coming-soon) tabs for future Ignite intake streams.
export const SUBMISSION_CATEGORIES = [
  {
    id: "booking",
    label: "Booking",
    live: true,
    explainer:
      "Prospective clients asking about daycare, boarding, grooming, and tours — captured from Ignite and ready for first outreach.",
  },
  {
    id: "employment",
    label: "Employment",
    live: true,
    explainer:
      "Job and hiring inquiries captured from Ignite careers forms — route these to the hiring manager and follow up.",
  },
  {
    id: "partnerships",
    label: "Partnerships",
    live: false,
    explainer: "Vendor, rescue, and cross-referral partnership inquiries will land here.",
  },
  {
    id: "events",
    label: "Events",
    live: false,
    explainer: "Facility rental and private-event inquiries will land here.",
  },
];

export const LIVE_CATEGORY_IDS = SUBMISSION_CATEGORIES.filter((c) => c.live).map((c) => c.id);

/** Look up a category definition by id. */
export function getCategory(id) {
  return SUBMISSION_CATEGORIES.find((c) => c.id === id) || null;
}

/** Lowercased text blob used to sniff a submission's category. */
export function buildClassifierHaystack(lead) {
  if (!lead) return "";
  const parts = [lead.raw_email_subject, lead.source_detail];
  const fd = lead.form_data;
  if (fd && typeof fd === "object") {
    for (const [key, value] of Object.entries(fd)) {
      parts.push(key);
      if (value != null && typeof value !== "object") parts.push(String(value));
    }
  }
  return parts.filter(Boolean).join(" ").toLowerCase();
}

/**
 * Classify a submission into a live category. Employment inquiries are detected
 * by keyword; everything else is treated as a booking inquiry (the default).
 */
export function classifySubmissionCategory(lead) {
  const haystack = buildClassifierHaystack(lead);
  return EMPLOYMENT_KEYWORDS.some((kw) => haystack.includes(kw)) ? "employment" : "booking";
}

/** Count submissions per live category (for the subtab badges). */
export function countByCategory(leads) {
  const counts = Object.create(null);
  for (const id of LIVE_CATEGORY_IDS) counts[id] = 0;
  for (const lead of leads || []) {
    const id = classifySubmissionCategory(lead);
    counts[id] = (counts[id] || 0) + 1;
  }
  return counts;
}

/** Count submissions per status bucket (for the quick-filter pills). */
export function countByStatusBucket(leads) {
  const counts = { all: 0, new: 0, matched: 0, review: 0 };
  for (const lead of leads || []) {
    counts.all += 1;
    counts[statusBucket(lead)] += 1;
  }
  return counts;
}

// ─────────────────────────────────────────────────────────────────────────────
// Contact + form-data shaping
// ─────────────────────────────────────────────────────────────────────────────

/** Display name "First Last", or a stable fallback when both are blank. */
export function leadDisplayName(lead) {
  const name = [lead && lead.first_name, lead && lead.last_name]
    .map((s) => (s || "").trim())
    .filter(Boolean)
    .join(" ");
  return name || "Unknown contact";
}

/** Sort key for a lead's name (last name first, lowercased). */
export function leadSortName(lead) {
  return [(lead && lead.last_name) || "", (lead && lead.first_name) || ""].join(" ").trim().toLowerCase();
}

function firstNonEmpty(...values) {
  for (const v of values) {
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

/** A representative "interest / role" for the table's middle column. */
export function leadPrimaryInterest(lead) {
  const fd = (lead && lead.form_data) || {};
  return firstNonEmpty(
    fd.service_interest,
    fd.interest,
    fd.service,
    fd.position,
    fd.role,
    fd.job_title,
    fd.desired_position,
  );
}

/** Turn a snake_case / camelCase form-data key into a Title Case label. */
export function humanizeFieldKey(key) {
  return String(key || "")
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Keys already surfaced as dedicated fields elsewhere in the UI — hidden from
// the generic "parsed fields" list in the Submission Details expander.
export const FORM_DATA_HIDDEN_KEYS = new Set([
  "first_name", "last_name", "email", "phone", "lead_type",
  "ignite_profile_id", "ignite_location_id",
]);

/**
 * Flatten a lead's form_data into [{ key, label, value }] for the details
 * expander: scalar values only, hidden keys removed, blanks skipped.
 */
export function buildFormDataEntries(lead) {
  const fd = lead && lead.form_data;
  if (!fd || typeof fd !== "object") return [];
  return Object.entries(fd)
    .filter(([key, value]) =>
      !FORM_DATA_HIDDEN_KEYS.has(key) &&
      value != null &&
      typeof value !== "object" &&
      String(value).trim() !== "")
    .map(([key, value]) => ({ key, label: humanizeFieldKey(key), value: String(value) }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Outreach log
// ─────────────────────────────────────────────────────────────────────────────

export const OUTREACH_CHANNELS = [
  { id: "call", label: "Call" },
  { id: "text", label: "Text" },
  { id: "email", label: "Email" },
  { id: "note", label: "Note" },
];

export const OUTREACH_CHANNEL_LABELS = OUTREACH_CHANNELS.reduce((acc, c) => {
  acc[c.id] = c.label;
  return acc;
}, {});

/** A lead's outreach log as an array (tolerant of a missing/!array column). */
export function getOutreachLog(lead) {
  const log = lead && lead.outreach_log;
  return Array.isArray(log) ? log : [];
}

export function outreachCount(lead) {
  return getOutreachLog(lead).length;
}

/** The most recently logged outreach entry, or null. */
export function latestOutreach(lead) {
  const log = getOutreachLog(lead);
  if (!log.length) return null;
  return log.reduce((latest, entry) =>
    new Date(entry.loggedAt).getTime() >= new Date(latest.loggedAt).getTime() ? entry : latest);
}

/** The pending follow-up date (newFollowUp of the latest entry), or "". */
export function currentFollowUp(lead) {
  const latest = latestOutreach(lead);
  return (latest && latest.newFollowUp) || "";
}

/**
 * Build a new outreach log entry. `now` may be a Date or a value the Date
 * constructor accepts; defaults to the current time.
 */
export function makeOutreachEntry({
  channel = "note",
  notes = "",
  nextFollowUp = "",
  previousFollowUp = "",
  loggedBy = "",
  now = new Date(),
} = {}) {
  const at = now instanceof Date ? now : new Date(now);
  const rand = Math.random().toString(36).slice(2, 7);
  return {
    id: `out_${at.getTime().toString(36)}_${rand}`,
    channel: OUTREACH_CHANNEL_LABELS[channel] ? channel : "note",
    notes: String(notes || "").trim(),
    previousFollowUp: previousFollowUp || "",
    newFollowUp: nextFollowUp || "",
    loggedBy: loggedBy || "",
    loggedAt: at.toISOString(),
  };
}

/** Return a new outreach log with `entry` appended (does not mutate `lead`). */
export function appendOutreachEntry(lead, entry) {
  return [...getOutreachLog(lead), entry];
}

/**
 * Classify a follow-up date relative to `today` ("YYYY-MM-DD"):
 *   none → not yet contacted · overdue · today · scheduled (future).
 * String comparison is valid for zero-padded ISO dates.
 */
export function followUpState(dateStr, today) {
  if (!dateStr) return "none";
  if (!today) return "scheduled";
  if (dateStr < today) return "overdue";
  if (dateStr === today) return "today";
  return "scheduled";
}

/**
 * Recommended next follow-up date for a category. Booking inquiries are
 * high-intent (+1 day); employment inquiries get a +2 day default. `addDaysFn`
 * is injected (theme's addDays) to keep this module framework-free.
 */
export function recommendedFollowUp(category, today, addDaysFn) {
  const offset = category === "employment" ? 2 : 1;
  return typeof addDaysFn === "function" ? addDaysFn(today, offset) : today;
}

// ─────────────────────────────────────────────────────────────────────────────
// Filtering
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Filter decorated submissions by active category + status bucket. Search is
 * handled separately by the list-surface filterRows() over the table columns.
 */
export function filterSubmissions(leads, { category, status = "all" } = {}) {
  return (leads || []).filter((lead) => {
    if (category && classifySubmissionCategory(lead) !== category) return false;
    if (status && status !== "all" && statusBucket(lead) !== status) return false;
    return true;
  });
}

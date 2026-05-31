// K9 Operations — CRM (booking/availability form intake) model (pure, framework-free)
//
// Logic half of the CRM page (src/kol/pages/CrmPage.jsx): the web-form-only view
// of submissions, the cleaned Name + pretty Phone presentation, the flattened
// web-form details, and the relational follow-up "updates" (ignite_lead_updates).
//
// Free of React / theme / supabase so every helper is unit-testable in isolation
// (see src/__tests__/crmData.test.js). Only imports the framework-free Ignite
// constants module.

import { LEAD_TYPES } from "../ignite/constants.js";

// ─────────────────────────────────────────────────────────────────────────────
// Lead types — this CRM view is web-forms only (phone-call leads are excluded).
// ─────────────────────────────────────────────────────────────────────────────

export const LEAD_TYPE_LABELS = {
  [LEAD_TYPES.WEB_FORM]: "Web Form",
  [LEAD_TYPES.PHONE_CALL]: "Phone Call",
  [LEAD_TYPES.AD_CLICK]: "Ad Click",
};

export function leadTypeLabel(type) {
  return LEAD_TYPE_LABELS[type] || "Submission";
}

/** This view only shows web-form submissions. */
export function isWebForm(lead) {
  return (lead && lead.lead_type) === LEAD_TYPES.WEB_FORM;
}

// ─────────────────────────────────────────────────────────────────────────────
// Subtabs — the booking/availability form (+ employment, ignored for now)
// ─────────────────────────────────────────────────────────────────────────────

export const EMPLOYMENT_KEYWORDS = [
  "employ", "career", "job", "hiring", "hire", "applicant", "application",
  "resume", "résumé", "position", "vacancy", "recruit",
];

export const SUBMISSION_CATEGORIES = [
  {
    id: "booking",
    label: "Booking Availability Form",
    live: true,
    explainer: "Booking & availability form submissions captured from your website — ready for outreach.",
  },
  {
    id: "employment",
    label: "Employment",
    live: true,
    explainer: "Job and hiring inquiries.",
  },
];

export const LIVE_CATEGORY_IDS = SUBMISSION_CATEGORIES.filter((c) => c.live).map((c) => c.id);

export function getCategory(id) {
  return SUBMISSION_CATEGORIES.find((c) => c.id === id) || null;
}

export function buildClassifierHaystack(lead) {
  if (!lead) return "";
  const parts = [lead.raw_email_subject, lead.source_detail, lead.form_data && lead.form_data.form_name];
  const fd = lead.form_data;
  if (fd && typeof fd === "object") {
    for (const [key, value] of Object.entries(fd)) {
      parts.push(key);
      if (value != null && typeof value !== "object") parts.push(String(value));
    }
  }
  return parts.filter(Boolean).join(" ").toLowerCase();
}

/** Booking is the default; only obvious hiring inquiries go to employment. */
export function classifySubmissionCategory(lead) {
  const haystack = buildClassifierHaystack(lead);
  return EMPLOYMENT_KEYWORDS.some((kw) => haystack.includes(kw)) ? "employment" : "booking";
}

/** Count web-form submissions per live category (for subtab badges). */
export function countByCategory(leads) {
  const counts = Object.create(null);
  for (const id of LIVE_CATEGORY_IDS) counts[id] = 0;
  for (const lead of leads || []) {
    if (!isWebForm(lead)) continue;
    const id = classifySubmissionCategory(lead);
    counts[id] = (counts[id] || 0) + 1;
  }
  return counts;
}

/** Filter to web forms in the active category. */
export function filterSubmissions(leads, { category } = {}) {
  return (leads || []).filter((lead) => {
    if (!isWebForm(lead)) return false;
    if (category && classifySubmissionCategory(lead) !== category) return false;
    return true;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Name + phone presentation
// ─────────────────────────────────────────────────────────────────────────────

function collapseSpaces(s) {
  return String(s == null ? "" : s).replace(/\s+/g, " ").trim();
}

/** Combine first + last into one clean name, fixing stray/double spaces. */
export function cleanLeadName(lead) {
  return [collapseSpaces(lead && lead.first_name), collapseSpaces(lead && lead.last_name)]
    .filter(Boolean)
    .join(" ");
}

export function leadSortName(lead) {
  return collapseSpaces([(lead && lead.last_name) || "", (lead && lead.first_name) || ""].join(" ")).toLowerCase();
}

/**
 * Format a US phone as "(area) prefix-line", e.g. "18567018139" → "(856) 701-8139".
 * Area code is parenthesized and the last seven digits are hyphenated. Country
 * code is dropped for readability; unrecognized inputs pass through unchanged.
 */
export function formatPhonePretty(phone) {
  const d = String(phone == null ? "" : phone).replace(/\D/g, "");
  let rest = d;
  if (d.length === 11 && d[0] === "1") rest = d.slice(1);
  else if (d.length === 10) rest = d;
  else return collapseSpaces(phone);
  return `(${rest.slice(0, 3)}) ${rest.slice(3, 6)}-${rest.slice(6, 10)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Web-form details — every distinct field from the contact form
// ─────────────────────────────────────────────────────────────────────────────

export function humanizeFieldKey(key) {
  return String(key || "")
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Keys promoted elsewhere or that are plumbing/noise (mostly from the legacy
// Gingr appointment feed) — excluded from the details column.
export const FORM_FIELD_HIDDEN_KEYS = new Set([
  "lead_type", "first_name", "last_name", "caller_name", "email", "phone",
  "ignite_profile_id", "ignite_location_id", "ignite_lead_id",
  "landing_page_url", "lead_page_url", "agreed_to_terms", "device", "browser",
  "country", "services", "sales_value", "estimated_tax", "estimated_subtotal",
  "estimated_total", "multi_unit_name", "is_this_lead_quotable_yes_yes",
  "booking_title",
]);

/**
 * Flatten a submission's contact-form fields into [{ key, label, value }] for the
 * details column: email first, then every distinct non-empty scalar field.
 */
export function buildFormFieldEntries(lead) {
  const entries = [];
  if (lead && lead.email) entries.push({ key: "email", label: "Email", value: String(lead.email) });
  const fd = lead && lead.form_data;
  if (fd && typeof fd === "object") {
    for (const [key, value] of Object.entries(fd)) {
      if (FORM_FIELD_HIDDEN_KEYS.has(key)) continue;
      if (value == null || typeof value === "object") continue;
      const clean = collapseSpaces(value);
      if (!clean || clean.length > 240) continue; // skip blanks + giant blobs
      entries.push({ key, label: humanizeFieldKey(key), value: clean });
    }
  }
  return entries;
}

// ─────────────────────────────────────────────────────────────────────────────
// Updates (relational ignite_lead_updates) — follow-up log
// ─────────────────────────────────────────────────────────────────────────────

export const UPDATE_TYPES = [
  { id: "call", label: "Call" },
  { id: "text", label: "Text" },
  { id: "email", label: "Email" },
  { id: "note", label: "Note" },
];

export const UPDATE_TYPE_LABELS = UPDATE_TYPES.reduce((acc, t) => {
  acc[t.id] = t.label;
  return acc;
}, {});

export function updateTypeLabel(type) {
  return UPDATE_TYPE_LABELS[type] || "Note";
}

/** Group ignite_lead_updates rows by lead_id. */
export function groupUpdatesByLead(rows) {
  const map = Object.create(null);
  for (const r of rows || []) {
    if (!r || !r.lead_id) continue;
    (map[r.lead_id] || (map[r.lead_id] = [])).push(r);
  }
  return map;
}

function byCreatedAtDesc(a, b) {
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

/** { count, latest } summary for the Updates column. */
export function summarizeUpdates(updates) {
  const list = Array.isArray(updates) ? updates : [];
  if (!list.length) return { count: 0, latest: null };
  return { count: list.length, latest: [...list].sort(byCreatedAtDesc)[0] };
}

/** The pending follow-up date: newest update's next_follow_up_date, or "". */
export function deriveFollowUp(updates) {
  const list = Array.isArray(updates) ? updates : [];
  for (const u of [...list].sort(byCreatedAtDesc)) {
    if (u.next_follow_up_date) return u.next_follow_up_date;
  }
  return "";
}

/** Row payload inserted into ignite_lead_updates. */
export function buildUpdatePayload({ leadId, locationId, type = "note", notes = "", nextFollowUp = "", createdById = null, createdByName = "" }) {
  return {
    lead_id: leadId,
    location_id: locationId,
    update_type: UPDATE_TYPE_LABELS[type] ? type : "note",
    notes: String(notes || "").trim() || null,
    next_follow_up_date: nextFollowUp || null,
    created_by_user_id: createdById || null,
    created_by_name: String(createdByName || "").trim() || null,
  };
}

/**
 * Classify a follow-up date relative to `today` ("YYYY-MM-DD"):
 *   none · overdue · today · scheduled (future). String compare is valid for ISO.
 */
export function followUpState(dateStr, today) {
  if (!dateStr) return "none";
  if (!today) return "scheduled";
  if (dateStr < today) return "overdue";
  if (dateStr === today) return "today";
  return "scheduled";
}

/** Recommended next follow-up: booking +1 day (high-intent), employment +2. */
export function recommendedFollowUp(category, today, addDaysFn) {
  const offset = category === "employment" ? 2 : 1;
  return typeof addDaysFn === "function" ? addDaysFn(today, offset) : today;
}

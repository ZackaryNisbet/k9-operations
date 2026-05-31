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

// Gingr "Appointment Received" emails are confirmations/invoices for bookings
// ALREADY made (estimated subtotal/tax/total, drop-off/pick-up) — not website
// booking/availability FORM submissions. They're excluded from the lead CRM.
// Detected by subject/source, with a pricing-field fallback.
const APPOINTMENT_MARKERS = ["appointment received", "appointment confirmed", "appointment scheduled"];
export function isAppointment(lead) {
  if (!lead) return false;
  const text = `${lead.raw_email_subject || ""} ${lead.source_detail || ""}`.toLowerCase();
  if (APPOINTMENT_MARKERS.some((m) => text.includes(m))) return true;
  const fd = lead.form_data;
  if (fd && typeof fd === "object" && (fd.estimated_total != null || fd.estimated_subtotal != null || fd.estimated_tax != null)) return true;
  return false;
}

/** A lead belongs in the CRM only if it's a web form AND not a Gingr appointment. */
export function isCrmSubmission(lead) {
  return isWebForm(lead) && !isAppointment(lead);
}

/** Count web-form submissions per live category (for subtab badges). */
export function countByCategory(leads) {
  const counts = Object.create(null);
  for (const id of LIVE_CATEGORY_IDS) counts[id] = 0;
  for (const lead of leads || []) {
    if (!isCrmSubmission(lead)) continue;
    const id = classifySubmissionCategory(lead);
    counts[id] = (counts[id] || 0) + 1;
  }
  return counts;
}

/** Filter to web forms in the active category. */
export function filterSubmissions(leads, { category } = {}) {
  return (leads || []).filter((lead) => {
    if (!isCrmSubmission(lead)) return false;
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

// Some submissions (older iDigital "Contact Form" web forms) carry the name only
// in a form_data field rather than first/last — fall back to it so the Name
// column is filled instead of showing "—".
export const NAME_FIELD_KEYS = ["full_name", "name", "contact_name", "your_name", "customer_name"];
function nameFromFormData(lead) {
  const fd = lead && lead.form_data;
  if (!fd || typeof fd !== "object") return "";
  for (const key of NAME_FIELD_KEYS) {
    const v = fd[key];
    if (v != null && typeof v !== "object") {
      const clean = collapseSpaces(v);
      if (clean) return clean;
    }
  }
  return "";
}

/** Combine first + last into one clean name; fall back to a form_data name field. */
export function cleanLeadName(lead) {
  const combined = [collapseSpaces(lead && lead.first_name), collapseSpaces(lead && lead.last_name)].filter(Boolean).join(" ");
  return combined || nameFromFormData(lead);
}

export function leadSortName(lead) {
  const combined = collapseSpaces([(lead && lead.last_name) || "", (lead && lead.first_name) || ""].join(" "));
  return (combined || nameFromFormData(lead)).toLowerCase();
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
  ...NAME_FIELD_KEYS, // promoted into the Name column — don't repeat in details
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

/** Just the date part (YYYY-MM-DD) of a created_at timestamp. */
export function receivedDate(lead) {
  const ts = lead && lead.created_at;
  return ts ? String(ts).slice(0, 10) : "";
}

/** Local wall-clock time the lead came in, e.g. "10:32 AM" — "" if unknown. */
export function receivedTime(lead) {
  const ts = lead && lead.created_at;
  if (!ts) return "";
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** Captured file attachments (e.g. employment résumés) for a lead — always an array. */
export function leadAttachments(lead) {
  const a = lead && lead.attachments;
  return Array.isArray(a) ? a.filter((f) => f && f.path) : [];
}

/** Human-readable file size, e.g. "84 KB". "" when unknown. */
export function fmtFileSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Where the submission came from, for the captured-event note. */
export function leadSourceLabel(lead) {
  const text = `${(lead && lead.raw_email_subject) || ""} ${(lead && lead.source_detail) || ""}`.toLowerCase();
  if (text.includes("availability")) return "availability form";
  if (text.includes("booking form")) return "booking form";
  if (text.includes("web form")) return "web form";
  return "website form";
}

/**
 * Synthetic "captured" entry — the historical record of why each lead is in the
 * CRM (its source), dated to its creation, pre-seeding the first follow-up for
 * that day. Always present, so every lead has at least one logged update.
 */
export function capturedUpdate(lead) {
  if (!lead || !lead.id) return null;
  const day = receivedDate(lead);
  return {
    id: `captured-${lead.id}`,
    lead_id: lead.id,
    update_type: "note",
    notes: `Lead captured from the ${leadSourceLabel(lead)} via Ignite.`,
    next_follow_up_date: day || null,
    created_by_name: "Ignite",
    created_at: lead.created_at || null,
    system: true,
  };
}

/** A lead's real updates plus the synthetic captured baseline (the oldest entry). */
export function leadUpdates(lead, updatesByLead) {
  const real = (lead && updatesByLead && updatesByLead[lead.id]) || [];
  const base = capturedUpdate(lead);
  return base ? [...real, base] : [...real];
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

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

// A general "Contact Form" from the /contact-us/ page is an Ignite web form, NOT
// the booking/availability form this CRM is for. Identify it so it's excluded —
// unless it actually carries booking intent (a service or date), which wins.
export function isGeneralContactForm(lead) {
  const fd = (lead && lead.form_data) || {};
  const has = (v) => v != null && String(v).trim() !== "";
  if (has(fd.desired_service) || has(fd.desired_date_of_boarding_or_day_care) || has(fd.service_interest)) return false;
  return /contact-us|contact_us|\/contact(\/|$|\?)/i.test(String(fd.lead_page_url || ""));
}

/**
 * Booking is the default; obvious hiring inquiries go to employment, and general
 * contact-us web forms are split out as "contact" so they can be excluded.
 */
export function classifySubmissionCategory(lead) {
  const haystack = buildClassifierHaystack(lead);
  if (EMPLOYMENT_KEYWORDS.some((kw) => haystack.includes(kw))) return "employment";
  if (isGeneralContactForm(lead)) return "contact";
  return "booking";
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

/**
 * A lead belongs in the CRM only if it's a web form, not a Gingr appointment, and
 * not a general contact-us web form (those aren't the booking/availability form).
 */
export function isCrmSubmission(lead) {
  return isWebForm(lead) && !isAppointment(lead) && classifySubmissionCategory(lead) !== "contact";
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

// Some submissions land with first/last (and phone/email) only inside form_data,
// not the top-level columns. Resolve from either so the row columns always match
// the expanded detail.
function leadFormData(lead) {
  return (lead && lead.form_data && typeof lead.form_data === "object") ? lead.form_data : {};
}
function resolveFirstLast(lead) {
  const fd = leadFormData(lead);
  const first = collapseSpaces(lead && lead.first_name) || collapseSpaces(fd.first_name);
  const last = collapseSpaces(lead && lead.last_name) || collapseSpaces(fd.last_name);
  return { first, last };
}

/** Combine first + last into one clean name; fall back to a form_data name field. */
export function cleanLeadName(lead) {
  const { first, last } = resolveFirstLast(lead);
  const combined = [first, last].filter(Boolean).join(" ");
  return combined || nameFromFormData(lead);
}

export function leadSortName(lead) {
  const { first, last } = resolveFirstLast(lead);
  const combined = [last, first].filter(Boolean).join(" ");
  return (combined || nameFromFormData(lead)).toLowerCase();
}

/** The lead's phone — top-level column or form_data (phone / phone_number), raw. */
export function leadPhone(lead) {
  const fd = leadFormData(lead);
  return collapseSpaces(lead && lead.phone) || collapseSpaces(fd.phone) || collapseSpaces(fd.phone_number) || "";
}

/** The lead's email — top-level column or form_data (email_address / email). */
export function leadEmail(lead) {
  const fd = leadFormData(lead);
  return collapseSpaces(lead && lead.email) || collapseSpaces(fd.email_address) || collapseSpaces(fd.email) || "";
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

// ─────────────────────────────────────────────────────────────────────────────
// Canonical field schema — ONE defined, ordered list per category, grouped into
// Contact → Location → Request so every expanded record is laid out identically
// and reads at a glance (CRM best practice: chunk into labelled sections, bold
// the few key values, mute the metadata). The upstream forms capture the same
// data under different keys (email/email_address, zip/zip_code, phone/phone_number,
// first+last/full_name); each field pulls the first synonym present (`resolve`
// or `from`), and a field the record didn't capture renders as a placeholder —
// never a dropped or reordered row. `group` = section; `emphasis` = a key value
// to bold; `long` = free-text that spans the full width (rendered as a callout).
// ─────────────────────────────────────────────────────────────────────────────

const CONTACT_FIELDS = [
  { key: "email", label: "Email", group: "contact", resolve: leadEmail },
  { key: "phone", label: "Phone", group: "contact", resolve: leadPhone, format: formatPhonePretty },
  { key: "preferred_time", label: "Preferred time to reach", group: "contact", from: ["preferred_time_to_be_reached"] },
  { key: "zip", label: "ZIP", group: "location", from: ["zip_code", "zip"] },
  { key: "city", label: "City", group: "location", from: ["city"] },
  { key: "state", label: "State", group: "location", from: ["state"] },
  { key: "desired_service", label: "Desired service", group: "request", emphasis: true, from: ["desired_service", "service_interest"] },
  { key: "desired_dates", label: "Desired date(s)", group: "request", emphasis: true, from: ["desired_date_of_boarding_or_day_care"] },
  { key: "details", label: "Details", group: "request", long: true, from: ["details", "how_can_we_help_you", "message"] },
];

const EMPLOYMENT_FIELDS = [
  { key: "email", label: "Email", group: "contact", resolve: leadEmail },
  { key: "phone", label: "Phone", group: "contact", resolve: leadPhone, format: formatPhonePretty },
  { key: "zip", label: "ZIP", group: "location", from: ["zip_code", "zip"] },
  { key: "city", label: "City", group: "location", from: ["city"] },
  { key: "state", label: "State", group: "location", from: ["state"] },
  { key: "position", label: "Position of interest", group: "request", emphasis: true, from: ["what_type_of_position_are_you_interested_in"] },
  { key: "availability", label: "Full-time or part-time", group: "request", emphasis: true, from: ["are_you_interested_in_full_time_or_part_time"] },
  { key: "reason", label: "Reason for contact", group: "request", from: ["reason_for_contact"] },
  { key: "skills", label: "Special skills", group: "request", long: true, from: ["what_are_some_special_skills_you_may_have"] },
  { key: "about", label: "About the applicant", group: "request", long: true, from: ["tell_us_a_bit_about_yourself"] },
];

const FORM_FIELD_GROUP_ORDER = ["contact", "location", "request"];
const FORM_FIELD_GROUP_LABELS = {
  contact: { booking: "Contact", employment: "Contact" },
  location: { booking: "Location", employment: "Location" },
  request: { booking: "Request", employment: "Application" },
};

export const FORM_FIELD_SCHEMAS = { booking: CONTACT_FIELDS, employment: EMPLOYMENT_FIELDS };

function pickFieldValue(lead, fd, f) {
  if (f.resolve) return f.resolve(lead);
  if (f.lead && lead && lead[f.lead] != null) {
    const v = collapseSpaces(lead[f.lead]);
    if (v) return v;
  }
  for (const k of f.from) {
    const raw = fd[k];
    if (raw != null && typeof raw !== "object") {
      const v = collapseSpaces(raw);
      if (v) return v;
    }
  }
  return "";
}

/**
 * The canonical, ordered field list for a submission, chosen by category. Always
 * returns the same fields in the same order — value "" when the record didn't
 * capture that field — so every expanded record is structured identically.
 * Returns [{ key, label, value, long, group, emphasis }].
 */
export function canonicalFormFields(lead) {
  const fd = (lead && lead.form_data && typeof lead.form_data === "object") ? lead.form_data : {};
  const schema = classifySubmissionCategory(lead) === "employment" ? EMPLOYMENT_FIELDS : CONTACT_FIELDS;
  return schema.map((f) => {
    let value = pickFieldValue(lead, fd, f);
    if (value && f.format) value = f.format(value);
    return { key: f.key, label: f.label, value, long: !!f.long, group: f.group, emphasis: !!f.emphasis };
  });
}

/**
 * Canonical fields grouped into ordered sections (Contact → Location → Request),
 * each with a category-aware label. Returns [{ id, label, fields }] for the
 * grouped detail layout — contact for outreach, a muted address, the request last
 * and emphasized.
 */
export function groupedFormFields(lead) {
  const cat = classifySubmissionCategory(lead) === "employment" ? "employment" : "booking";
  const byGroup = new Map();
  for (const f of canonicalFormFields(lead)) {
    if (!byGroup.has(f.group)) byGroup.set(f.group, []);
    byGroup.get(f.group).push(f);
  }
  return FORM_FIELD_GROUP_ORDER
    .filter((g) => byGroup.has(g))
    .map((g) => ({ id: g, label: FORM_FIELD_GROUP_LABELS[g][cat], fields: byGroup.get(g) }));
}

/** How many of the canonical fields the record actually captured (badge count + search). */
export function populatedFieldCount(lead) {
  return canonicalFormFields(lead).filter((f) => f.value).length;
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
    notes: classifySubmissionCategory(lead) === "employment" ? "Employment application received" : "Booking form received",
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

/**
 * Global change-history across every CRM lead — one row per logged update, newest
 * first. Each row records WHO (actor), WHAT lead, the action TYPE, the follow-up
 * transition (previous date -> new date, for the crossed-off "state change"), the
 * note, and WHEN. Mirrors the Training History timeline, fed by ignite_lead_updates.
 */
export function buildLeadHistoryRows(leads, updatesByLead) {
  const rows = [];
  for (const lead of leads || []) {
    if (!isCrmSubmission(lead)) continue;
    const leadName = cleanLeadName(lead) || "Lead";
    // Oldest -> newest so we can read each follow-up transition off the prior one.
    const ups = leadUpdates(lead, updatesByLead)
      .slice()
      .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
    let prevFollowUp = "";
    for (const u of ups) {
      const newFollowUp = u.next_follow_up_date || "";
      rows.push({
        id: u.id,
        leadId: lead.id,
        leadName,
        actor: u.created_by_name || "Ignite",
        createdAt: u.created_at || null,
        type: u.update_type || "note",
        notes: u.notes || "",
        prevFollowUp,
        newFollowUp,
        system: !!u.system,
      });
      if (newFollowUp) prevFollowUp = newFollowUp;
    }
  }
  return rows.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

/** Group history rows by local calendar day (YYYY-MM-DD), newest day first. */
export function groupLeadHistoryByDay(rows) {
  const byDay = new Map();
  for (const r of rows || []) {
    const day = r.createdAt ? String(r.createdAt).slice(0, 10) : "unknown";
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(r);
  }
  return [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([day, items]) => ({ day, items }));
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

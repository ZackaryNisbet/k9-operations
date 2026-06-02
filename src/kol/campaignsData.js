// K9 Operations — CRM Email Campaigns model (pure, framework-free)
//
// Logic half of the Campaigns page (src/kol/pages/CampaignsPage.jsx): the email-blast
// audience (resolved from the SAME ignite_leads + crmData rules the CRM page uses, so a
// campaign's recipients always match what the owner sees in the CRM), the merge-tag
// catalog + substitution, campaign status vocabulary, send-readiness + rate metrics,
// payload builders, and the K9 Resorts brand kit the lead-facing email is themed with.
//
// Free of React / theme / Supabase so every helper is unit-testable in isolation
// (see src/__tests__/campaignsData.test.js). Only imports the framework-free CRM module.

import {
  isCrmSubmission,
  classifySubmissionCategory,
  leadEmail,
  leadPhone,
  cleanLeadName,
  leadStatusValue,
  canonicalFormFields,
  localDay,
  CRM_LEAD_STATUSES,
} from "./crmData.js";

// ─────────────────────────────────────────────────────────────────────────────
// Brand kits. The editor *chrome* (what the marketing team sees) matches K9
// Operations (DESIGN.md); the email *content* (what leads receive) is K9 Resorts.
// ─────────────────────────────────────────────────────────────────────────────

/** K9 Operations internal palette — themes the Stripo editor UI to match the app. */
export const K9_OPERATIONS_BRAND = {
  primary: "#14532D",      // Deep Forest Green
  primaryLight: "#166534",
  accent: "#84CC16",       // Electric Lime
  text: "#0F172A",
  border: "#E2E8F0",
  surface: "#FFFFFF",
};

/** K9 Resorts brand — lead-facing email content (logo + colors pulled from the
 *  BlueGold logo SVG already in /public). Navy + gold. */
export const K9_RESORTS_BRAND = {
  name: "K9 Resorts Luxury Pet Hotel",
  navy: "#183661",
  gold: "#AF8D54",
  navyDark: "#0F2240",
  ink: "#1F2937",
  muted: "#6B7280",
  surface: "#FFFFFF",
  pageBackground: "#F4F6F9",
  logoUrl: "/labor/roster-brand-assets/K9Resorts_Horizontal_Logo_BlueGold_RGB.png",
  websiteUrl: "https://www.k9resorts.com",
  // CAN-SPAM requires a physical postal address in every marketing email.
  postalAddress: "K9 Resorts Luxury Pet Hotel",
};

/** Brand color swatches offered inside the editor (so designs stay on K9 Resorts brand). */
export const EDITOR_BRAND_PALETTE = [
  { name: "K9 Navy", value: K9_RESORTS_BRAND.navy },
  { name: "K9 Gold", value: K9_RESORTS_BRAND.gold },
  { name: "Navy Dark", value: K9_RESORTS_BRAND.navyDark },
  { name: "Ink", value: K9_RESORTS_BRAND.ink },
  { name: "White", value: "#FFFFFF" },
];

export const DEFAULT_FROM_NAME = "K9 Resorts";
export const DEFAULT_FROM_EMAIL = "marketing@k9operations.com";

// ─────────────────────────────────────────────────────────────────────────────
// Campaign status vocabulary (email_campaigns.status). `closed` = terminal.
// ─────────────────────────────────────────────────────────────────────────────
export const CAMPAIGN_STATUSES = [
  { value: "draft",     label: "Draft",     short: "Draft",     tone: "neutral", bg: "#F1F5F9", fg: "#475569" },
  { value: "scheduled", label: "Scheduled", short: "Scheduled", tone: "info",    bg: "#DBEAFE", fg: "#1E40AF" },
  { value: "sending",   label: "Sending",   short: "Sending",   tone: "warning", bg: "#FEF3C7", fg: "#92400E" },
  { value: "sent",      label: "Sent",      short: "Sent",      tone: "success", bg: "#DCFCE7", fg: "#166534", closed: true },
  { value: "failed",    label: "Failed",    short: "Failed",    tone: "danger",  bg: "#FEE2E2", fg: "#991B1B", closed: true },
  { value: "canceled",  label: "Canceled",  short: "Canceled",  tone: "neutral", bg: "#F1F5F9", fg: "#64748B", closed: true },
];
const CAMPAIGN_STATUS_MAP = new Map(CAMPAIGN_STATUSES.map((s) => [s.value, s]));
export const CAMPAIGN_DEFAULT_STATUS = "draft";

export function getCampaignStatusMeta(value) {
  return CAMPAIGN_STATUS_MAP.get(value) || CAMPAIGN_STATUSES[0];
}
/** A campaign can still be composed/edited only while it's a draft. */
export function isEditableCampaign(campaign) {
  return !campaign || campaign.status === "draft" || campaign.status === "scheduled";
}

// ─────────────────────────────────────────────────────────────────────────────
// Audience — which booking-form leads a campaign targets. Resolved from the SAME
// rules as the CRM page (isCrmSubmission / category / status / a real email).
// ─────────────────────────────────────────────────────────────────────────────

/** The lead-pipeline stages a campaign can target (reuses the CRM status vocab). */
export const CAMPAIGN_AUDIENCE_STATUSES = CRM_LEAD_STATUSES;

/** A lead is emailable if it's a real CRM submission AND has a deliverable address. */
export function isEmailableLead(lead) {
  return isCrmSubmission(lead) && isValidEmail(leadEmail(lead));
}

/**
 * Resolve the leads a campaign would email, given the audience filter:
 *   { statuses: string[] (empty ⇒ all stages), includeEmployment: boolean }
 * Booking submissions by default; employment inquiries only when opted in.
 */
export function resolveAudienceLeads(leads, audience = {}) {
  const statuses = Array.isArray(audience.statuses) ? audience.statuses.filter(Boolean) : [];
  const statusSet = statuses.length ? new Set(statuses) : null;
  const includeEmployment = !!audience.includeEmployment;
  return (leads || []).filter((lead) => {
    if (!isEmailableLead(lead)) return false;
    const category = classifySubmissionCategory(lead);
    if (category === "employment" && !includeEmployment) return false;
    if (category !== "employment" && category !== "booking") return false;
    if (statusSet && !statusSet.has(leadStatusValue(lead))) return false;
    return true;
  });
}

/** Per-stage count of emailable leads (drives the audience picker pills). */
export function audienceCountsByStatus(leads, { includeEmployment = false } = {}) {
  const counts = Object.create(null);
  for (const s of CAMPAIGN_AUDIENCE_STATUSES) counts[s.value] = 0;
  for (const lead of leads || []) {
    if (!isEmailableLead(lead)) continue;
    const category = classifySubmissionCategory(lead);
    if (category === "employment" && !includeEmployment) continue;
    if (category !== "employment" && category !== "booking") continue;
    const status = leadStatusValue(lead);
    counts[status] = (counts[status] || 0) + 1;
  }
  return counts;
}

/** A short human summary of the audience filter, e.g. "New, Talking · Booking". */
export function audienceSummary(audience = {}) {
  const statuses = Array.isArray(audience.statuses) ? audience.statuses.filter(Boolean) : [];
  const stageLabel = statuses.length === 0
    ? "All open leads"
    : statuses
        .map((v) => (CRM_LEAD_STATUSES.find((s) => s.value === v) || {}).short || v)
        .join(", ");
  const scope = audience.includeEmployment ? "Booking + employment" : "Booking";
  return `${stageLabel} · ${scope}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Merge tags — personalization tokens the marketer inserts in the editor, mapped
// to a lead's fields. `value` is what's embedded in the HTML; substitution happens
// here (preview) and server-side (send). Keep keys in sync with leadMergeData().
// ─────────────────────────────────────────────────────────────────────────────
export const MERGE_TAGS = [
  {
    category: "Lead",
    entries: [
      { label: "First name", value: "{{first_name}}", hint: "Recipient's first name (falls back to “there”)" },
      { label: "Last name", value: "{{last_name}}", hint: "Recipient's last name" },
      { label: "Full name", value: "{{full_name}}", hint: "Recipient's full name" },
      { label: "Email", value: "{{email}}", hint: "Recipient's email address" },
      { label: "Phone", value: "{{phone}}", hint: "Recipient's phone number" },
    ],
  },
  {
    category: "Inquiry",
    entries: [
      { label: "Desired service", value: "{{desired_service}}", hint: "Service the lead asked about" },
      { label: "Desired date(s)", value: "{{desired_dates}}", hint: "Date(s) the lead requested" },
      { label: "City", value: "{{city}}", hint: "Lead's city" },
      { label: "State", value: "{{state}}", hint: "Lead's state" },
    ],
  },
  {
    category: "Brand",
    entries: [
      { label: "Resort name", value: "{{resort_name}}", hint: "K9 Resorts" },
    ],
  },
];

/** Flat map of every supported merge-tag key (for validation / substitution). */
export const MERGE_TAG_KEYS = MERGE_TAGS.flatMap((g) => g.entries.map((e) => e.value.replace(/[{}]/g, "").trim()));

/** Build the personalization payload for one lead (snapshotted onto each recipient). */
export function leadMergeData(lead) {
  const fields = canonicalFormFields(lead);
  const byKey = Object.create(null);
  for (const f of fields) byKey[f.key] = f.value || "";
  const full = cleanLeadName(lead);
  const [first, ...rest] = String(full || "").split(/\s+/).filter(Boolean);
  return {
    first_name: first || "",
    last_name: rest.join(" ") || "",
    full_name: full || "",
    email: leadEmail(lead),
    phone: leadPhone(lead),
    desired_service: byKey.desired_service || "",
    desired_dates: byKey.desired_dates || "",
    city: byKey.city || "",
    state: byKey.state || "",
    resort_name: K9_RESORTS_BRAND.name,
  };
}

/**
 * Replace {{merge_tags}} in an HTML string from a data map. Unknown/empty tags
 * collapse to "" (so a missing field never prints "{{phone}}"); first_name and
 * full_name fall back to a friendly greeting so emails never read "Hi ,".
 */
export function applyMergeTags(html, data = {}) {
  if (!html) return "";
  const greetingFallback = "there";
  return String(html).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, rawKey) => {
    const key = rawKey.trim();
    const raw = data[key];
    const value = raw == null ? "" : String(raw).trim();
    if (value) return value;
    if (key === "first_name" || key === "full_name") return greetingFallback;
    return "";
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Send readiness + rate metrics
// ─────────────────────────────────────────────────────────────────────────────

export function isValidEmail(email) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email || "").trim());
}

/** Why a campaign can't be sent yet (null = ready). */
export function campaignBlockReason(campaign, recipientCount) {
  if (!campaign) return "No campaign";
  if (!String(campaign.subject || "").trim()) return "Add a subject line";
  if (!String(campaign.compiled_html || "").trim()) return "Design the email first";
  if (!isValidEmail(campaign.from_email)) return "Set a valid sender address";
  if (!recipientCount) return "No recipients match this audience";
  return null;
}
export function canSendCampaign(campaign, recipientCount) {
  return campaignBlockReason(campaign, recipientCount) == null;
}

function pct(part, whole) {
  const w = Number(whole) || 0;
  if (w <= 0) return 0;
  return Math.round((Number(part || 0) / w) * 1000) / 10; // one decimal
}

/** Open/click/bounce rates as percentages (of delivered, falling back to sent). */
export function campaignRates(campaign) {
  const c = campaign || {};
  const base = Number(c.delivered_count) || Number(c.sent_count) || 0;
  return {
    delivered: base,
    openRate: pct(c.opened_count, base),
    clickRate: pct(c.clicked_count, base),
    bounceRate: pct(c.bounced_count, Number(c.sent_count) || base),
    unsubscribeRate: pct(c.unsubscribed_count, base),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Payload builders (Supabase rows)
// ─────────────────────────────────────────────────────────────────────────────

function actorFields(actor, { creating } = {}) {
  const out = {
    updated_by_user_id: actor?.userId || null,
    updated_by_name: actor?.name || null,
  };
  if (creating) {
    out.created_by_user_id = actor?.userId || null;
    out.created_by_name = actor?.name || null;
  }
  return out;
}

/** A blank draft campaign for the composer. */
export function makeBlankCampaign(locationId) {
  return {
    location_id: locationId,
    name: "",
    subject: "",
    preheader: "",
    from_name: DEFAULT_FROM_NAME,
    from_email: DEFAULT_FROM_EMAIL,
    reply_to: "",
    design: {},
    compiled_html: "",
    audience: { statuses: [], includeEmployment: false },
    status: "draft",
    isDraft: true,
  };
}

/** Insert/update payload for a campaign (drops UI-only keys like isDraft). */
export function buildCampaignPayload(draft, locationId, actor) {
  const audience = draft.audience && typeof draft.audience === "object"
    ? { statuses: Array.isArray(draft.audience.statuses) ? draft.audience.statuses : [], includeEmployment: !!draft.audience.includeEmployment }
    : { statuses: [], includeEmployment: false };
  return {
    location_id: locationId,
    name: String(draft.name || "").trim() || "Untitled campaign",
    subject: String(draft.subject || "").trim(),
    preheader: String(draft.preheader || "").trim() || null,
    from_name: String(draft.from_name || "").trim() || DEFAULT_FROM_NAME,
    from_email: String(draft.from_email || "").trim() || DEFAULT_FROM_EMAIL,
    reply_to: String(draft.reply_to || "").trim() || null,
    template_id: draft.template_id || null,
    design: draft.design || {},
    compiled_html: draft.compiled_html || null,
    audience,
    audience_summary: audienceSummary(audience),
    ...actorFields(actor, { creating: !!draft.isDraft }),
  };
}

/** Insert/update payload for a reusable template. */
export function buildTemplatePayload(draft, locationId, actor) {
  return {
    location_id: locationId,
    name: String(draft.name || "").trim() || "Untitled template",
    subject: String(draft.subject || "").trim(),
    preheader: String(draft.preheader || "").trim() || null,
    design: draft.design || {},
    compiled_html: draft.compiled_html || null,
    thumbnail_url: draft.thumbnail_url || null,
    ...actorFields(actor, { creating: !!draft.isDraft }),
  };
}

/** The recipient snapshots passed to crm_email_prepare_send(campaign_id, recipients). */
export function buildRecipientRows(leads) {
  return resolveAudienceLeadsToRows(leads);
}
function resolveAudienceLeadsToRows(leads) {
  return (leads || []).map((lead) => ({
    lead_id: lead.id != null ? String(lead.id) : null,
    email: leadEmail(lead),
    first_name: leadMergeData(lead).first_name,
    last_name: leadMergeData(lead).last_name,
    merge_data: leadMergeData(lead),
  }));
}

/**
 * Resolve + snapshot the recipients for a campaign in one step: the leads matching
 * the audience, minus any suppressed address. `suppressed` is a Set/array of emails.
 */
export function buildCampaignRecipients(leads, audience, suppressed) {
  const suppressedSet = suppressed instanceof Set
    ? suppressed
    : new Set((suppressed || []).map((e) => String(e || "").toLowerCase()));
  const matched = resolveAudienceLeads(leads, audience);
  const rows = [];
  const seen = new Set();
  let suppressedCount = 0;
  for (const lead of matched) {
    const email = leadEmail(lead).toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    if (suppressedSet.has(email)) { suppressedCount += 1; continue; }
    rows.push(resolveAudienceLeadsToRows([lead])[0]);
  }
  return { rows, suppressedCount, matchedCount: matched.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// History (email_campaign_history) — formatting + day grouping for the History tab
// ─────────────────────────────────────────────────────────────────────────────
export const CAMPAIGN_HISTORY_EVENT_LABELS = {
  created: "Created",
  updated: "Edited",
  scheduled: "Scheduled",
  sent: "Sent",
  canceled: "Canceled",
  deleted: "Deleted",
};
export function campaignHistoryEventLabel(type) {
  return CAMPAIGN_HISTORY_EVENT_LABELS[type] || "Changed";
}
export function campaignHistoryEventTone(type) {
  if (type === "created" || type === "sent") return "success";
  if (type === "deleted" || type === "canceled") return "danger";
  if (type === "scheduled") return "info";
  return "info";
}

/** Group history rows by local calendar day (YYYY-MM-DD), newest day first. */
export function groupCampaignHistoryByDay(rows) {
  const byDay = new Map();
  for (const r of rows || []) {
    const day = localDay(r.event_at) || "unknown";
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(r);
  }
  return [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([day, items]) => ({ day, items }));
}

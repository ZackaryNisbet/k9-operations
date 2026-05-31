// K9 Operations — Ignite onboarding model (pure, framework-free)
//
// The self-serve onboarding logic behind IgniteOnboardingWizard.jsx: validation,
// the exact ignite_config / lite_settings payloads the wizard writes, the live
// test-email construction, and result interpretation. Kept free of React /
// supabase / theme so it's unit-testable in isolation (see
// src/__tests__/igniteOnboarding.test.js).
//
// Reality notes (verified against the live project):
//   • ignite_config columns are: location_id (uuid), ignite_profile_id (text),
//     inbound_email (text), is_active (bool). The edge function routes a lead by
//     matching ignite_profile_id on an is_active row — so writing this row is
//     what actually "turns on" a location.
//   • The legacy Ignite settings tab persisted a JSON blob to lite_settings
//     (keys: profileNumber / emailForward / connected); we mirror it so that tab
//     keeps showing the right status.

import { IGNITE_SENDER_EMAIL } from "../../ignite/constants.js";
import { SAMPLE_WEB_FORM_EMAIL, SAMPLE_PHONE_CALL_EMAIL, SAMPLE_AD_CLICK_EMAIL } from "../../ignite/sampleEmails.js";

export { IGNITE_SENDER_EMAIL };

// The profile id baked into the sample emails — swapped for the real one on test.
export const SAMPLE_PROFILE_TOKEN = "IGN-7842";

export const TEST_SAMPLES = {
  web_form: SAMPLE_WEB_FORM_EMAIL,
  phone_call: SAMPLE_PHONE_CALL_EMAIL,
  ad_click: SAMPLE_AD_CLICK_EMAIL,
};

// Ignite is paired once per location and the setup is restricted to location
// admins and up (a CSR shouldn't be wiring integrations). These are the raw
// role strings that resolve to location_admin or higher.
export const IGNITE_ADMIN_ROLES = new Set([
  "location_admin", "admin",
  "multi_location_admin", "multi_loc_admin", "regional",
  "enterprise_admin", "owner", "developer",
  "role_owner", "role_enterprise_admin",
]);

export function canManageIgnite(profile) {
  const role = String((profile && (profile.role || profile.role_code)) || "").toLowerCase().trim();
  return IGNITE_ADMIN_ROLES.has(role);
}

export const IGNITE_WEBHOOK_PATH = "/functions/v1/ignite-webhook";

// The single K9 Ops inbound address every location forwards booking-form emails
// to. Routing to the right location happens by the website slug in the email
// body, so one shared address works for all locations.
export const IGNITE_INBOUND_ADDRESS = "leads@inbound.k9operations.com";

/** Build the edge-function URL from a Supabase project URL. */
export function igniteWebhookUrl(supabaseUrl) {
  const base = String(supabaseUrl || "").replace(/\/+$/, "");
  return `${base}${IGNITE_WEBHOOK_PATH}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Wizard steps
// ─────────────────────────────────────────────────────────────────────────────

export const WIZARD_STEPS = [
  { id: "intro", title: "Connect Ignite" },
  { id: "profile", title: "Profile ID" },
  { id: "forwarding", title: "Email forwarding" },
  { id: "activate", title: "Activate & test" },
  { id: "done", title: "Done" },
];

export function stepIndex(id) {
  return WIZARD_STEPS.findIndex((s) => s.id === id);
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

export function normalizeProfileId(raw) {
  return String(raw == null ? "" : raw).trim();
}

/** Does this input look like a pasted URL rather than a bare code? */
export function inputLooksLikeUrl(input) {
  return /https?:\/\/|idigitalstrategies|\/profile\/|\.com/i.test(String(input || ""));
}

/**
 * Pull the numeric account/profile ID out of either a bare code or a pasted
 * Ignite URL — e.g. "leads.idigitalstrategies.com/profile/156865/leads" → "156865",
 * or "156865" → "156865". Returns "" when nothing usable is found.
 */
export function extractProfileId(input) {
  const raw = String(input == null ? "" : input).trim();
  if (!raw) return "";
  const profileMatch = raw.match(/profile\/(\d+)/i); // .../profile/156865/...
  if (profileMatch) return profileMatch[1];
  if (/^\d+$/.test(raw)) return raw; // bare numeric code
  if (inputLooksLikeUrl(raw)) {
    const digits = raw.match(/(\d{4,})/); // a URL with a long digit run
    if (digits) return digits[1];
  }
  return "";
}

export function validateProfileId(raw) {
  const value = extractProfileId(raw);
  if (!value) return { ok: false, error: "Paste your Ignite leads URL or type the numeric ID." };
  return { ok: true, value };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Inbound/forwarding address is optional, but must look like an email if given. */
export function validateInboundEmail(raw) {
  const value = String(raw == null ? "" : raw).trim();
  if (!value) return { ok: true, value: "" };
  if (!EMAIL_RE.test(value)) return { ok: false, error: "That doesn't look like a valid email address." };
  return { ok: true, value };
}

/** Can the user advance past a given step with the current draft? */
export function canAdvance(stepId, draft = {}) {
  if (stepId === "profile") return validateProfileId(draft.profileId).ok;
  if (stepId === "forwarding") return validateInboundEmail(draft.inboundEmail).ok;
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistence payloads
// ─────────────────────────────────────────────────────────────────────────────

/** The row written to the real ignite_config table (the edge function reads this). */
export function buildIgniteConfigPayload({ locationId, profileId, inboundEmail = "", isActive = true }) {
  return {
    location_id: locationId,
    ignite_profile_id: normalizeProfileId(profileId),
    inbound_email: String(inboundEmail || "").trim() || null,
    is_active: !!isActive,
  };
}

/** Mirror value for lite_settings (keeps the legacy Ignite settings tab in sync). */
export function buildLiteSettingsValue({ profileId, inboundEmail = "", connected = true }) {
  return {
    profileNumber: normalizeProfileId(profileId),
    emailForward: String(inboundEmail || "").trim(),
    connected: !!connected,
  };
}

/** Status badge from a fetched ignite_config row (or null). */
export function deriveConfigStatus(row) {
  if (!row) return "not_configured";
  return row.is_active ? "active" : "inactive";
}

// ─────────────────────────────────────────────────────────────────────────────
// Live connection test
// ─────────────────────────────────────────────────────────────────────────────

/** Swap the sample profile token (and the parsed field) for the real profile id. */
export function patchSampleProfileId(html, profileId) {
  const pid = normalizeProfileId(profileId);
  if (!pid) return html;
  let out = String(html || "").split(SAMPLE_PROFILE_TOKEN).join(pid);
  out = out.replace(/(data-field="ignite_profile_id"[^>]*>)[^<]*(<)/i, `$1${pid}$2`);
  return out;
}

/** Build the JSON body posted to the webhook for a live test. */
export function buildTestEmail(sample, profileId) {
  if (!sample) return null;
  return {
    from: sample.from,
    subject: sample.subject,
    html: patchSampleProfileId(sample.html, profileId),
    headers: { from: sample.from, subject: sample.subject },
  };
}

const FRIENDLY_ERRORS = [
  {
    match: /no active location configured/i,
    message:
      "No active location matched this Profile ID. Double-check the Profile ID matches the one in Ignite — we just saved it, so try the test again.",
  },
  {
    match: /not an ignite email/i,
    message: "The test email wasn't recognized as an Ignite email. This is unusual — contact support if it persists.",
  },
  {
    match: /RESEND_API_KEY/i,
    message: "The pipeline is reachable, but the email service key isn't set on the server yet.",
  },
];

export function friendlyTestError(message) {
  const msg = String(message || "");
  const hit = FRIENDLY_ERRORS.find((f) => f.match.test(msg));
  return hit ? hit.message : msg || "The test could not be completed.";
}

/**
 * Interpret a webhook test response into { success, message }.
 * @param {{ok:boolean, status:number, data:any}} resp
 */
export function interpretTestResult({ ok, status, data } = {}) {
  if (ok && data && data.success) {
    if (data.dryRun) {
      return { success: true, message: "Pipeline validated — a booking form routes to this location and parses cleanly. No test data was created." };
    }
    const status_ = data.matchStatus ? ` (${data.matchStatus})` : "";
    return { success: true, message: `Test lead received${status_}. The pipeline is live.` };
  }
  const raw = (data && data.error) || `HTTP ${status || "error"}`;
  return { success: false, message: friendlyTestError(raw) };
}

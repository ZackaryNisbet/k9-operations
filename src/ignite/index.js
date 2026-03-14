/**
 * Ignite Email Parser — Barrel Export
 * IGN-001 / IGN-002
 */

export { parseIgniteEmail, parseBrowser, parseRegex, normalizePhone } from './parser.js';
export {
  matchLeadToClient,
  classifyMatchStatus,
  matchLeadFromSupabase,
  addToReviewQueue,
  resolveReviewItem,
  fetchReviewQueue,
  normalizeEmail,
  computeNameConfidence,
  stringSimilarity,
  levenshtein,
  getCanonical,
  NICKNAME_MAP,
} from './matchClient.js';
export {
  processAndRouteLead,
  fetchUnmatchedLeads,
  fetchLeadsForClient,
  markLeadAsNewClient,
} from './leadRouter.js';
export { handleWebhook } from './edgeFunction.js';
export {
  IGNITE_SENDER_EMAIL,
  LEAD_TYPES,
  MATCH_STATUSES,
  MATCH_TYPES,
  CHERRY_HILL_LOCATION_ID,
  AUTO_MATCH_THRESHOLD,
  REVIEW_THRESHOLD,
  MATCH_CONFIDENCE,
} from './constants.js';
export {
  SAMPLE_WEB_FORM_EMAIL,
  SAMPLE_PHONE_CALL_EMAIL,
  SAMPLE_AD_CLICK_EMAIL,
  SAMPLE_HEADERS,
} from './sampleEmails.js';

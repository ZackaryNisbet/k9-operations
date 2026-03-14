/**
 * Ignite Email Parser — Shared Constants
 * IGN-001 / IGN-002
 */

export const IGNITE_SENDER_EMAIL = 'noreply@leads.idigitalstrategies.com';

export const LEAD_TYPES = {
  WEB_FORM: 'web_form',
  PHONE_CALL: 'phone_call',
  AD_CLICK: 'ad_click',
};

export const MATCH_STATUSES = {
  NEW: 'new',
  MATCHED: 'matched',
  REVIEW: 'review',
  NO_MATCH: 'no_match',
};

export const MATCH_TYPES = {
  EMAIL: 'email',
  PHONE: 'phone',
  NAME: 'name',
  PHONE_NAME: 'phone_name', // phone + partial name combo
};

/** Adair Forsythe flagship location */
export const CHERRY_HILL_LOCATION_ID = '11111111-1111-1111-1111-111111111111';

/** Minimum confidence threshold to auto-match (no review needed) */
export const AUTO_MATCH_THRESHOLD = 0.85;

/** Minimum confidence to enter review queue (below this = no_match) */
export const REVIEW_THRESHOLD = 0.5;

/** Confidence scores by match type */
export const MATCH_CONFIDENCE = {
  EMAIL_EXACT: 1.0,
  PHONE_EXACT: 0.95,
  PHONE_NAME_COMBO: 0.9,  // phone match + last name similarity
  NAME_HIGH: 0.8,         // very similar full name (>=0.9 composite)
  NAME_MEDIUM: 0.65,      // moderate name similarity (nickname/partial)
  NAME_LOW: 0.5,          // weak name similarity (review candidate)
};

/**
 * Ignite Email Parser — Shared Constants
 * IGN-001
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
};

/** Cherry Hill flagship location */
export const CHERRY_HILL_LOCATION_ID = '8ea382b0-63f7-44ac-b6f8-83243c03d946';

/** Minimum confidence threshold to auto-match */
export const AUTO_MATCH_THRESHOLD = 0.85;

/** Confidence scores by match type */
export const MATCH_CONFIDENCE = {
  EMAIL_EXACT: 1.0,
  PHONE_EXACT: 0.95,
  NAME_HIGH: 0.75,
  NAME_LOW: 0.5,
};

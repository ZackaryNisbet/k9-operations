/**
 * Ignite Email Parser
 * IGN-001
 *
 * Parses HTML notification emails from Ignite (iDigital Strategies).
 * Provides both a browser-compatible parser (DOMParser) and a lightweight
 * regex-based parser for Supabase Edge Function / Deno context.
 */

import { IGNITE_SENDER_EMAIL, LEAD_TYPES } from './constants.js';

/**
 * Normalize a phone number to a digits-only format (E.164-ish).
 * Strips formatting chars; prepends '1' for 10-digit US numbers.
 */
export function normalizePhone(raw) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return '1' + digits;
  if (digits.length === 11 && digits[0] === '1') return digits;
  return digits || null;
}

/**
 * Detect lead type from the email subject or body text.
 */
function detectLeadType(subject, bodyText) {
  const s = (subject || '').toLowerCase();
  const b = (bodyText || '').toLowerCase();
  if (s.includes('phone call') || b.includes('phone call')) return LEAD_TYPES.PHONE_CALL;
  if (s.includes('ad click') || b.includes('ad click')) return LEAD_TYPES.AD_CLICK;
  return LEAD_TYPES.WEB_FORM;
}

/**
 * Extract a name into first/last from either explicit fields or a combined "Caller Name".
 */
function extractName(fields) {
  let firstName = fields.first_name || '';
  let lastName = fields.last_name || '';

  if (!firstName && !lastName && fields.caller_name) {
    const parts = fields.caller_name.trim().split(/\s+/);
    firstName = parts[0] || '';
    lastName = parts.slice(1).join(' ') || '';
  }

  return { firstName: firstName.trim(), lastName: lastName.trim() };
}

// ─── Browser Parser (DOMParser) ───────────────────────────────────────────────

/**
 * Parse an Ignite email using the browser's DOMParser.
 * Best for in-app usage where DOMParser is available.
 */
export function parseBrowser(rawHtml) {
  const doc = new DOMParser().parseFromString(rawHtml, 'text/html');
  const fields = {};

  // Extract data-field attributes (structured emails)
  doc.querySelectorAll('[data-field]').forEach((el) => {
    const key = el.getAttribute('data-field');
    // For links, grab href if it's a recording URL
    if (el.tagName === 'A' && key === 'call_recording_url') {
      fields[key] = el.getAttribute('href') || el.textContent.trim();
    } else {
      fields[key] = el.textContent.trim();
    }
  });

  // Fallback: parse table rows as label → value pairs
  if (Object.keys(fields).length === 0) {
    doc.querySelectorAll('tr').forEach((row) => {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 2) {
        const label = cells[0].textContent.trim();
        const value = cells[1].textContent.trim();
        if (label && value) {
          const key = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_+$/, '');
          fields[key] = value;
          // Check for recording links
          const link = cells[1].querySelector('a');
          if (link && label.toLowerCase().includes('recording')) {
            fields.call_recording_url = link.getAttribute('href');
          }
        }
      }
    });
  }

  return fields;
}

// ─── Regex Parser (Edge Function / Deno) ──────────────────────────────────────

/**
 * Parse an Ignite email using regex only — no DOM required.
 * Suitable for Supabase Edge Functions (Deno) or any non-browser context.
 */
export function parseRegex(rawHtml) {
  const fields = {};

  // Extract data-field values: <span data-field="key">value</span> or <td data-field="key">value</td>
  const dataFieldRe = /<(?:span|td|div)[^>]*data-field="([^"]+)"[^>]*>([^<]*)</g;
  let m;
  while ((m = dataFieldRe.exec(rawHtml)) !== null) {
    fields[m[1]] = m[2].trim();
  }

  // Extract recording URLs from <a> tags with data-field
  const linkFieldRe = /<a[^>]*data-field="call_recording_url"[^>]*href="([^"]+)"[^>]*>/g;
  while ((m = linkFieldRe.exec(rawHtml)) !== null) {
    fields.call_recording_url = m[1];
  }

  // Fallback: extract table rows <td>Label</td><td>Value</td>
  if (Object.keys(fields).length === 0) {
    const rowRe = /<tr[^>]*>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi;
    while ((m = rowRe.exec(rawHtml)) !== null) {
      const label = m[1].replace(/<[^>]+>/g, '').trim();
      let value = m[2].replace(/<[^>]+>/g, '').trim();
      if (label && value) {
        const key = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_+$/, '');
        fields[key] = value;
      }
      // Check for recording link
      if (label.toLowerCase().includes('recording')) {
        const hrefMatch = m[2].match(/href="([^"]+)"/);
        if (hrefMatch) fields.call_recording_url = hrefMatch[1];
      }
    }
  }

  return fields;
}

// ─── Main Parser ──────────────────────────────────────────────────────────────

/**
 * Parse an Ignite notification email into a structured lead object.
 *
 * @param {string} rawHtml - The raw HTML body of the email
 * @param {object} headers - Email headers { from, subject, date, ... }
 * @param {object} [options] - { useRegex: boolean } — force regex parser (for edge functions)
 * @returns {object} Parsed lead data
 */
export function parseIgniteEmail(rawHtml, headers = {}, options = {}) {
  if (!rawHtml) {
    return { error: 'No email HTML provided', raw: null };
  }

  // Verify sender if headers are provided
  const from = headers.from || '';
  if (from && !from.includes(IGNITE_SENDER_EMAIL)) {
    return { error: `Unexpected sender: ${from}`, raw: rawHtml };
  }

  // Pick parser
  const useBrowser = !options.useRegex && typeof DOMParser !== 'undefined';
  const fields = useBrowser ? parseBrowser(rawHtml) : parseRegex(rawHtml);

  const subject = headers.subject || '';
  const leadType = detectLeadType(subject, fields.lead_type || '');
  const { firstName, lastName } = extractName(fields);

  // Build form_data from all fields (exclude already-promoted fields)
  const promotedKeys = new Set([
    'lead_type', 'first_name', 'last_name', 'caller_name',
    'email', 'phone', 'call_recording_url',
    'ignite_profile_id', 'ignite_location_id',
  ]);
  const formData = {};
  for (const [k, v] of Object.entries(fields)) {
    if (!promotedKeys.has(k)) formData[k] = v;
  }

  return {
    leadType,
    firstName,
    lastName,
    clientName: [firstName, lastName].filter(Boolean).join(' ') || null,
    email: (fields.email || '').toLowerCase() || null,
    phone: normalizePhone(fields.phone),
    phoneRaw: fields.phone || null,
    callRecordingUrl: fields.call_recording_url || null,
    sourceDetail: fields.source || fields.ad_campaign || fields.tracking_number || null,
    formData,
    igniteProfileId: fields.ignite_profile_id || null,
    igniteLocationId: fields.ignite_location_id || null,
    rawSubject: subject,
    parsedAt: new Date().toISOString(),
  };
}

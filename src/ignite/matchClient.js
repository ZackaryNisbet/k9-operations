/**
 * Ignite Lead → Client Matching
 * IGN-001
 *
 * Matches an incoming Ignite lead to existing clients by email, phone, or name.
 * No external dependencies — includes a simple Levenshtein implementation.
 */

import { normalizePhone } from './parser.js';
import { MATCH_TYPES, MATCH_CONFIDENCE } from './constants.js';

/**
 * Simple Levenshtein distance between two strings.
 */
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  // Use a single-row optimization
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array(n + 1);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,      // deletion
        curr[j - 1] + 1,  // insertion
        prev[j - 1] + cost // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/**
 * Compute string similarity as a value between 0 and 1.
 */
function stringSimilarity(a, b) {
  if (!a || !b) return 0;
  const la = a.toLowerCase().trim();
  const lb = b.toLowerCase().trim();
  if (la === lb) return 1;
  const maxLen = Math.max(la.length, lb.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(la, lb) / maxLen;
}

/**
 * Match an incoming lead to existing clients.
 *
 * @param {object} lead - Parsed lead from parseIgniteEmail: { email, phone, firstName, lastName }
 * @param {Array<object>} existingClients - Array of { id, email, phone, firstName, lastName }
 * @returns {{ matched: boolean, clientId: string|null, confidence: number, matchType: string|null }}
 */
export function matchLeadToClient(lead, existingClients) {
  if (!existingClients || existingClients.length === 0) {
    return { matched: false, clientId: null, confidence: 0, matchType: null };
  }

  let bestMatch = { matched: false, clientId: null, confidence: 0, matchType: null };

  const leadEmail = (lead.email || '').toLowerCase().trim();
  const leadPhone = normalizePhone(lead.phone);

  for (const client of existingClients) {
    // 1. Exact email match
    if (leadEmail && client.email) {
      const clientEmail = client.email.toLowerCase().trim();
      if (leadEmail === clientEmail) {
        return {
          matched: true,
          clientId: client.id,
          confidence: MATCH_CONFIDENCE.EMAIL_EXACT,
          matchType: MATCH_TYPES.EMAIL,
        };
      }
    }

    // 2. Normalized phone match
    if (leadPhone && client.phone) {
      const clientPhone = normalizePhone(client.phone);
      if (leadPhone === clientPhone) {
        if (MATCH_CONFIDENCE.PHONE_EXACT > bestMatch.confidence) {
          bestMatch = {
            matched: true,
            clientId: client.id,
            confidence: MATCH_CONFIDENCE.PHONE_EXACT,
            matchType: MATCH_TYPES.PHONE,
          };
        }
      }
    }

    // 3. Name similarity
    if (lead.firstName && lead.lastName && client.firstName && client.lastName) {
      const firstSim = stringSimilarity(lead.firstName, client.firstName);
      const lastSim = stringSimilarity(lead.lastName, client.lastName);
      const avgSim = (firstSim + lastSim) / 2;

      let nameConfidence = 0;
      if (avgSim >= 0.9) {
        nameConfidence = MATCH_CONFIDENCE.NAME_HIGH;
      } else if (avgSim >= 0.7) {
        nameConfidence = MATCH_CONFIDENCE.NAME_LOW;
      }

      if (nameConfidence > bestMatch.confidence) {
        bestMatch = {
          matched: nameConfidence >= MATCH_CONFIDENCE.NAME_LOW,
          clientId: client.id,
          confidence: nameConfidence,
          matchType: MATCH_TYPES.NAME,
        };
      }
    }
  }

  return bestMatch;
}

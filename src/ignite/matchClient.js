/**
 * Ignite Lead → Client Matching
 * IGN-002
 *
 * Enhanced matching: email, phone, name (Levenshtein + nickname + partial),
 * email-domain heuristic. Integrates with Supabase gingr_owners table
 * and provides a review queue for ambiguous matches.
 */

import { normalizePhone } from './parser.js';
import {
  MATCH_TYPES,
  MATCH_CONFIDENCE,
  AUTO_MATCH_THRESHOLD,
  REVIEW_THRESHOLD,
  MATCH_STATUSES,
} from './constants.js';

// ─── Nickname Map ────────────────────────────────────────────────────────────
// Common English nicknames → canonical first names (bidirectional lookup)
const NICKNAME_MAP = {
  mike: 'michael', michael: 'michael',
  mick: 'michael', mikey: 'michael',
  jen: 'jennifer', jennifer: 'jennifer',
  jenny: 'jennifer', jenn: 'jennifer',
  bob: 'robert', robert: 'robert',
  rob: 'robert', robby: 'robert', bobby: 'robert',
  bill: 'william', william: 'william',
  will: 'william', willy: 'william', billy: 'william',
  jim: 'james', james: 'james',
  jimmy: 'james', jamie: 'james',
  tom: 'thomas', thomas: 'thomas',
  tommy: 'thomas',
  dick: 'richard', richard: 'richard',
  rick: 'richard', ricky: 'richard', rich: 'richard',
  dave: 'david', david: 'david', davey: 'david',
  dan: 'daniel', daniel: 'daniel', danny: 'daniel',
  joe: 'joseph', joseph: 'joseph', joey: 'joseph',
  chris: 'christopher', christopher: 'christopher',
  matt: 'matthew', matthew: 'matthew', matty: 'matthew',
  pat: 'patrick', patrick: 'patrick', patty: 'patricia',
  patricia: 'patricia', trish: 'patricia', tricia: 'patricia',
  liz: 'elizabeth', elizabeth: 'elizabeth',
  beth: 'elizabeth', betsy: 'elizabeth', eliza: 'elizabeth',
  kate: 'katherine', katherine: 'katherine',
  kathy: 'katherine', katie: 'katherine', cathy: 'katherine',
  sue: 'susan', susan: 'susan', susie: 'susan',
  sam: 'samuel', samuel: 'samuel', sammy: 'samuel',
  samantha: 'samantha',
  steve: 'steven', steven: 'steven', stephen: 'steven',
  tony: 'anthony', anthony: 'anthony',
  al: 'albert', albert: 'albert', alex: 'alexander',
  alexander: 'alexander',
  ed: 'edward', edward: 'edward', eddie: 'edward', ted: 'edward',
  nick: 'nicholas', nicholas: 'nicholas', nicky: 'nicholas',
  greg: 'gregory', gregory: 'gregory',
  jeff: 'jeffrey', jeffrey: 'jeffrey',
  jon: 'jonathan', jonathan: 'jonathan',
  john: 'john', johnny: 'john', jack: 'john',
  charlie: 'charles', charles: 'charles', chuck: 'charles',
  larry: 'lawrence', lawrence: 'lawrence',
  andy: 'andrew', andrew: 'andrew', drew: 'andrew',
  josh: 'joshua', joshua: 'joshua',
  ben: 'benjamin', benjamin: 'benjamin', benny: 'benjamin',
  megan: 'margaret', margaret: 'margaret', maggie: 'margaret', meg: 'margaret',
  debbie: 'deborah', deborah: 'deborah', deb: 'deborah',
  becky: 'rebecca', rebecca: 'rebecca',
  barb: 'barbara', barbara: 'barbara',
  steph: 'stephanie', stephanie: 'stephanie',
  nate: 'nathaniel', nathaniel: 'nathaniel', nathan: 'nathaniel',
  vicky: 'victoria', victoria: 'victoria', vicki: 'victoria',
  mandy: 'amanda', amanda: 'amanda',
  teri: 'theresa', theresa: 'theresa', terry: 'theresa',
  sandy: 'sandra', sandra: 'sandra',
  peggy: 'margaret',
  teddy: 'theodore', theodore: 'theodore',
};

/**
 * Get the canonical name for nickname comparison.
 */
function getCanonical(name) {
  if (!name) return null;
  const lower = name.toLowerCase().trim();
  return NICKNAME_MAP[lower] || lower;
}

// ─── String Utilities ────────────────────────────────────────────────────────

/**
 * Simple Levenshtein distance between two strings.
 */
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

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
 * Check if one name starts with the other (partial/abbreviated match).
 * e.g., "Jon" matches "Jonathan", "Cath" matches "Catherine"
 */
function isPartialMatch(a, b) {
  if (!a || !b) return false;
  const la = a.toLowerCase().trim();
  const lb = b.toLowerCase().trim();
  if (la.length < 2 || lb.length < 2) return false;
  return la.startsWith(lb) || lb.startsWith(la);
}

/**
 * Compute name match confidence using multiple strategies:
 * 1. Direct Levenshtein similarity
 * 2. Nickname canonical comparison
 * 3. Partial/abbreviated match
 */
function computeNameConfidence(leadFirst, leadLast, clientFirst, clientLast) {
  if (!leadFirst || !leadLast || !clientFirst || !clientLast) return 0;

  // Last name similarity (weighted heavier — last names rarely have nicknames)
  const lastSim = stringSimilarity(leadLast, clientLast);
  if (lastSim < 0.6) return 0; // Last name must be reasonably close

  // Strategy 1: Direct first-name similarity
  const firstSim = stringSimilarity(leadFirst, clientFirst);

  // Strategy 2: Nickname canonical match
  const leadCanonical = getCanonical(leadFirst);
  const clientCanonical = getCanonical(clientFirst);
  const nicknameMatch = leadCanonical && clientCanonical && leadCanonical === clientCanonical;

  // Strategy 3: Partial/abbreviated first name
  const partial = isPartialMatch(leadFirst, clientFirst);

  // Pick the best first-name score
  let bestFirstScore = firstSim;
  if (nicknameMatch) bestFirstScore = Math.max(bestFirstScore, 0.92);
  if (partial && bestFirstScore < 0.7) bestFirstScore = Math.max(bestFirstScore, 0.7);

  // Weighted average: last name 55%, first name 45%
  return lastSim * 0.55 + bestFirstScore * 0.45;
}

/**
 * Normalize an email for comparison: lowercase, trim, strip dots from
 * Gmail local parts, strip +tags.
 */
function normalizeEmail(email) {
  if (!email) return null;
  let e = email.toLowerCase().trim();
  const atIdx = e.indexOf('@');
  if (atIdx === -1) return e;

  let local = e.slice(0, atIdx);
  const domain = e.slice(atIdx + 1);

  // Strip +tag (e.g., user+tag@gmail.com → user@gmail.com)
  const plusIdx = local.indexOf('+');
  if (plusIdx !== -1) local = local.slice(0, plusIdx);

  // Gmail ignores dots in local part
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    local = local.replace(/\./g, '');
  }

  return local + '@' + domain;
}

// ─── Main Matching ───────────────────────────────────────────────────────────

/**
 * Match an incoming lead to existing clients.
 *
 * @param {object} lead - Parsed lead: { email, phone, firstName, lastName }
 * @param {Array<object>} existingClients - Array of { id, email, phone, firstName, lastName }
 * @returns {{ matched: boolean, clientId: string|null, confidence: number, matchType: string|null, allMatches: Array }}
 */
export function matchLeadToClient(lead, existingClients) {
  const noMatch = { matched: false, clientId: null, confidence: 0, matchType: null, allMatches: [] };

  if (!existingClients || existingClients.length === 0) return noMatch;

  const leadEmail = normalizeEmail(lead.email);
  const leadPhone = normalizePhone(lead.phone);
  const allMatches = [];

  let bestMatch = { ...noMatch };

  for (const client of existingClients) {
    // 1. Email match (exact after normalization)
    if (leadEmail && client.email) {
      const clientEmail = normalizeEmail(client.email);
      if (leadEmail === clientEmail) {
        const match = {
          matched: true,
          clientId: client.id,
          confidence: MATCH_CONFIDENCE.EMAIL_EXACT,
          matchType: MATCH_TYPES.EMAIL,
        };
        allMatches.push(match);
        // Email exact is highest confidence — return immediately
        return { ...match, allMatches };
      }
    }

    // 2. Normalized phone match (handle multiple formats)
    if (leadPhone && client.phone) {
      const clientPhone = normalizePhone(client.phone);
      if (leadPhone && clientPhone && leadPhone === clientPhone) {
        const match = {
          matched: true,
          clientId: client.id,
          confidence: MATCH_CONFIDENCE.PHONE_EXACT,
          matchType: MATCH_TYPES.PHONE,
        };
        allMatches.push(match);
        if (match.confidence > bestMatch.confidence) {
          bestMatch = match;
        }
      }
    }

    // 3. Enhanced name matching (Levenshtein + nickname + partial)
    if (lead.firstName && lead.lastName && client.firstName && client.lastName) {
      const nameConf = computeNameConfidence(
        lead.firstName, lead.lastName,
        client.firstName, client.lastName,
      );

      let nameConfidence = 0;
      if (nameConf >= 0.9) {
        nameConfidence = MATCH_CONFIDENCE.NAME_HIGH;
      } else if (nameConf >= 0.7) {
        nameConfidence = MATCH_CONFIDENCE.NAME_MEDIUM;
      } else if (nameConf >= 0.55) {
        nameConfidence = MATCH_CONFIDENCE.NAME_LOW;
      }

      if (nameConfidence > 0) {
        const match = {
          matched: true,
          clientId: client.id,
          confidence: nameConfidence,
          matchType: MATCH_TYPES.NAME,
        };
        allMatches.push(match);
        if (nameConfidence > bestMatch.confidence) {
          bestMatch = match;
        }
      }
    }

    // 4. Phone + partial name combo (boosts confidence)
    if (leadPhone && client.phone && lead.lastName && client.lastName) {
      const clientPhone = normalizePhone(client.phone);
      if (leadPhone === clientPhone) {
        const lastSim = stringSimilarity(lead.lastName, client.lastName);
        if (lastSim >= 0.7) {
          const comboConf = MATCH_CONFIDENCE.PHONE_NAME_COMBO;
          if (comboConf > bestMatch.confidence) {
            const match = {
              matched: true,
              clientId: client.id,
              confidence: comboConf,
              matchType: MATCH_TYPES.PHONE_NAME,
            };
            allMatches.push(match);
            bestMatch = match;
          }
        }
      }
    }
  }

  return { ...bestMatch, allMatches };
}

/**
 * Classify a match result into a status for the review queue.
 *
 * @param {{ confidence: number, matched: boolean }} matchResult
 * @returns {string} One of MATCH_STATUSES values
 */
export function classifyMatchStatus(matchResult) {
  if (!matchResult.matched || matchResult.confidence === 0) {
    return MATCH_STATUSES.NO_MATCH;
  }
  if (matchResult.confidence >= AUTO_MATCH_THRESHOLD) {
    return MATCH_STATUSES.MATCHED;
  }
  if (matchResult.confidence >= REVIEW_THRESHOLD) {
    return MATCH_STATUSES.REVIEW;
  }
  return MATCH_STATUSES.NO_MATCH;
}

// ─── Supabase Integration ────────────────────────────────────────────────────

/**
 * Query gingr_owners from Supabase for potential matches against a lead.
 *
 * @param {object} supabaseClient - Supabase client instance
 * @param {string} locationId - Location UUID to scope the query
 * @param {object} lead - Parsed lead: { email, phone, firstName, lastName }
 * @returns {Promise<{ matchResult: object, status: string, candidates: Array }>}
 */
export async function matchLeadFromSupabase(supabaseClient, locationId, lead) {
  const { data: owners, error } = await supabaseClient
    .from('gingr_owners')
    .select('id, first_name, last_name, email, phone')
    .eq('location_id', locationId);

  if (error) {
    console.error('[ignite-match] Error querying gingr_owners:', error.message);
    return {
      matchResult: { matched: false, clientId: null, confidence: 0, matchType: null, allMatches: [] },
      status: MATCH_STATUSES.NO_MATCH,
      candidates: [],
      error: error.message,
    };
  }

  const clientList = (owners || []).map((o) => ({
    id: o.id,
    email: o.email,
    phone: o.phone,
    firstName: o.first_name,
    lastName: o.last_name,
  }));

  const matchResult = matchLeadToClient(lead, clientList);
  const status = classifyMatchStatus(matchResult);

  // Build candidate list for review queue (all matches above minimum threshold)
  const candidates = matchResult.allMatches
    .filter((m) => m.confidence >= REVIEW_THRESHOLD)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5); // Top 5 candidates max

  return { matchResult, status, candidates };
}

// ─── Review Queue ────────────────────────────────────────────────────────────

/**
 * Add a lead to the review queue in Supabase.
 * Sets match_status to 'review' and stores candidate matches.
 *
 * @param {object} supabaseClient - Supabase client instance
 * @param {string} leadId - UUID of the ignite_leads row
 * @param {Array} candidates - Array of { clientId, confidence, matchType }
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function addToReviewQueue(supabaseClient, leadId, candidates) {
  const { error } = await supabaseClient
    .from('ignite_leads')
    .update({
      match_status: MATCH_STATUSES.REVIEW,
      match_candidates: candidates.map((c) => ({
        client_id: c.clientId,
        confidence: c.confidence,
        match_type: c.matchType,
      })),
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId);

  if (error) {
    console.error('[ignite-match] Error adding to review queue:', error.message);
    return { success: false, error: error.message };
  }
  return { success: true };
}

/**
 * Resolve a review queue item — confirm or reject a match.
 *
 * @param {object} supabaseClient - Supabase client instance
 * @param {string} leadId - UUID of the ignite_leads row
 * @param {string|null} confirmedClientId - Client ID to link, or null to mark as no_match
 * @param {string} resolvedBy - User ID who resolved the match
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function resolveReviewItem(supabaseClient, leadId, confirmedClientId, resolvedBy) {
  const update = {
    matched_client_id: confirmedClientId,
    match_status: confirmedClientId ? MATCH_STATUSES.MATCHED : MATCH_STATUSES.NO_MATCH,
    resolved_by: resolvedBy,
    resolved_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseClient
    .from('ignite_leads')
    .update(update)
    .eq('id', leadId);

  if (error) {
    console.error('[ignite-match] Error resolving review item:', error.message);
    return { success: false, error: error.message };
  }
  return { success: true };
}

/**
 * Fetch leads pending manual review for a location.
 *
 * @param {object} supabaseClient - Supabase client instance
 * @param {string} locationId - Location UUID
 * @returns {Promise<{ leads: Array, error?: string }>}
 */
export async function fetchReviewQueue(supabaseClient, locationId) {
  const { data, error } = await supabaseClient
    .from('ignite_leads')
    .select('id, first_name, last_name, email, phone, lead_type, source_detail, match_confidence, match_candidates, created_at')
    .eq('location_id', locationId)
    .eq('match_status', MATCH_STATUSES.REVIEW)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[ignite-match] Error fetching review queue:', error.message);
    return { leads: [], error: error.message };
  }
  return { leads: data || [] };
}

// ─── Exported Utilities ──────────────────────────────────────────────────────

export { levenshtein, stringSimilarity, normalizeEmail, computeNameConfidence, getCanonical, NICKNAME_MAP };

// © 2026 K9 Operations LLC. All Rights Reserved.
// Proprietary and Confidential. Unauthorized copying, modification,
// distribution, or use of this software is strictly prohibited.

// Operations Manual lookup for the AI assistant.
//
// The assistant routes live-data questions (revenue, schedules, counts) to the
// `ai-assistant` edge function. Policy / procedure questions ("what's the dress
// code?", "explain the collar colors") are answered instantly and offline from a
// static knowledge base of { keywords, title, answer } entries (OPS_MANUAL_KB,
// in src/pos/constants/opsManual.js).
//
// Matching is deliberately conservative so it never hijacks a data query:
//   - Anything that looks like a data/analytics question is deferred (returns null).
//   - Multi-word keyword phrases score high (+3); specific single words score low
//     (+1); short/generic single words (< 4 chars) are ignored to avoid false
//     positives (e.g. "id", "hat", "pp").

export const OPS_MANUAL_DATA_INTENT_RE =
  /\b(revenue|sales|profit|how many|how much|number of|count|list all|show me|today'?s?|tonight|tomorrow|this (?:month|week|year|quarter)|last (?:month|week|year)|scheduled|overdue|owes?|balance|invoice|occupancy|\$\d|\d{2,})\b/i;

/**
 * Find the best Operations Manual entry for a free-text query.
 *
 * @param {Array<{keywords?: string[], title?: string, answer?: string}>} kb
 * @param {string} query
 * @returns {object|null} the matched entry, or null to defer to the edge function.
 */
export function findOpsManualAnswer(kb, query) {
  const raw = String(query || "").toLowerCase().trim();
  if (!raw || !Array.isArray(kb)) return null;
  // Live-data questions belong to the edge function, not the static manual.
  if (OPS_MANUAL_DATA_INTENT_RE.test(raw)) return null;

  const norm = ` ${raw.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim()} `;
  let best = null;
  let bestScore = 0;

  for (const entry of kb) {
    let score = 0;
    for (const kw of entry?.keywords || []) {
      const k = String(kw).toLowerCase().trim();
      if (!k) continue;
      if (k.includes(" ")) {
        if (norm.includes(` ${k} `)) score += 3;
      } else if (k.length >= 4 && norm.includes(` ${k} `)) {
        score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }

  return bestScore >= 1 ? best : null;
}

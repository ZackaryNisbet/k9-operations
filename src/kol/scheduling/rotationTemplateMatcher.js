import rotationTemplateCatalog from "./rotationTemplateCatalog.json";

const SHIFT_TO_TEMPLATE_SHIFT = {
  opening: "AM",
  am: "AM",
  AM: "AM",
  closing: "PM",
  pm: "PM",
  PM: "PM",
};

const SUPPORT_ROLE_TO_COUNT_KEY = {
  manager: "manager",
  mod: "manager",
  supervisor: "supervisor",
  csr: "csr",
};

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toNonNegativeInteger(value) {
  return Math.max(0, Math.round(toFiniteNumber(value, 0)));
}

function normalizeDayType(date) {
  if (!date) return "unknown";
  const dt = new Date(`${date}T12:00:00`);
  if (Number.isNaN(dt.getTime())) return "unknown";
  return [0, 6].includes(dt.getDay()) ? "weekend" : "weekday";
}

function normalizeShift(shift) {
  return SHIFT_TO_TEMPLATE_SHIFT[shift] || "unknown";
}

function normalizeCounts(counts = {}) {
  return {
    manager: toNonNegativeInteger(counts.manager ?? counts.mod),
    supervisor: toNonNegativeInteger(counts.supervisor),
    csr: toNonNegativeInteger(counts.csr),
    pct: toNonNegativeInteger(counts.pct),
  };
}

function supportRoleCountForTemplate(role, counts) {
  return counts[SUPPORT_ROLE_TO_COUNT_KEY[role] || role] || 0;
}

function requestedSupportRoles(counts) {
  return Object.entries({
    manager: counts.manager,
    supervisor: counts.supervisor,
    csr: counts.csr,
  })
    .filter(([, count]) => count > 0)
    .map(([role]) => role);
}

function supportRoleLabel(role) {
  if (role === "manager") return "MOD";
  if (role === "supervisor") return "supervisor";
  if (role === "csr") return "CSR";
  return role;
}

function inferRequestedFlags({ demandDisplay, explicitFlags }) {
  const playYard = demandDisplay?.play_yard || {};
  const opening = demandDisplay?.opening || {};
  return {
    privatePlay: Boolean(
      explicitFlags?.privatePlay
      || toFiniteNumber(playYard.private_play_dogs) >= 6
      || toFiniteNumber(playYard.split_play_dogs) >= 4
    ),
    pod: Boolean(
      explicitFlags?.pod
      || toFiniteNumber(opening.total_boarding) >= 24
    ),
    podPass: Boolean(explicitFlags?.podPass),
    solo: Boolean(explicitFlags?.solo),
    snow: Boolean(explicitFlags?.snow),
    holiday: Boolean(explicitFlags?.holiday),
    trainee: Boolean(explicitFlags?.trainee),
  };
}

function flagPenalty(templateFlags = {}, requestedFlags = {}) {
  let penalty = 0;
  const specialKeys = ["snow", "holiday", "trainee", "solo"];
  for (const key of specialKeys) {
    if (templateFlags[key] && !requestedFlags[key]) penalty += 18;
    if (!templateFlags[key] && requestedFlags[key]) penalty += 8;
  }
  if (templateFlags.privatePlay && !requestedFlags.privatePlay) penalty += 4;
  if (!templateFlags.privatePlay && requestedFlags.privatePlay) penalty += 3;
  if (templateFlags.pod && !requestedFlags.pod) penalty += 2;
  return penalty;
}

function scoreTemplate(template, request) {
  const counts = request.counts;
  const requestedShift = normalizeShift(request.shift);
  const requestedDayType = request.dayType || normalizeDayType(request.date);
  const reasons = [];
  let score = 0;

  if (template.shift === requestedShift) {
    score += 60;
    reasons.push(`${requestedShift === "AM" ? "opening" : "closing"} shift`);
  } else if (template.shift === "unknown") {
    score += 8;
  } else {
    score -= 80;
  }

  if (template.dayType === requestedDayType) {
    score += 40;
    reasons.push(requestedDayType);
  } else if (template.dayType === "unknown") {
    score += 6;
  } else if (requestedDayType === "unknown") {
    score += 2;
  } else {
    score -= 30;
  }

  const personCount = toFiniteNumber(template.personCount, NaN);
  const pctLaneCount = toFiniteNumber(template.pctLaneCount, NaN);
  if (Number.isFinite(personCount)) {
    const delta = Math.abs(personCount - counts.pct);
    score += Math.max(0, 34 - delta * 13);
    if (delta === 0) {
      score += 8;
      reasons.push(`${counts.pct} PCT lanes`);
    }
    else reasons.push(`${delta} PCT off requested count`);
  } else if (Number.isFinite(pctLaneCount)) {
    const delta = Math.abs(pctLaneCount - counts.pct);
    score += Math.max(0, 24 - delta * 8);
    if (delta === 0) reasons.push(`${counts.pct} extracted PCT lanes`);
  }

  const supportRoles = requestedSupportRoles(counts);
  for (const role of supportRoles) {
    if ((template.supportRoles || []).includes(role) || supportRoleCountForTemplate(role, counts) === 0) {
      score += 8;
      reasons.push(`${supportRoleLabel(role)} support`);
    } else if (role === "manager") {
      reasons.push("MOD lane stays separate");
    } else {
      score -= 5;
    }
  }

  score -= flagPenalty(template.flags, request.flags);

  return {
    template,
    score,
    reasons,
  };
}

function confidenceForScore(score) {
  if (score >= 118) return "high";
  if (score >= 90) return "medium";
  if (score >= 62) return "low";
  return "fallback";
}

function buildMatchReason(best, request) {
  if (!best?.template) return [];
  const shift = normalizeShift(request.shift);
  const dayType = request.dayType || normalizeDayType(request.date);
  const reasons = [...best.reasons];
  if (!reasons.some((reason) => reason.includes(dayType)) && dayType !== "unknown") {
    reasons.unshift(dayType);
  }
  if (!reasons.some((reason) => reason.includes("shift")) && shift !== "unknown") {
    reasons.unshift(shift === "AM" ? "opening shift" : "closing shift");
  }
  return [...new Set(reasons)].slice(0, 5);
}

export function getRotationTemplateCatalogSummary() {
  return rotationTemplateCatalog.summary;
}

export function findRotationTemplateMatch(input = {}) {
  const counts = normalizeCounts(input.counts || input.staffingCounts || {});
  const request = {
    date: input.date,
    shift: input.shift,
    dayType: input.dayType || normalizeDayType(input.date),
    counts,
    flags: inferRequestedFlags({
      demandDisplay: input.demandDisplay,
      explicitFlags: input.flags,
    }),
  };

  const scored = rotationTemplateCatalog.templates
    .map((template) => scoreTemplate(template, request))
    .sort((a, b) => b.score - a.score || a.template.sourceSheetName.localeCompare(b.template.sourceSheetName));

  const best = scored[0] || null;
  if (!best || best.score < 20) {
    return {
      template: null,
      confidence: "none",
      score: best?.score ?? 0,
      reason: [],
      explanation: "No matching workbook template was close enough for this staffing request.",
      alternatives: scored.slice(0, 3).map((item) => item.template.sourceSheetName),
      limitations: [
        "Workbook template matching is v1 and uses sheet names plus extracted lane metadata.",
      ],
    };
  }

  const reason = buildMatchReason(best, request);
  return {
    template: best.template,
    confidence: confidenceForScore(best.score),
    score: Number(best.score.toFixed(2)),
    reason,
    explanation: reason.length ? reason.join(", ") : "Closest workbook template by shift, day type, and PCT count.",
    alternatives: scored.slice(1, 4).map((item) => ({
      sourceSheetName: item.template.sourceSheetName,
      score: Number(item.score.toFixed(2)),
    })),
    limitations: [
      "This does not replace the server-side rotation engine yet.",
      "The original workbook is manual; names and one-off notes are preserved only as source task cells.",
    ],
  };
}

export function findRotationTemplateCandidates(input = {}, limit = 8) {
  const counts = normalizeCounts(input.counts || input.staffingCounts || {});
  const request = {
    date: input.date,
    shift: input.shift,
    dayType: input.dayType || normalizeDayType(input.date),
    counts,
    flags: inferRequestedFlags({
      demandDisplay: input.demandDisplay,
      explicitFlags: input.flags,
    }),
  };

  return rotationTemplateCatalog.templates
    .map((template) => scoreTemplate(template, request))
    .sort((a, b) => b.score - a.score || a.template.sourceSheetName.localeCompare(b.template.sourceSheetName))
    .slice(0, limit)
    .map((item) => ({
      template: item.template,
      confidence: confidenceForScore(item.score),
      score: Number(item.score.toFixed(2)),
      reason: buildMatchReason(item, request),
      explanation: buildMatchReason(item, request).join(", ") || "Closest workbook template by shift, day type, and PCT count.",
    }));
}

export function buildRotationTemplateMatches({ date, staffingMatrix, demandDisplay, flags } = {}) {
  const openingCounts = normalizeCounts(staffingMatrix?.opening || {});
  const closingCounts = normalizeCounts(staffingMatrix?.closing || {});
  return {
    opening: findRotationTemplateMatch({
      date,
      shift: "opening",
      counts: openingCounts,
      demandDisplay,
      flags,
    }),
    closing: findRotationTemplateMatch({
      date,
      shift: "closing",
      counts: closingCounts,
      demandDisplay,
      flags,
    }),
  };
}

export function getTemplateDisplayName(match) {
  return match?.template?.sourceSheetName || "No template match";
}

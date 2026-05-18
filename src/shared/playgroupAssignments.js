export const PLAYGROUP_DISPLAY_ORDER = [
  "half_and_half",
  "both_daycares",
  "private_play",
  "large",
  "small",
  "evaluation",
];

const PLAY_ICON_CAPABILITY_TO_TAG = {
  "play.private_play": "private_play",
  "play.large_daycare": "large",
  "play.small_daycare": "small",
  "play.evaluation": "evaluation",
};

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry || "").trim())
    .filter(Boolean);
}

function normalizeDisplayPlaygroup(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return PLAYGROUP_DISPLAY_ORDER.includes(normalized) ? normalized : null;
}

function normalizeSchedulingPlaygroup(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["private_play", "large", "small"].includes(normalized) ? normalized : null;
}

function normalizeString(value) {
  return String(value || "").trim();
}

function uniqueStrings(values) {
  return [...new Set(values.map((value) => normalizeString(value)).filter(Boolean))];
}

function mappingMatchesIcon(mapping, icon) {
  const mappingIdentityKey = normalizeString(mapping?.icon_identity_key);
  const iconIdentityKey = normalizeString(icon?.icon_identity_key);
  if (mappingIdentityKey && iconIdentityKey) {
    return mappingIdentityKey === iconIdentityKey;
  }

  const mappingGroup = normalizeString(mapping?.icon_group).toLowerCase();
  const iconGroup = normalizeString(icon?.icon_group).toLowerCase();
  if (mappingGroup && iconGroup && mappingGroup !== iconGroup) {
    return false;
  }

  const mappingTemplateId = normalizeString(mapping?.icon_template_id);
  const iconTemplateId = normalizeString(icon?.icon_template_id);
  if (mappingTemplateId && iconTemplateId) {
    return mappingTemplateId === iconTemplateId;
  }

  return false;
}

export function getCapabilitiesForIcon(icon, mappings = []) {
  const explicitMatches = mappings
    .filter((mapping) => mapping?.is_active !== false && normalizeString(mapping?.capability_key))
    .filter((mapping) => mappingMatchesIcon(mapping, icon))
    .map((mapping) => normalizeString(mapping.capability_key));

  if (explicitMatches.length > 0) {
    return uniqueStrings(explicitMatches);
  }

  return [];
}

function normalizePlaygroupTagFromIcon(icon, mappings = []) {
  const capabilities = getCapabilitiesForIcon(icon, mappings);
  for (const capability of capabilities) {
    const tag = PLAY_ICON_CAPABILITY_TO_TAG[capability];
    if (tag) return tag;
  }
  return null;
}

export function derivePlaygroupAssignmentsFromIcons(iconRows = [], mappings = []) {
  const grouped = new Map();

  for (const icon of iconRows || []) {
    const animalGingrId = normalizeString(icon?.animal_gingr_id);
    const playgroupTag = normalizePlaygroupTagFromIcon(icon, mappings);
    if (!animalGingrId || !playgroupTag) continue;

    const entry = grouped.get(animalGingrId) || {
      hasPrivatePlay: false,
      hasEvaluation: false,
      hasLarge: false,
      hasSmall: false,
      playgroupTags: new Set(),
      sourceIconTitles: new Set(),
      sourceIconComments: new Set(),
      privatePlayComment: null,
    };

    const title = normalizeString(icon?.icon_title);
    const comment = normalizeString(icon?.icon_comment);
    entry.playgroupTags.add(playgroupTag);
    if (title) entry.sourceIconTitles.add(title);
    if (comment) entry.sourceIconComments.add(comment);

    if (playgroupTag === "private_play") {
      entry.hasPrivatePlay = true;
      if (comment) entry.privatePlayComment = comment;
    }
    if (playgroupTag === "evaluation") entry.hasEvaluation = true;
    if (playgroupTag === "large") entry.hasLarge = true;
    if (playgroupTag === "small") entry.hasSmall = true;

    grouped.set(animalGingrId, entry);
  }

  return Array.from(grouped.entries()).map(([animalGingrId, entry]) => {
    const hasBothDaycares = entry.hasLarge && entry.hasSmall;
    const hasResolvedSize = (entry.hasLarge && !entry.hasSmall) || (entry.hasSmall && !entry.hasLarge);
    const sizeGroup = entry.hasLarge && !entry.hasSmall
      ? "large"
      : entry.hasSmall && !entry.hasLarge
        ? "small"
        : null;
    const isHalfAndHalf = entry.hasPrivatePlay && hasResolvedSize;

    let primaryDisplayPlaygroup = null;
    if (hasBothDaycares) primaryDisplayPlaygroup = "both_daycares";
    else if (isHalfAndHalf) primaryDisplayPlaygroup = "half_and_half";
    else if (entry.hasPrivatePlay) primaryDisplayPlaygroup = "private_play";
    else if (sizeGroup === "large") primaryDisplayPlaygroup = "large";
    else if (sizeGroup === "small") primaryDisplayPlaygroup = "small";
    else if (entry.hasEvaluation) primaryDisplayPlaygroup = "evaluation";

    let schedulingPlaygroup = null;
    if (entry.hasPrivatePlay) schedulingPlaygroup = "private_play";
    else if (sizeGroup === "large") schedulingPlaygroup = "large";
    else if (sizeGroup === "small") schedulingPlaygroup = "small";

    let unresolvedReason = null;
    if (!entry.hasPrivatePlay && !entry.hasLarge && !entry.hasSmall && entry.hasEvaluation) unresolvedReason = "evaluation_only";
    else if (!entry.hasPrivatePlay && !entry.hasLarge && !entry.hasSmall) unresolvedReason = "no_actionable_icon";

    return {
      animal_gingr_id: animalGingrId,
      size_group: sizeGroup,
      has_private_play: entry.hasPrivatePlay,
      has_evaluation: entry.hasEvaluation,
      is_half_and_half: isHalfAndHalf,
      primary_display_playgroup: primaryDisplayPlaygroup,
      scheduling_playgroup: schedulingPlaygroup,
      playgroup_tags: ["half_and_half", "both_daycares", "private_play", "large", "small", "evaluation"].filter((tag) => {
        if (tag === "half_and_half") return isHalfAndHalf;
        if (tag === "both_daycares") return hasBothDaycares;
        return entry.playgroupTags.has(tag);
      }),
      source_icon_titles: Array.from(entry.sourceIconTitles).sort(),
      source_icon_comments: Array.from(entry.sourceIconComments).sort(),
      half_and_half_note: isHalfAndHalf ? entry.privatePlayComment : null,
      unresolved_reason: unresolvedReason,
    };
  });
}

export function normalizePlaygroupAssignment(row) {
  const animalGingrId = String(row?.animal_gingr_id || row?.animalGingrId || "").trim();
  const sizeGroup = row?.size_group ?? row?.sizeGroup ?? null;
  const halfAndHalfNote = row?.half_and_half_note ?? row?.halfAndHalfNote ?? "";
  const unresolvedReason = row?.unresolved_reason ?? row?.unresolvedReason ?? "";
  if (!animalGingrId) return null;

  return {
    animal_gingr_id: animalGingrId,
    size_group: ["large", "small"].includes(String(sizeGroup || "").toLowerCase())
      ? String(sizeGroup).toLowerCase()
      : null,
    has_private_play: !!(row?.has_private_play ?? row?.hasPrivatePlay),
    has_evaluation: !!(row?.has_evaluation ?? row?.hasEvaluation),
    is_half_and_half: !!(row?.is_half_and_half ?? row?.isHalfAndHalf),
    primary_display_playgroup: normalizeDisplayPlaygroup(
      row?.primary_display_playgroup ?? row?.primaryDisplayPlaygroup,
    ),
    scheduling_playgroup: normalizeSchedulingPlaygroup(
      row?.scheduling_playgroup ?? row?.schedulingPlaygroup,
    ),
    playgroup_tags: normalizeStringArray(row?.playgroup_tags ?? row?.playgroupTags),
    source_icon_titles: normalizeStringArray(row?.source_icon_titles ?? row?.sourceIconTitles),
    source_icon_comments: normalizeStringArray(row?.source_icon_comments ?? row?.sourceIconComments),
    half_and_half_note: String(halfAndHalfNote).trim() || null,
    unresolved_reason: String(unresolvedReason).trim() || null,
  };
}

export function buildPlaygroupAssignmentMap(rows = []) {
  const assignments = {};
  for (const row of rows) {
    const normalized = normalizePlaygroupAssignment(row);
    if (normalized) {
      assignments[normalized.animal_gingr_id] = normalized;
    }
  }
  return assignments;
}

export function getDisplayPlaygroup(assignment) {
  if (!assignment) return null;
  return assignment.primary_display_playgroup || assignment.scheduling_playgroup || (assignment.has_evaluation ? "evaluation" : null);
}

export function getOperationalPlaygroup(assignment) {
  if (!assignment) return null;
  if (assignment.primary_display_playgroup === "both_daycares") return "both_daycares";
  if (assignment.primary_display_playgroup === "half_and_half") return "private_play";
  return assignment.scheduling_playgroup || (assignment.has_evaluation ? "evaluation" : null);
}

export function getDisplayTags(assignment, { includeHalfAndHalf = true } = {}) {
  if (!assignment) return [];
  if (assignment.primary_display_playgroup === "both_daycares") return ["both_daycares"];
  const tags = new Set(assignment.playgroup_tags || []);
  if (includeHalfAndHalf && assignment.is_half_and_half) {
    tags.add("half_and_half");
  }
  return PLAYGROUP_DISPLAY_ORDER.filter((tag) => tags.has(tag));
}

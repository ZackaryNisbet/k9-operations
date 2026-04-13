export const PLAYGROUP_DISPLAY_ORDER = [
  "half_and_half",
  "private_play",
  "large",
  "small",
  "evaluation",
];

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
  if (assignment.primary_display_playgroup === "half_and_half") return "private_play";
  return assignment.scheduling_playgroup || (assignment.has_evaluation ? "evaluation" : null);
}

export function getDisplayTags(assignment, { includeHalfAndHalf = true } = {}) {
  if (!assignment) return [];
  const tags = new Set(assignment.playgroup_tags || []);
  if (includeHalfAndHalf && assignment.is_half_and_half) {
    tags.add("half_and_half");
  }
  return PLAYGROUP_DISPLAY_ORDER.filter((tag) => tags.has(tag));
}

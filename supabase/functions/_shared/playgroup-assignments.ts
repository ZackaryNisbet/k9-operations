import {
  getCapabilitiesForIcon,
  type GingrIconMappingRow,
} from "./gingr-icon-mappings.ts";

type SupabaseClient = any;

export type PlaygroupSizeGroup = "large" | "small" | null;
export type PlaygroupDisplayGroup =
  | "half_and_half"
  | "both_daycares"
  | "private_play"
  | "large"
  | "small"
  | "evaluation"
  | null;
export type PlaygroupOperationalGroup =
  | "both_daycares"
  | "private_play"
  | "large"
  | "small"
  | "evaluation"
  | null;
export type SchedulingPlaygroup =
  | "private_play"
  | "large"
  | "small"
  | null;

export interface PlaygroupAssignment {
  animalGingrId: string;
  sizeGroup: PlaygroupSizeGroup;
  hasPrivatePlay: boolean;
  hasEvaluation: boolean;
  isHalfAndHalf: boolean;
  primaryDisplayPlaygroup: PlaygroupDisplayGroup;
  schedulingPlaygroup: SchedulingPlaygroup;
  playgroupTags: string[];
  sourceIconTitles: string[];
  sourceIconComments: string[];
  halfAndHalfNote: string | null;
  unresolvedReason: string | null;
}

interface RawPlaygroupIconRow {
  animal_gingr_id?: string | null;
  icon_template_id?: string | number | null;
  icon_identity_key?: string | null;
  icon_title?: string | null;
  icon_comment?: string | null;
  icon_group?: string | null;
}

export const DEFAULT_PLAYGROUP_ASSIGNMENT_COLUMNS = [
  "animal_gingr_id",
  "size_group",
  "has_private_play",
  "has_evaluation",
  "is_half_and_half",
  "primary_display_playgroup",
  "scheduling_playgroup",
  "playgroup_tags",
  "source_icon_titles",
  "source_icon_comments",
  "half_and_half_note",
  "unresolved_reason",
].join(", ");

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry || "").trim())
    .filter(Boolean);
}

function normalizeDisplayGroup(value: unknown): PlaygroupDisplayGroup {
  const normalized = String(value || "").trim().toLowerCase();
  if (
    normalized === "half_and_half"
    || normalized === "both_daycares"
    || normalized === "private_play"
    || normalized === "large"
    || normalized === "small"
    || normalized === "evaluation"
  ) {
    return normalized as PlaygroupDisplayGroup;
  }
  return null;
}

function normalizeSchedulingGroup(value: unknown): SchedulingPlaygroup {
  const normalized = String(value || "").trim().toLowerCase();
  if (
    normalized === "private_play"
    || normalized === "large"
    || normalized === "small"
  ) {
    return normalized as SchedulingPlaygroup;
  }
  return null;
}

function normalizeSizeGroup(value: unknown): PlaygroupSizeGroup {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "large" || normalized === "small") {
    return normalized as PlaygroupSizeGroup;
  }
  return null;
}

function normalizePlaygroupTagFromIcon(
  row: RawPlaygroupIconRow,
  mappings: GingrIconMappingRow[] = [],
): string | null {
  const capabilities = getCapabilitiesForIcon({
    animal_gingr_id: row?.animal_gingr_id || null,
    icon_template_id: row?.icon_template_id == null ? null : String(row.icon_template_id),
    icon_identity_key: row?.icon_identity_key || null,
    icon_title: row?.icon_title || null,
    icon_group: row?.icon_group || null,
    icon_comment: row?.icon_comment || null,
  }, mappings);

  if (capabilities.includes("play.private_play")) return "private_play";
  if (capabilities.includes("play.large_daycare")) return "large";
  if (capabilities.includes("play.small_daycare")) return "small";
  if (capabilities.includes("play.evaluation")) return "evaluation";
  return null;
}

export function derivePlaygroupAssignmentsFromIcons(
  iconRows: RawPlaygroupIconRow[] = [],
  mappings: GingrIconMappingRow[] = [],
): PlaygroupAssignment[] {
  const grouped = new Map<string, {
    hasPrivatePlay: boolean;
    hasEvaluation: boolean;
    hasLarge: boolean;
    hasSmall: boolean;
    playgroupTags: Set<string>;
    sourceIconTitles: Set<string>;
    sourceIconComments: Set<string>;
    privatePlayComment: string | null;
  }>();

  for (const row of iconRows) {
    const animalGingrId = String(row?.animal_gingr_id || "").trim();
    const playgroupTag = normalizePlaygroupTagFromIcon(row, mappings);
    if (!animalGingrId || !playgroupTag) continue;

    const title = String(row?.icon_title || "").trim();
    const comment = String(row?.icon_comment || "").trim();
    const entry = grouped.get(animalGingrId) || {
      hasPrivatePlay: false,
      hasEvaluation: false,
      hasLarge: false,
      hasSmall: false,
      playgroupTags: new Set<string>(),
      sourceIconTitles: new Set<string>(),
      sourceIconComments: new Set<string>(),
      privatePlayComment: null,
    };

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
    const sizeGroup: PlaygroupSizeGroup = entry.hasLarge && !entry.hasSmall
      ? "large"
      : entry.hasSmall && !entry.hasLarge
        ? "small"
        : null;
    const isHalfAndHalf = entry.hasPrivatePlay && hasResolvedSize;

    let primaryDisplayPlaygroup: PlaygroupDisplayGroup = null;
    if (hasBothDaycares) primaryDisplayPlaygroup = "both_daycares";
    else if (isHalfAndHalf) primaryDisplayPlaygroup = "half_and_half";
    else if (entry.hasPrivatePlay) primaryDisplayPlaygroup = "private_play";
    else if (sizeGroup === "large") primaryDisplayPlaygroup = "large";
    else if (sizeGroup === "small") primaryDisplayPlaygroup = "small";
    else if (entry.hasEvaluation) primaryDisplayPlaygroup = "evaluation";

    let schedulingPlaygroup: SchedulingPlaygroup = null;
    if (entry.hasPrivatePlay) schedulingPlaygroup = "private_play";
    else if (sizeGroup === "large") schedulingPlaygroup = "large";
    else if (sizeGroup === "small") schedulingPlaygroup = "small";

    let unresolvedReason: string | null = null;
    if (!entry.hasPrivatePlay && !entry.hasLarge && !entry.hasSmall && entry.hasEvaluation) unresolvedReason = "evaluation_only";
    else if (!entry.hasPrivatePlay && !entry.hasLarge && !entry.hasSmall) unresolvedReason = "no_actionable_icon";

    return {
      animalGingrId,
      sizeGroup,
      hasPrivatePlay: entry.hasPrivatePlay,
      hasEvaluation: entry.hasEvaluation,
      isHalfAndHalf,
      primaryDisplayPlaygroup,
      schedulingPlaygroup,
      playgroupTags: ["half_and_half", "both_daycares", "private_play", "large", "small", "evaluation"].filter((tag) => {
        if (tag === "half_and_half") return isHalfAndHalf;
        if (tag === "both_daycares") return hasBothDaycares;
        return entry.playgroupTags.has(tag);
      }),
      sourceIconTitles: Array.from(entry.sourceIconTitles).sort(),
      sourceIconComments: Array.from(entry.sourceIconComments).sort(),
      halfAndHalfNote: isHalfAndHalf ? entry.privatePlayComment : null,
      unresolvedReason,
    };
  });
}

export function normalizePlaygroupAssignmentRow(row: any): PlaygroupAssignment | null {
  const animalGingrId = String(row?.animal_gingr_id || row?.animalGingrId || "").trim();
  const halfAndHalfNote = row?.half_and_half_note ?? row?.halfAndHalfNote ?? "";
  const unresolvedReason = row?.unresolved_reason ?? row?.unresolvedReason ?? "";
  if (!animalGingrId) return null;

  return {
    animalGingrId,
    sizeGroup: normalizeSizeGroup(row?.size_group ?? row?.sizeGroup),
    hasPrivatePlay: !!(row?.has_private_play ?? row?.hasPrivatePlay),
    hasEvaluation: !!(row?.has_evaluation ?? row?.hasEvaluation),
    isHalfAndHalf: !!(row?.is_half_and_half ?? row?.isHalfAndHalf),
    primaryDisplayPlaygroup: normalizeDisplayGroup(
      row?.primary_display_playgroup ?? row?.primaryDisplayPlaygroup,
    ),
    schedulingPlaygroup: normalizeSchedulingGroup(
      row?.scheduling_playgroup ?? row?.schedulingPlaygroup,
    ),
    playgroupTags: normalizeStringArray(row?.playgroup_tags ?? row?.playgroupTags),
    sourceIconTitles: normalizeStringArray(row?.source_icon_titles ?? row?.sourceIconTitles),
    sourceIconComments: normalizeStringArray(row?.source_icon_comments ?? row?.sourceIconComments),
    halfAndHalfNote: String(halfAndHalfNote).trim() || null,
    unresolvedReason: String(unresolvedReason).trim() || null,
  };
}

export function buildPlaygroupAssignmentMap(rows: any[] = []): Map<string, PlaygroupAssignment> {
  const byAnimalId = new Map<string, PlaygroupAssignment>();
  for (const row of rows) {
    const normalized = normalizePlaygroupAssignmentRow(row);
    if (normalized) {
      byAnimalId.set(normalized.animalGingrId, normalized);
    }
  }
  return byAnimalId;
}

export function getOperationalPlaygroupKey(
  assignment: PlaygroupAssignment | null | undefined,
): PlaygroupOperationalGroup {
  if (!assignment) return null;
  if (assignment.primaryDisplayPlaygroup === "both_daycares") return "both_daycares";
  if (assignment.schedulingPlaygroup) return assignment.schedulingPlaygroup;
  if (assignment.hasEvaluation) return "evaluation";
  return null;
}

export function getCanonicalPlaygroupTags(
  assignment: PlaygroupAssignment | null | undefined,
  { includeHalfAndHalf = false } = {},
): string[] {
  if (!assignment) return [];
  if (assignment.primaryDisplayPlaygroup === "both_daycares") return ["both_daycares"];
  const ordered = ["half_and_half", "both_daycares", "private_play", "large", "small", "evaluation"];
  const tags = new Set<string>(assignment.playgroupTags);
  if (includeHalfAndHalf && assignment.isHalfAndHalf) {
    tags.add("half_and_half");
  }
  return ordered.filter((tag) => tags.has(tag));
}

export function humanizePlaygroupTag(tag: string | null | undefined): string | null {
  switch (String(tag || "").trim().toLowerCase()) {
    case "half_and_half":
      return "Half & Half";
    case "both_daycares":
      return "Both Daycares";
    case "private_play":
      return "Private Play";
    case "large":
      return "Large Playgroup";
    case "small":
      return "Small Playgroup";
    case "evaluation":
      return "Evaluation";
    default:
      return null;
  }
}

export async function fetchPlaygroupAssignments({
  supabase,
  locationId,
  animalIds,
  columns = DEFAULT_PLAYGROUP_ASSIGNMENT_COLUMNS,
}: {
  supabase: SupabaseClient;
  locationId: string;
  animalIds?: string[];
  columns?: string;
}) {
  const uniqueAnimalIds = [...new Set((animalIds || []).map((value) => String(value || "").trim()).filter(Boolean))];

  let query = supabase
    .from("v_dog_playgroup_assignments_current")
    .select(columns)
    .eq("location_id", locationId);

  if (uniqueAnimalIds.length > 0) {
    query = query.in("animal_gingr_id", uniqueAnimalIds);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(normalizePlaygroupAssignmentRow).filter(Boolean) as PlaygroupAssignment[];
}

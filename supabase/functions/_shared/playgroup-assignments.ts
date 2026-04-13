type SupabaseClient = any;

export type PlaygroupSizeGroup = "large" | "small" | null;
export type PlaygroupDisplayGroup =
  | "half_and_half"
  | "private_play"
  | "large"
  | "small"
  | "evaluation"
  | null;
export type PlaygroupOperationalGroup =
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
  if (assignment.schedulingPlaygroup) return assignment.schedulingPlaygroup;
  if (assignment.hasEvaluation) return "evaluation";
  return null;
}

export function getCanonicalPlaygroupTags(
  assignment: PlaygroupAssignment | null | undefined,
  { includeHalfAndHalf = false } = {},
): string[] {
  if (!assignment) return [];
  const ordered = ["half_and_half", "private_play", "large", "small", "evaluation"];
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

import {
  extractBathLikeServices,
  calculateNights,
  getBathSchedulingForDate,
} from "./bathing-logic.ts";
import {
  buildPlaygroupAssignmentMap,
  fetchPlaygroupAssignments,
  type PlaygroupAssignment,
} from "./playgroup-assignments.ts";

type SupabaseClient = any;

type ReservationTypeRow = {
  gingr_id?: string | null;
  name?: string | null;
  is_boarding?: boolean | null;
  is_daycare?: boolean | null;
  single_day?: boolean | null;
};

type ReservationRow = {
  gingr_id?: string | null;
  animal_gingr_id?: string | null;
  animal_name?: string | null;
  reservation_type_id?: string | null;
  reservation_type_name?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  check_in_date?: string | null;
  check_out_date?: string | null;
  cancelled_date?: string | null;
  created_date?: string | null;
  confirmed_date?: string | null;
  created_at?: string | null;
  services?: any[] | null;
};

const ANIMAL_HISTORY_BATCH_SIZE = 200;

function getDateKey(value?: string | null): string {
  return String(value || "").slice(0, 10);
}

export function nowET(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
}

export function dateStrET(d?: Date): string {
  const dt = d || nowET();
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export function addDaysStr(dateStr: string, days: number): string {
  const dt = new Date(`${dateStr}T12:00:00`);
  dt.setDate(dt.getDate() + days);
  return dt.toISOString().slice(0, 10);
}

function enumerateDates(dateFrom: string, dateTo: string): string[] {
  const dates: string[] = [];
  let current = dateFrom;
  while (current <= dateTo) {
    dates.push(current);
    current = addDaysStr(current, 1);
  }
  return dates;
}

function shiftYearsStr(dateStr: string, years: number): string {
  const dt = new Date(`${dateStr}T12:00:00`);
  dt.setFullYear(dt.getFullYear() + years);
  return dt.toISOString().slice(0, 10);
}

function diffDays(fromDate: string, toDate: string): number {
  const from = new Date(`${fromDate}T12:00:00`).getTime();
  const to = new Date(`${toDate}T12:00:00`).getTime();
  return Math.round((to - from) / 86400000);
}

function getWeekday(dateStr: string): number {
  return new Date(`${dateStr}T12:00:00`).getDay();
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function weightedAverage(
  values: number[],
  weights: number[],
  fallback = 0,
): number {
  let weightedSum = 0;
  let weightSum = 0;
  for (let i = 0; i < values.length; i += 1) {
    const value = Number(values[i]);
    const weight = Number(weights[i]);
    if (!Number.isFinite(value) || !Number.isFinite(weight) || weight <= 0) continue;
    weightedSum += value * weight;
    weightSum += weight;
  }
  return weightSum > 0 ? weightedSum / weightSum : fallback;
}

type ProjectionFallbackMode =
  | "exact_prior_year"
  | "same_weekday_prior_year"
  | "exact_prior_years_2_to_4"
  | "same_weekday_prior_years_2_to_4";

type ProjectionCandidate = {
  sampleDate: string;
  fallbackMode: ProjectionFallbackMode;
  dateDistance: number;
  yearOffset: number;
};

function getProjectionCandidates(targetDate: string): ProjectionCandidate[] {
  const results: ProjectionCandidate[] = [];
  const seen = new Set<string>();
  const targetWeekday = getWeekday(targetDate);

  const addCandidate = (
    sampleDate: string,
    fallbackMode: ProjectionFallbackMode,
    dateDistance: number,
    yearOffset: number,
  ) => {
    if (!sampleDate || sampleDate >= targetDate || seen.has(sampleDate)) return;
    seen.add(sampleDate);
    results.push({
      sampleDate,
      fallbackMode,
      dateDistance,
      yearOffset,
    });
  };

  const exactLastYear = shiftYearsStr(targetDate, -1);
  addCandidate(exactLastYear, "exact_prior_year", 0, 1);

  for (let delta = -21; delta <= 21; delta += 1) {
    if (delta === 0) continue;
    const candidate = addDaysStr(exactLastYear, delta);
    if (getWeekday(candidate) === targetWeekday) {
      addCandidate(candidate, "same_weekday_prior_year", Math.abs(delta), 1);
    }
  }

  for (let yearOffset = 2; yearOffset <= 4; yearOffset += 1) {
    const anchor = shiftYearsStr(targetDate, -yearOffset);
    addCandidate(anchor, "exact_prior_years_2_to_4", 0, yearOffset);
  }

  for (let yearOffset = 2; yearOffset <= 4; yearOffset += 1) {
    const anchor = shiftYearsStr(targetDate, -yearOffset);
    for (let delta = -21; delta <= 21; delta += 1) {
      if (delta === 0) continue;
      const candidate = addDaysStr(anchor, delta);
      if (getWeekday(candidate) === targetWeekday) {
        addCandidate(candidate, "same_weekday_prior_years_2_to_4", Math.abs(delta), yearOffset);
      }
    }
  }

  return results;
}

function buildHistoricalWindow(targetDates: string[]) {
  const references = new Set<string>();
  for (const date of targetDates) {
    for (const candidate of getProjectionCandidates(date)) {
      references.add(candidate.sampleDate);
    }
  }

  const ordered = Array.from(references).sort();
  if (!ordered.length) {
    return null;
  }

  return {
    referenceDates: ordered,
    windowStart: ordered[0],
    windowEnd: ordered[ordered.length - 1],
  };
}

function buildDateOverlapOrFilter(dateKeys: string[]) {
  const uniqueDates = [...new Set((dateKeys || []).filter(Boolean))].sort();
  if (!uniqueDates.length) return null;
  return uniqueDates
    .map((dateKey) => `and(start_date.lt.${addDaysStr(dateKey, 1)}T00:00:00,end_date.gte.${dateKey}T00:00:00)`)
    .join(",");
}

export function classifySchedulingReservationType(
  typeName: string,
  typeRow?: ReservationTypeRow | null,
): "boarding" | "daycare" | "dayboarding" | "evaluation" | "tour" | "grooming" | "other" {
  const value = String(typeName || "").toLowerCase();
  if (value.includes("evaluation") || value.includes("eval")) return "evaluation";
  if (value.includes("tour")) return "tour";
  if (value.includes("day boarding") || value.includes("day board")) return "dayboarding";
  if (typeRow?.is_daycare || value.includes("daycare") || value.includes("day care")) return "daycare";
  if (typeRow?.is_boarding || value.includes("boarding") || value.includes("lodge") || value.includes("kennel")) return "boarding";
  if (value.includes("groom") || value.includes("bath")) return "grooming";
  return "other";
}

function normalizePlaygroup(playgroup: string | null | undefined): "large" | "small" | "private_play" | "unknown" {
  const value = String(playgroup || "").toLowerCase();
  if (value === "large") return "large";
  if (value === "small") return "small";
  if (value === "private_play") return "private_play";
  return "unknown";
}

function isMedicationService(services: any[] = [], targetDate: string): boolean {
  return services.some((service) => {
    const name = String(typeof service === "string" ? service : service?.name || "").toLowerCase();
    const scheduledAt = String(typeof service === "string" ? "" : service?.scheduled_at || "");
    return name.includes("medication") && getDateKey(scheduledAt) === targetDate;
  });
}

function getBookedDateKey(row: ReservationRow): string {
  return getDateKey(row.created_date || row.confirmed_date || row.created_at);
}

export function buildReservationTypeMaps(rows: ReservationTypeRow[]) {
  const byName = new Map<string, ReservationTypeRow>();
  const byId = new Map<string, ReservationTypeRow>();

  for (const row of rows) {
    const typeName = String(row.name || "");
    const typeId = String(row.gingr_id || "");
    if (typeName) byName.set(typeName, row);
    if (typeId) byId.set(typeId, row);
  }

  return { byName, byId };
}

function isOperationalReservationClass(
  cls: ReturnType<typeof classifySchedulingReservationType>,
) {
  return cls === "boarding" || cls === "daycare" || cls === "dayboarding" || cls === "evaluation";
}

function escapeSqlLiteral(value: string) {
  return String(value || "").replaceAll("'", "''");
}

export async function fetchEarliestOperationalStartDates({
  supabase,
  locationId,
  animalIds,
  resTypeMaps,
}: {
  supabase: SupabaseClient;
  locationId: string;
  animalIds: string[];
  resTypeMaps: { byName: Map<string, ReservationTypeRow>; byId: Map<string, ReservationTypeRow> };
}) {
  const earliestByAnimal = new Map<string, string>();
  const uniqueAnimalIds = [...new Set((animalIds || []).map((value) => String(value || "").trim()).filter(Boolean))];

  for (let i = 0; i < uniqueAnimalIds.length; i += ANIMAL_HISTORY_BATCH_SIZE) {
    const chunk = uniqueAnimalIds.slice(i, i + ANIMAL_HISTORY_BATCH_SIZE);
    if (!chunk.length) continue;

    const animalIdList = chunk.map((animalId) => `'${escapeSqlLiteral(animalId)}'`).join(", ");
    const sql = [
      "SELECT",
      "  r.animal_gingr_id,",
      "  min(r.start_date)::text AS earliest_start",
      "FROM public.gingr_reservations r",
      "LEFT JOIN public.gingr_reservation_types rt",
      "  ON rt.location_id = r.location_id",
      " AND rt.gingr_id::text = r.reservation_type_id::text",
      "WHERE r.location_id = ($1)::text",
      "  AND r.cancelled_date IS NULL",
      "  AND r.start_date IS NOT NULL",
      `  AND r.animal_gingr_id IN (${animalIdList})`,
      "  AND CASE",
      "    WHEN lower(coalesce(r.reservation_type_name, '')) LIKE '%tour%' THEN false",
      "    WHEN lower(coalesce(r.reservation_type_name, '')) LIKE '%groom%' THEN false",
      "    WHEN lower(coalesce(r.reservation_type_name, '')) LIKE '%bath%' THEN false",
      "    WHEN lower(coalesce(r.reservation_type_name, '')) LIKE '%evaluation%' THEN true",
      "    WHEN lower(coalesce(r.reservation_type_name, '')) LIKE '%eval%' THEN true",
      "    WHEN lower(coalesce(r.reservation_type_name, '')) LIKE '%day boarding%' THEN true",
      "    WHEN lower(coalesce(r.reservation_type_name, '')) LIKE '%day board%' THEN true",
      "    WHEN coalesce(rt.is_daycare, false) THEN true",
      "    WHEN lower(coalesce(r.reservation_type_name, '')) LIKE '%daycare%' THEN true",
      "    WHEN lower(coalesce(r.reservation_type_name, '')) LIKE '%day care%' THEN true",
      "    WHEN coalesce(rt.is_boarding, false) THEN true",
      "    WHEN lower(coalesce(r.reservation_type_name, '')) LIKE '%boarding%' THEN true",
      "    WHEN lower(coalesce(r.reservation_type_name, '')) LIKE '%lodge%' THEN true",
      "    WHEN lower(coalesce(r.reservation_type_name, '')) LIKE '%kennel%' THEN true",
      "    ELSE false",
      "  END",
      "GROUP BY r.animal_gingr_id",
    ].join("\n");
    const { data, error } = await supabase.rpc("exec_sql", {
      query: sql,
      params: [locationId],
    });

    if (error) throw error;

    for (const row of Array.isArray(data) ? data : []) {
      const animalId = String(row?.animal_gingr_id || "").trim();
      const startKey = getDateKey(row?.earliest_start);
      if (!animalId || !startKey || earliestByAnimal.has(animalId)) continue;
      earliestByAnimal.set(animalId, startKey);
    }
  }

  return earliestByAnimal;
}

export function annotateReservationsWithOperationalHistory(
  reservations: any[],
  earliestOperationalStartByAnimal: Map<string, string>,
) {
  return reservations.map((row) => {
    const earliestOperationalStart = earliestOperationalStartByAnimal.get(row.animalId) || null;
    const isFirstEverDaycareVisit = row.cls === "daycare"
      && !!earliestOperationalStart
      && row.startKey === earliestOperationalStart;

    return {
      ...row,
      earliestOperationalStart,
      isFirstEverDaycareVisit,
    };
  });
}

export function getStayDayIndex(row: any, targetDate: string) {
  if (!row?.startKey || row.startKey > targetDate) return null;
  return diffDays(row.startKey, targetDate) + 1;
}

export function isEvaluationBoardingToday(row: any, targetDate: string) {
  return row?.cls === "boarding"
    && row?.unresolvedPlaygroupReason === "evaluation_only"
    && getStayDayIndex(row, targetDate) === 1;
}

function getEvaluationSource(row: any) {
  if (row?.cls === "evaluation") return "explicit_evaluation_reservation_type";
  if (row?.isFirstEverDaycareVisit) return "first_ever_daycare_visit";
  if (row?.unresolvedPlaygroupReason === "evaluation_only") return "evaluation_only_play_icon";
  return null;
}

function summarizeRoomOccupancy(roomSnapshots: any[] = []): Record<string, { occupied: number; available: number; total: number }> {
  const byDate: Record<string, { occupied: number; available: number; total: number }> = {};
  for (const row of roomSnapshots) {
    const dateKey = getDateKey(row.snapshot_date);
    if (!dateKey) continue;
    const occupied = Number(row.number_occupied || 0);
    const available = Number(row.number_available || 0);
    const total = Number(row.total_runs || occupied + available || 0);
    const current = byDate[dateKey];
    if (!current || total > current.total) {
      byDate[dateKey] = { occupied, available, total };
    }
  }
  return byDate;
}

function countDistinctAnimals(rows: ReservationRow[]): number {
  return new Set(rows.map((row) => String(row.animal_gingr_id || row.gingr_id || ""))).size;
}

function isCheckedOutBeforeDate(row: { check_out_date?: string | null }, targetDate: string): boolean {
  const checkedOutKey = getDateKey(row.check_out_date);
  return !!checkedOutKey && checkedOutKey < targetDate;
}

function isCheckedOutByDate(row: { check_out_date?: string | null }, targetDate: string): boolean {
  const checkedOutKey = getDateKey(row.check_out_date);
  return !!checkedOutKey && checkedOutKey <= targetDate;
}

function wasCheckedInBeforeDate(row: { check_in_date?: string | null }, targetDate: string): boolean {
  const checkedInKey = getDateKey(row.check_in_date);
  return !!checkedInKey && checkedInKey < targetDate;
}

export function buildReservationRecord(
  row: ReservationRow,
  resTypeMaps: { byName: Map<string, ReservationTypeRow>; byId: Map<string, ReservationTypeRow> },
  playgroupMap: Map<string, PlaygroupAssignment>,
) {
  const services = Array.isArray(row.services) ? row.services : [];
  const typeName = String(row.reservation_type_name || "");
  const typeId = String(row.reservation_type_id || "");
  const typeRow = resTypeMaps.byId.get(typeId) || resTypeMaps.byName.get(typeName) || null;
  const cls = classifySchedulingReservationType(typeName, typeRow);
  const startKey = getDateKey(row.start_date);
  const endKey = getDateKey(row.end_date);
  const animalId = String(row.animal_gingr_id || "");
  const playgroupAssignment = playgroupMap.get(animalId) || null;
  const playgroup = normalizePlaygroup(playgroupAssignment?.schedulingPlaygroup);
  const bookedDateKey = getBookedDateKey(row);

  return {
    ...row,
    services,
    cls,
    typeId,
    startKey,
    endKey,
    bookedDateKey,
    playgroup,
    animalId,
    playgroupAssignment,
    isHalfAndHalf: !!playgroupAssignment?.isHalfAndHalf,
    unresolvedPlaygroupReason: playgroupAssignment?.unresolvedReason || (playgroup === "unknown" ? "missing_actionable_play_icon" : null),
  };
}

function splitCounts(rows: Array<{ playgroup: string; isHalfAndHalf?: boolean; unresolvedPlaygroupReason?: string | null; cls?: string; startKey?: string }>, targetDate: string) {
  let large = 0;
  let small = 0;
  let privatePlay = 0;
  let halfAndHalf = 0;
  let evaluationBoarding = 0;
  let unknown = 0;

  for (const row of rows) {
    if (isEvaluationBoardingToday(row, targetDate)) {
      evaluationBoarding += 1;
      continue;
    }
    if (row.isHalfAndHalf) {
      halfAndHalf += 1;
      continue;
    }
    switch (row.playgroup) {
      case "large":
        large += 1;
        break;
      case "small":
        small += 1;
        break;
      case "private_play":
        privatePlay += 1;
        break;
      default:
        unknown += 1;
        break;
    }
  }

  return { large, small, privatePlay, halfAndHalf, evaluationBoarding, unknown };
}

function countDepartureBaths(
  rows: Array<{
    services: any[];
    startKey?: string;
    endKey?: string;
    check_out_date?: string | null;
  }>,
  targetDate: string,
): number {
  let baths = 0;
  for (const row of rows) {
    const bathServices = extractBathLikeServices(row.services || [], []);
    const { scheduledToday } = getBathSchedulingForDate(bathServices, targetDate);
    if (scheduledToday) {
      baths += 1;
      continue;
    }

    if (
      row.endKey === targetDate &&
      calculateNights(row.startKey, row.endKey) === 1 &&
      bathServices.length === 0 &&
      !isCheckedOutBeforeDate(row, targetDate)
    ) {
      baths += 1;
    }
  }
  return baths;
}

function uniqueMedicationDogs(rows: Array<{ animalId: string; services: any[] }>, targetDate: string): number {
  const animalIds = new Set<string>();
  for (const row of rows) {
    if (isMedicationService(row.services || [], targetDate)) {
      animalIds.add(row.animalId);
    }
  }
  return animalIds.size;
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function buildBlockerDetails(
  rows: any[],
  targetDate: string,
  scope: "opening_boarding" | "closing_boarding" | "daytime",
) {
  const grouped = new Map<string, { kind: string; count: number; scope: string; dogIds: string[]; label: string }>();

  const scopeSuffix = scope === "opening_boarding"
    ? "in opening boarding"
    : scope === "closing_boarding"
      ? "in closing boarding"
      : "in daytime volume";

  for (const row of rows) {
    const stayDayIndex = getStayDayIndex(row, targetDate);
    let kind: string | null = null;
    let label = "";

    if (row?.cls === "boarding" && row?.unresolvedPlaygroupReason === "evaluation_only" && stayDayIndex && stayDayIndex > 1) {
      kind = "evaluation_boarding_pending_playgroup_outcome";
      label = `${pluralize(1, "evaluation boarder")} pending playgroup outcome ${scopeSuffix}`;
    } else if (row?.unresolvedPlaygroupReason === "conflicting_size_icons") {
      kind = "unresolved_playgroup_conflict";
      label = `${pluralize(1, "unresolved playgroup conflict")} ${scopeSuffix}`;
    } else if (row?.unresolvedPlaygroupReason === "missing_actionable_play_icon" || row?.unresolvedPlaygroupReason === "no_actionable_icon") {
      kind = "missing_actionable_play_icon";
      label = `${pluralize(1, "dog")} missing actionable play icon ${scopeSuffix}`;
    }

    if (!kind) continue;

    const key = `${scope}:${kind}`;
    const existing = grouped.get(key) || {
      kind,
      count: 0,
      scope,
      dogIds: [],
      label,
    };
    existing.count += 1;
    if (row?.animalId) existing.dogIds.push(String(row.animalId));
    grouped.set(key, existing);
  }

  return Array.from(grouped.values()).map((detail) => {
    let label = detail.label;
    if (detail.count > 1) {
      if (detail.kind === "evaluation_boarding_pending_playgroup_outcome") {
        label = `${pluralize(detail.count, "evaluation boarder")} pending playgroup outcome ${scopeSuffix}`;
      } else if (detail.kind === "unresolved_playgroup_conflict") {
        label = `${pluralize(detail.count, "unresolved playgroup conflict")} ${scopeSuffix}`;
      } else {
        label = `${pluralize(detail.count, "dog")} missing actionable play icon ${scopeSuffix}`;
      }
    }

    return {
      kind: detail.kind,
      label,
      count: detail.count,
      scope: detail.scope,
      dog_ids: [...new Set(detail.dogIds)],
    };
  });
}

export function buildTrustPayload({
  blockerDetails,
  roomCountsEstimated,
}: {
  blockerDetails: Array<{ kind: string; label: string; count: number; scope: string; dog_ids: string[] }>;
  roomCountsEstimated: boolean;
}) {
  const notes: string[] = [];

  if (roomCountsEstimated) {
    notes.push("Room occupancy counts are estimated from the latest available room totals.");
  }

  return {
    state: "trusted",
    source: "gingr_reservations + v_dog_playgroup_assignments_current",
    can_generate: blockerDetails.length === 0,
    blockers: blockerDetails.map((detail) => detail.label),
    blocker_details: blockerDetails,
    notes,
  };
}

function buildAssignmentSnapshot(row: any, targetDate: string) {
  const assignment = row.playgroupAssignment;
  const stayDayIndex = getStayDayIndex(row, targetDate);
  const isEvaluationBoarding = isEvaluationBoardingToday(row, targetDate);
  return {
    animal_gingr_id: row.animalId,
    animal_name: String(row.animal_name || ""),
    reservation_gingr_id: String(row.gingr_id || ""),
    reservation_type_name: String(row.reservation_type_name || ""),
    scheduling_playgroup: row.playgroup === "unknown" ? null : row.playgroup,
    primary_display_playgroup: assignment?.primaryDisplayPlaygroup || null,
    is_half_and_half: !!assignment?.isHalfAndHalf,
    playgroup_tags: assignment?.playgroupTags || [],
    source_icon_titles: assignment?.sourceIconTitles || [],
    source_icon_comments: assignment?.sourceIconComments || [],
    unresolved_reason: row.unresolvedPlaygroupReason || null,
    half_and_half_note: assignment?.halfAndHalfNote || null,
    classification_reason: isEvaluationBoarding
      ? "evaluation_only_boarding_day_1"
      : row.cls === "evaluation"
        ? "explicit_evaluation_reservation_type"
        : row.isFirstEverDaycareVisit
          ? "first_ever_daycare_visit"
          : row.isHalfAndHalf
            ? "half_and_half"
            : row.playgroup === "large"
              ? "large_playgroup"
              : row.playgroup === "small"
                ? "small_playgroup"
                : row.playgroup === "private_play"
                  ? "private_play"
                  : row.unresolvedPlaygroupReason || null,
    evaluation_source: getEvaluationSource(row),
    stay_day_index: stayDayIndex,
    is_evaluation_boarding_today: isEvaluationBoarding,
  };
}

function buildDisplayShape({
  openingCounts,
  closingCounts,
  daycareCounts,
  dayboardingCounts,
  evaluationsCount,
  departureBaths,
  medicationDogs,
  toursCount,
}: {
  openingCounts: ReturnType<typeof splitCounts>;
  closingCounts: ReturnType<typeof splitCounts>;
  daycareCounts: ReturnType<typeof splitCounts>;
  dayboardingCounts: ReturnType<typeof splitCounts>;
  evaluationsCount: number;
  departureBaths: number;
  medicationDogs: number;
  toursCount: number;
}) {
  const daytimeHalfAndHalf = daycareCounts.halfAndHalf + dayboardingCounts.halfAndHalf;
  const daytimeLarge = daycareCounts.large + dayboardingCounts.large;
  const daytimeSmall = daycareCounts.small + dayboardingCounts.small;
  const daytimePrivatePlay = daycareCounts.privatePlay + dayboardingCounts.privatePlay;

  const opening = {
    large_boarding: openingCounts.large,
    small_boarding: openingCounts.small,
    private_play_boarding: openingCounts.privatePlay,
    half_and_half_boarding: openingCounts.halfAndHalf,
    evaluation_boarding: openingCounts.evaluationBoarding,
    unclassified_boarding: openingCounts.unknown,
  };
  const closing = {
    large_boarding: closingCounts.large,
    small_boarding: closingCounts.small,
    private_play_boarding: closingCounts.privatePlay,
    half_and_half_boarding: closingCounts.halfAndHalf,
    evaluation_boarding: closingCounts.evaluationBoarding,
    unclassified_boarding: closingCounts.unknown,
  };
  const daycare = {
    evaluations: evaluationsCount,
    private_play_dayboarding: daytimePrivatePlay,
    half_and_half_daytime: daytimeHalfAndHalf,
    large_daycare: daytimeLarge,
    small_daycare: daytimeSmall,
    unclassified_daycare: daycareCounts.unknown + dayboardingCounts.unknown,
  };

  const openingTotal =
    opening.large_boarding
    + opening.small_boarding
    + opening.private_play_boarding
    + opening.half_and_half_boarding
    + opening.evaluation_boarding
    + opening.unclassified_boarding;
  const closingTotal =
    closing.large_boarding
    + closing.small_boarding
    + closing.private_play_boarding
    + closing.half_and_half_boarding
    + closing.evaluation_boarding
    + closing.unclassified_boarding;
  const daycareTotal =
    daycare.evaluations
    + daycare.private_play_dayboarding
    + daycare.half_and_half_daytime
    + daycare.large_daycare
    + daycare.small_daycare
    + daycare.unclassified_daycare;
  const playYard = {
    large_play_dogs: Math.max(opening.large_boarding, closing.large_boarding) + daycare.large_daycare,
    small_play_dogs: Math.max(opening.small_boarding, closing.small_boarding) + daycare.small_daycare,
    private_play_dogs: Math.max(opening.private_play_boarding, closing.private_play_boarding) + daycare.private_play_dayboarding,
    split_play_dogs: Math.max(opening.half_and_half_boarding, closing.half_and_half_boarding) + daycare.half_and_half_daytime,
  };

  return {
    opening: {
      ...opening,
      total_boarding: openingTotal,
    },
    closing: {
      ...closing,
      total_boarding: closingTotal,
    },
    daycare: {
      ...daycare,
      total_daycare: daycareTotal,
    },
    support: {
      departure_baths: departureBaths,
      morning_feeding_dogs: openingTotal,
      evening_feeding_dogs: closingTotal,
      medication_dogs: medicationDogs,
      tours: toursCount,
      total_dog_volume: closingTotal + daycareTotal,
    },
    play_yard: playYard,
  };
}

function flattenDisplay(display: any) {
  return {
    opening_large_boarding: Number(display?.opening?.large_boarding || 0),
    opening_small_boarding: Number(display?.opening?.small_boarding || 0),
    opening_private_play_boarding: Number(display?.opening?.private_play_boarding || 0),
    opening_half_and_half_boarding: Number(display?.opening?.half_and_half_boarding || 0),
    opening_evaluation_boarding: Number(display?.opening?.evaluation_boarding || 0),
    opening_unclassified_boarding: Number(display?.opening?.unclassified_boarding || 0),
    closing_large_boarding: Number(display?.closing?.large_boarding || 0),
    closing_small_boarding: Number(display?.closing?.small_boarding || 0),
    closing_private_play_boarding: Number(display?.closing?.private_play_boarding || 0),
    closing_half_and_half_boarding: Number(display?.closing?.half_and_half_boarding || 0),
    closing_evaluation_boarding: Number(display?.closing?.evaluation_boarding || 0),
    closing_unclassified_boarding: Number(display?.closing?.unclassified_boarding || 0),
    daycare_evaluations: Number(display?.daycare?.evaluations || 0),
    daycare_private_play_dayboarding: Number(display?.daycare?.private_play_dayboarding || 0),
    daycare_half_and_half_daytime: Number(display?.daycare?.half_and_half_daytime || 0),
    daycare_large_daycare: Number(display?.daycare?.large_daycare || 0),
    daycare_small_daycare: Number(display?.daycare?.small_daycare || 0),
    daycare_unclassified_daycare: Number(display?.daycare?.unclassified_daycare || 0),
    support_departure_baths: Number(display?.support?.departure_baths || 0),
    support_morning_feeding_dogs: Number(display?.support?.morning_feeding_dogs || 0),
    support_evening_feeding_dogs: Number(display?.support?.evening_feeding_dogs || 0),
    support_medication_dogs: Number(display?.support?.medication_dogs || 0),
    support_total_dog_volume: Number(display?.support?.total_dog_volume || 0),
    support_tours: Number(display?.support?.tours || 0),
    play_yard_large_play_dogs: Number(display?.play_yard?.large_play_dogs || 0),
    play_yard_small_play_dogs: Number(display?.play_yard?.small_play_dogs || 0),
    play_yard_private_play_dogs: Number(display?.play_yard?.private_play_dogs || 0),
    play_yard_split_play_dogs: Number(display?.play_yard?.split_play_dogs || 0),
  };
}

const DERIVED_PROJECTION_METRIC_KEYS = new Set([
  "support_morning_feeding_dogs",
  "support_evening_feeding_dogs",
  "support_total_dog_volume",
  "play_yard_large_play_dogs",
  "play_yard_small_play_dogs",
  "play_yard_private_play_dogs",
  "play_yard_split_play_dogs",
]);

function buildDisplayFromFlat(flat: Record<string, number>) {
  return buildDisplayShape({
    openingCounts: {
      large: Number(flat.opening_large_boarding || 0),
      small: Number(flat.opening_small_boarding || 0),
      privatePlay: Number(flat.opening_private_play_boarding || 0),
      halfAndHalf: Number(flat.opening_half_and_half_boarding || 0),
      evaluationBoarding: Number(flat.opening_evaluation_boarding || 0),
      unknown: Number(flat.opening_unclassified_boarding || 0),
    },
    closingCounts: {
      large: Number(flat.closing_large_boarding || 0),
      small: Number(flat.closing_small_boarding || 0),
      privatePlay: Number(flat.closing_private_play_boarding || 0),
      halfAndHalf: Number(flat.closing_half_and_half_boarding || 0),
      evaluationBoarding: Number(flat.closing_evaluation_boarding || 0),
      unknown: Number(flat.closing_unclassified_boarding || 0),
    },
    daycareCounts: {
      large: Number(flat.daycare_large_daycare || 0),
      small: Number(flat.daycare_small_daycare || 0),
      privatePlay: Number(flat.daycare_private_play_dayboarding || 0),
      halfAndHalf: Number(flat.daycare_half_and_half_daytime || 0),
      evaluationBoarding: 0,
      unknown: Number(flat.daycare_unclassified_daycare || 0),
    },
    dayboardingCounts: {
      large: 0,
      small: 0,
      privatePlay: 0,
      halfAndHalf: 0,
      evaluationBoarding: 0,
      unknown: 0,
    },
    evaluationsCount: Number(flat.daycare_evaluations || 0),
    departureBaths: Number(flat.support_departure_baths || 0),
    medicationDogs: Number(flat.support_medication_dogs || 0),
    toursCount: Number(flat.support_tours || 0),
  });
}

export function computeDemandSnapshotForDate({
  targetDate,
  reservations,
  roomByDate,
  totalRooms,
}: {
  targetDate: string;
  reservations: any[];
  roomByDate: Record<string, { occupied: number; available: number; total: number }>;
  totalRooms: number;
}) {
  const activeToday = reservations.filter((row) =>
    row.startKey <= targetDate &&
    row.endKey >= targetDate &&
    !isCheckedOutBeforeDate(row, targetDate)
  );

  const openingBoarding = activeToday.filter((row) =>
    row.cls === "boarding" &&
    row.startKey < targetDate &&
    wasCheckedInBeforeDate(row, targetDate)
  );
  const closingBoarding = activeToday.filter((row) =>
    row.cls === "boarding" &&
    row.endKey > targetDate &&
    !isCheckedOutByDate(row, targetDate)
  );
  const activeBoardingForPeak = activeToday.filter((row) => row.cls === "boarding" && !isEvaluationBoardingToday(row, targetDate));
  const evaluations = activeToday.filter((row) => row.cls === "evaluation" || row.isFirstEverDaycareVisit);
  const activeDaycare = activeToday.filter((row) => row.cls === "daycare" && !row.isFirstEverDaycareVisit);
  const activeDayboarding = activeToday.filter((row) => row.cls === "dayboarding");
  const tours = activeToday.filter((row) => row.cls === "tour");

  const openingCounts = splitCounts(openingBoarding, targetDate);
  const closingCounts = splitCounts(closingBoarding, targetDate);
  const daycareCounts = splitCounts(activeDaycare, targetDate);
  const dayboardingCounts = splitCounts(activeDayboarding, targetDate);
  const peakCounts = splitCounts([...activeBoardingForPeak, ...activeDaycare, ...activeDayboarding], targetDate);

  const dogsArriving = countDistinctAnimals(
    activeToday.filter((row) => row.startKey === targetDate && row.cls !== "tour" && row.cls !== "grooming"),
  );
  const dogsDeparting = countDistinctAnimals(
    activeToday.filter((row) => row.endKey === targetDate && row.cls !== "tour" && row.cls !== "grooming"),
  );
  const departureBaths = countDepartureBaths(
    activeToday.filter((row) => row.cls === "boarding" && row.endKey === targetDate),
    targetDate,
  );
  const medicationDogs = uniqueMedicationDogs(activeToday, targetDate);
  const roomSummary = roomByDate[targetDate];
  const display = buildDisplayShape({
    openingCounts,
    closingCounts,
    daycareCounts,
    dayboardingCounts,
    evaluationsCount: evaluations.length,
    departureBaths,
    medicationDogs,
    toursCount: tours.length,
  });
  const roomCountsEstimated = !roomSummary && totalRooms > 0;

  return {
    openingBoarding,
    closingBoarding,
    activeDaycare,
    activeDayboarding,
    evaluations,
    tours,
    openingCounts,
    closingCounts,
    daycareCounts,
    dayboardingCounts,
    peakCounts,
    dogsArriving,
    dogsDeparting,
    departureBaths,
    medicationDogs,
    roomSummary,
    roomCountsEstimated,
    display,
    solverInputs: {
      peak_large_daycare: peakCounts.large,
      peak_small_daycare: peakCounts.small,
      peak_unknown_daycare: peakCounts.unknown,
      play_yard_large_dogs: display.play_yard.large_play_dogs,
      play_yard_small_dogs: display.play_yard.small_play_dogs,
      play_yard_private_play_dogs: display.play_yard.private_play_dogs,
      play_yard_split_play_dogs: display.play_yard.split_play_dogs,
      total_private_play_dogs:
        openingCounts.privatePlay
        + openingCounts.halfAndHalf
        + daycareCounts.privatePlay
        + daycareCounts.halfAndHalf
        + dayboardingCounts.privatePlay
        + dayboardingCounts.halfAndHalf,
      morning_feeding_dogs: display.support.morning_feeding_dogs,
      evening_feeding_dogs: display.support.evening_feeding_dogs,
      medication_dogs: medicationDogs,
    },
    roomsOccupied: roomSummary?.occupied ?? display.closing.total_boarding,
    roomsAvailable: roomSummary?.available ?? Math.max((roomSummary?.total || totalRooms || 0) - (roomSummary?.occupied ?? display.closing.total_boarding), 0),
    resolvedTotalRooms: roomSummary?.total || totalRooms || 0,
  };
}

function projectionWeight(candidate: ProjectionCandidate) {
  const recencyWeight = 1 / candidate.yearOffset;
  const distanceWeight = candidate.dateDistance === 0 ? 1 : 1 / (candidate.dateDistance + 1);
  return recencyWeight * distanceWeight;
}

export function buildProjectionForDate({
  targetDate,
  currentDate,
  currentSnapshot,
  historicalReservations,
  roomByDate,
  totalRooms,
}: {
  targetDate: string;
  currentDate: string;
  currentSnapshot: ReturnType<typeof computeDemandSnapshotForDate>;
  historicalReservations: any[];
  roomByDate: Record<string, { occupied: number; available: number; total: number }>;
  totalRooms: number;
}) {
  const leadDays = Math.max(0, diffDays(currentDate, targetDate));
  const currentFlat = flattenDisplay(currentSnapshot.display);
  const exactLastYear = shiftYearsStr(targetDate, -1);
  const exactLastYearReservations = historicalReservations.filter((row) => row.startKey <= exactLastYear && row.endKey >= exactLastYear);
  const exactLastYearSnapshot = exactLastYearReservations.length > 0
    ? computeDemandSnapshotForDate({
      targetDate: exactLastYear,
      reservations: historicalReservations,
      roomByDate,
      totalRooms,
    })
    : null;
  const exactLastYearDisplay = exactLastYearSnapshot?.display || null;

  if (leadDays <= 0) {
    return {
      as_of_date: currentDate,
      lead_days: leadDays,
      state: "actual",
      display: currentSnapshot.display,
      exact_last_year_display: exactLastYearDisplay,
      comparisons: {
        last_year_total_dog_volume: Number(exactLastYearDisplay?.support?.total_dog_volume ?? 0) || null,
      },
      explanations: {},
      sample_count: 0,
    };
  }

  const candidates = getProjectionCandidates(targetDate);
  const projectedFlat: Record<string, number> = { ...currentFlat };
  const explanations: Record<string, any> = {};
  let exactLastYearDisplayProjected: any = exactLastYearDisplay;
  let sampleCount = 0;

  const historicalFinalCache = new Map<string, ReturnType<typeof computeDemandSnapshotForDate>>();
  const historicalAsOfCache = new Map<string, ReturnType<typeof computeDemandSnapshotForDate>>();

  const getHistoricalSnapshot = (sampleDate: string, asOfDate?: string) => {
    const cacheKey = `${sampleDate}|${asOfDate || "final"}`;
    const existing = asOfDate ? historicalAsOfCache.get(cacheKey) : historicalFinalCache.get(cacheKey);
    if (existing) return existing;

    const snapshotReservations = asOfDate
      ? historicalReservations.filter((row) => !row.bookedDateKey || row.bookedDateKey <= asOfDate)
      : historicalReservations;

    const snapshot = computeDemandSnapshotForDate({
      targetDate: sampleDate,
      reservations: snapshotReservations,
      roomByDate,
      totalRooms,
    });

    if (asOfDate) historicalAsOfCache.set(cacheKey, snapshot);
    else historicalFinalCache.set(cacheKey, snapshot);
    return snapshot;
  };

  const samples = candidates.map((candidate) => {
    const sampleDate = candidate.sampleDate;
    const finalSnapshot = getHistoricalSnapshot(sampleDate);
    const asOfDate = addDaysStr(sampleDate, -leadDays);
    const asOfSnapshot = getHistoricalSnapshot(sampleDate, asOfDate);
    const weight = projectionWeight(candidate);
    if (sampleDate === exactLastYear) {
      exactLastYearDisplayProjected = finalSnapshot.display;
    }
    return {
      ...candidate,
      sampleDate,
      weight,
      asOfDate,
      finalFlat: flattenDisplay(finalSnapshot.display),
      asOfFlat: flattenDisplay(asOfSnapshot.display),
      finalDisplay: finalSnapshot.display,
    };
  });

  const metricKeys = Object.keys(currentFlat);

  for (const metricKey of metricKeys) {
    const currentValue = Number(currentFlat[metricKey] || 0);
    const exactSample = samples.find((sample) => sample.fallbackMode === "exact_prior_year") || null;
    const exactLastYearFinal = exactSample ? Number(exactSample.finalFlat[metricKey] || 0) : 0;
    const exactLastYearAsOf = exactSample ? Number(exactSample.asOfFlat[metricKey] || 0) : 0;
    const explanationKey = metricKey.replaceAll(".", "_");

    const usableByMode = new Map<ProjectionFallbackMode, any[]>();
    for (const mode of [
      "exact_prior_year",
      "same_weekday_prior_year",
      "exact_prior_years_2_to_4",
      "same_weekday_prior_years_2_to_4",
    ] as ProjectionFallbackMode[]) {
      usableByMode.set(
        mode,
        samples.filter((sample) => {
          if (sample.fallbackMode !== mode) return false;
          const finalValue = Number(sample.finalFlat[metricKey] || 0);
          const asOfValue = Number(sample.asOfFlat[metricKey] || 0);
          if (finalValue <= 0) return false;
          if (currentValue === 0) return true;
          return asOfValue > 0;
        }),
      );
    }

    const chosenMode = (
      usableByMode.get("exact_prior_year")?.length
        ? "exact_prior_year"
        : usableByMode.get("same_weekday_prior_year")?.length
          ? "same_weekday_prior_year"
          : usableByMode.get("exact_prior_years_2_to_4")?.length
            ? "exact_prior_years_2_to_4"
            : usableByMode.get("same_weekday_prior_years_2_to_4")?.length
              ? "same_weekday_prior_years_2_to_4"
              : null
    ) as ProjectionFallbackMode | null;

    const usableSamples = chosenMode ? usableByMode.get(chosenMode) || [] : [];
    sampleCount = Math.max(sampleCount, usableSamples.length);

    if (!usableSamples.length) {
      explanations[explanationKey] = {
        target_date: targetDate,
        as_of_date: currentDate,
        current_value: currentValue,
        projected_value: currentValue,
        lead_days: leadDays,
        exact_prior_year_as_of: exactLastYearAsOf || null,
        exact_prior_year_final: exactLastYearFinal || null,
        completion_rate: exactLastYearFinal > 0 && exactLastYearAsOf > 0
          ? Number((exactLastYearAsOf / exactLastYearFinal).toFixed(4))
          : null,
        fallback_mode: "carry_forward_no_history",
        sample_count: 0,
      };
      continue;
    }

    const weights = usableSamples.map((sample) => sample.weight);
    const finalValues = usableSamples.map((sample) => Number(sample.finalFlat[metricKey] || 0));
    const asOfValues = usableSamples.map((sample) => Number(sample.asOfFlat[metricKey] || 0));
    const weightedFinal = weightedAverage(finalValues, weights, currentValue);
    const weightedAsOf = weightedAverage(asOfValues, weights, 0);
    const completionRate = currentValue === 0
      ? (weightedFinal > 0 ? clampNumber(weightedAsOf / weightedFinal, 0, 1) : 0)
      : (weightedFinal > 0 && weightedAsOf > 0 ? clampNumber(weightedAsOf / weightedFinal, 0.01, 1) : 0);

    const projectedValue = currentValue === 0
      ? Math.round(weightedFinal)
      : completionRate > 0
        ? Math.round(currentValue / completionRate)
        : currentValue;

    projectedFlat[metricKey] = Math.max(currentValue, projectedValue);
    explanations[explanationKey] = {
      target_date: targetDate,
      as_of_date: currentDate,
      current_value: currentValue,
      projected_value: projectedFlat[metricKey],
      lead_days: leadDays,
      exact_prior_year_as_of: exactLastYearAsOf || null,
      exact_prior_year_final: exactLastYearFinal || null,
      completion_rate: completionRate > 0 ? Number(completionRate.toFixed(4)) : null,
      fallback_mode: chosenMode,
      sample_count: usableSamples.length,
      sample_dates: usableSamples.map((sample) => sample.sampleDate),
      baseline_final_average: Number(weightedFinal.toFixed(2)),
    };
  }

  const projectedDisplay = buildDisplayFromFlat(projectedFlat);
  const derivedProjectedFlat = flattenDisplay(projectedDisplay);
  for (const metricKey of DERIVED_PROJECTION_METRIC_KEYS) {
    const explanationKey = metricKey.replaceAll(".", "_");
    const existing = explanations[explanationKey] || {};
    const derivedProjectedValue = Number(derivedProjectedFlat[metricKey] || 0);
    const existingProjectedValue = Number(existing.projected_value);
    const projectedValueChanged = !Number.isFinite(existingProjectedValue) || existingProjectedValue !== derivedProjectedValue;
    explanations[explanationKey] = {
      ...existing,
      target_date: targetDate,
      as_of_date: currentDate,
      current_value: Number(currentFlat[metricKey] || 0),
      projected_value: derivedProjectedValue,
      lead_days: leadDays,
      completion_rate: projectedValueChanged ? null : existing.completion_rate,
      fallback_mode: projectedValueChanged ? "derived_from_projected_components" : existing.fallback_mode,
    };
  }

  return {
    as_of_date: currentDate,
    lead_days: leadDays,
    state: "projected",
    display: projectedDisplay,
    exact_last_year_display: exactLastYearDisplayProjected,
    comparisons: {
      last_year_total_dog_volume: Number(exactLastYearDisplayProjected?.support?.total_dog_volume ?? 0) || null,
    },
    explanations,
    sample_count: sampleCount,
  };
}

export async function computeSchedulingMatrixRows({
  supabase,
  locationId,
  dateFrom,
  dateTo,
}: {
  supabase: SupabaseClient;
  locationId: string;
  dateFrom: string;
  dateTo: string;
}) {
  const targetDates = enumerateDates(dateFrom, dateTo);
  const exactHistoricalDates = [...new Set(targetDates.map((dateKey) => shiftYearsStr(dateKey, -1)))];
  const exactHistoricalOverlapFilter = buildDateOverlapOrFilter(exactHistoricalDates);

  const [resTypesRes, roomOccRes, runsRes, reservationsRes, exactHistoricalReservationsRes, playgroupAssignments] = await Promise.all([
    supabase
      .from("gingr_reservation_types")
      .select("gingr_id, name, is_boarding, is_daycare, single_day")
      .eq("location_id", locationId),
    supabase
      .from("gingr_occupancy_snapshot")
      .select("snapshot_date, number_occupied, number_available, total_runs")
      .eq("location_id", locationId)
      .gte("snapshot_date", dateFrom)
      .lte("snapshot_date", dateTo),
    supabase
      .from("gingr_runs")
      .select("gingr_run_id, id")
      .eq("location_id", locationId),
    supabase
      .from("gingr_reservations")
      .select("gingr_id, animal_gingr_id, animal_name, reservation_type_id, reservation_type_name, start_date, end_date, check_in_date, check_out_date, cancelled_date, created_date, confirmed_date, created_at, services")
      .eq("location_id", locationId)
      .is("cancelled_date", null)
      .lt("start_date", `${addDaysStr(dateTo, 1)}T00:00:00`)
      .gte("end_date", `${dateFrom}T00:00:00`),
    exactHistoricalOverlapFilter
      ? supabase
        .from("gingr_reservations")
        .select("gingr_id, animal_gingr_id, animal_name, reservation_type_id, reservation_type_name, start_date, end_date, check_in_date, check_out_date, cancelled_date, created_date, confirmed_date, created_at, services")
        .eq("location_id", locationId)
        .is("cancelled_date", null)
        .or(exactHistoricalOverlapFilter)
      : Promise.resolve({ data: [], error: null }),
    fetchPlaygroupAssignments({
      supabase,
      locationId,
    }),
  ]);

  if (reservationsRes.error) throw reservationsRes.error;
  if (exactHistoricalReservationsRes.error) throw exactHistoricalReservationsRes.error;
  if (resTypesRes.error) throw resTypesRes.error;
  if (roomOccRes.error) throw roomOccRes.error;
  if (runsRes.error) throw runsRes.error;

  const resTypeMaps = buildReservationTypeMaps(resTypesRes.data || []);

  const playgroupMap = buildPlaygroupAssignmentMap(playgroupAssignments || []);

  const totalRooms = new Set(
    (runsRes.data || [])
      .map((row: any) => String(row.gingr_run_id || row.id || ""))
      .filter(Boolean),
  ).size;
  const roomByDate = summarizeRoomOccupancy(roomOccRes.data || []);
  const historicalFetchCache = new Map<string, any[]>();
  const fetchReservationRecordsForDateKeys = async (dateKeys: string[]) => {
    const normalizedDateKeys = [...new Set((dateKeys || []).filter(Boolean))].sort();
    if (!normalizedDateKeys.length) return [];

    const cacheKey = normalizedDateKeys.join("|");
    const cached = historicalFetchCache.get(cacheKey);
    if (cached) return cached;

    const overlapFilter = buildDateOverlapOrFilter(normalizedDateKeys);
    if (!overlapFilter) {
      historicalFetchCache.set(cacheKey, []);
      return [];
    }

    const { data, error } = await supabase
      .from("gingr_reservations")
      .select("gingr_id, animal_gingr_id, animal_name, reservation_type_id, reservation_type_name, start_date, end_date, check_in_date, check_out_date, cancelled_date, created_date, confirmed_date, created_at, services")
      .eq("location_id", locationId)
      .is("cancelled_date", null)
      .or(overlapFilter);

    if (error) throw error;

    const records = (data || []).map((row: ReservationRow) =>
      buildReservationRecord(row, resTypeMaps, playgroupMap),
    );
    historicalFetchCache.set(cacheKey, records);
    return records;
  };

  const baseReservations = (reservationsRes.data || []).map((row: ReservationRow) =>
    buildReservationRecord(row, resTypeMaps, playgroupMap),
  );
  const exactHistoricalReservations = (exactHistoricalReservationsRes.data || []).map((row: ReservationRow) =>
    buildReservationRecord(row, resTypeMaps, playgroupMap),
  );
  const baseHistoricalReservations = [...exactHistoricalReservations];

  for (const targetDate of targetDates) {
    const exactSampleDate = shiftYearsStr(targetDate, -1);
    const exactActiveRows = exactHistoricalReservations.filter((row) => row.startKey <= exactSampleDate && row.endKey >= exactSampleDate);
    const hasExactOperationalRows = exactActiveRows.some((row) => row.cls !== "tour" && row.cls !== "grooming");
    if (hasExactOperationalRows) continue;

    for (const fallbackMode of [
      "same_weekday_prior_year",
      "exact_prior_years_2_to_4",
      "same_weekday_prior_years_2_to_4",
    ] as ProjectionFallbackMode[]) {
      const candidateDates = getProjectionCandidates(targetDate)
        .filter((candidate) => candidate.fallbackMode === fallbackMode)
        .map((candidate) => candidate.sampleDate);
      const fallbackRows = await fetchReservationRecordsForDateKeys(candidateDates);
      const hasFallbackOperationalRows = candidateDates.some((sampleDate) =>
        fallbackRows.some((row) => row.startKey <= sampleDate && row.endKey >= sampleDate && row.cls !== "tour" && row.cls !== "grooming"),
      );

      for (const row of fallbackRows) {
        if (!baseHistoricalReservations.some((existing) => existing.gingr_id === row.gingr_id)) {
          baseHistoricalReservations.push(row);
        }
      }

      if (hasFallbackOperationalRows) break;
    }
  }

  const earliestOperationalStartByAnimal = await fetchEarliestOperationalStartDates({
    supabase,
    locationId,
    animalIds: [
      ...baseReservations.map((row: any) => row.animalId),
      ...baseHistoricalReservations.map((row: any) => row.animalId),
    ],
    resTypeMaps,
  });
  const reservations = annotateReservationsWithOperationalHistory(baseReservations, earliestOperationalStartByAnimal);
  const historicalReservations = annotateReservationsWithOperationalHistory(baseHistoricalReservations, earliestOperationalStartByAnimal);

  const rows = [];
  const currentDate = dateStrET();
  for (const targetDate of targetDates) {
    const snapshot = computeDemandSnapshotForDate({
      targetDate,
      reservations,
      roomByDate,
      totalRooms,
    });
    const projection = buildProjectionForDate({
      targetDate,
      currentDate,
      currentSnapshot: snapshot,
      historicalReservations,
      roomByDate,
      totalRooms,
    });

    const blockerDetails = [
      ...buildBlockerDetails(snapshot.openingBoarding, targetDate, "opening_boarding"),
      ...buildBlockerDetails(snapshot.closingBoarding, targetDate, "closing_boarding"),
      ...buildBlockerDetails([...snapshot.activeDaycare, ...snapshot.activeDayboarding], targetDate, "daytime"),
    ];

    const trust = buildTrustPayload({
      blockerDetails,
      roomCountsEstimated: snapshot.roomCountsEstimated,
    });

    rows.push({
      location_id: locationId,
      matrix_date: targetDate,
      boarding_large: snapshot.openingCounts.large,
      boarding_small: snapshot.openingCounts.small,
      boarding_unknown_size: snapshot.openingCounts.unknown,
      daycare_large: snapshot.daycareCounts.large,
      daycare_small: snapshot.daycareCounts.small,
      daycare_unknown_size: snapshot.daycareCounts.unknown + snapshot.dayboardingCounts.unknown,
      pp_dayboarders: snapshot.display.daycare.private_play_dayboarding,
      pp_overnight_boarders: snapshot.openingCounts.privatePlay,
      departure_baths: snapshot.departureBaths,
      evaluations: snapshot.evaluations.length,
      tours: snapshot.tours.length,
      gross_dogs_in_building: snapshot.display.support.total_dog_volume,
      feeding_dogs: snapshot.display.support.evening_feeding_dogs,
      medication_dogs: snapshot.medicationDogs,
      dogs_arriving: snapshot.dogsArriving,
      dogs_departing: snapshot.dogsDeparting,
      dogs_checked_out: 0,
      rooms_occupied: snapshot.roomsOccupied,
      rooms_available: snapshot.roomsAvailable,
      total_rooms: snapshot.resolvedTotalRooms,
      detail_json: {
        trust,
        display: snapshot.display,
        projection,
        solver_inputs: snapshot.solverInputs,
        provenance: {
          opening_boarding: snapshot.openingBoarding.map((row: any) => buildAssignmentSnapshot(row, targetDate)),
          closing_boarding: snapshot.closingBoarding.map((row: any) => buildAssignmentSnapshot(row, targetDate)),
          daytime_daycare: snapshot.activeDaycare.map((row: any) => buildAssignmentSnapshot(row, targetDate)),
          daytime_dayboarding: snapshot.activeDayboarding.map((row: any) => buildAssignmentSnapshot(row, targetDate)),
          evaluations: snapshot.evaluations.map((row: any) => buildAssignmentSnapshot(row, targetDate)),
        },
      },
      computed_at: new Date().toISOString(),
    });
  }

  return rows;
}

export async function upsertSchedulingMatrixRows(
  supabase: SupabaseClient,
  rows: any[],
) {
  if (!rows.length) return { count: 0 };
  const { error } = await supabase
    .from("scheduling_matrix_daily")
    .upsert(rows, { onConflict: "location_id,matrix_date" });

  if (error) throw error;
  return { count: rows.length };
}

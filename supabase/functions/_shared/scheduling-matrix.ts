import {
  extractBathLikeServices,
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

function getProjectionReferenceDates(targetDate: string): string[] {
  const results = new Set<string>();
  const targetWeekday = getWeekday(targetDate);

  for (let yearOffset = 1; yearOffset <= 4; yearOffset += 1) {
    const anchor = shiftYearsStr(targetDate, -yearOffset);
    if (anchor >= targetDate) continue;
    results.add(anchor);

    for (let delta = -21; delta <= 21; delta += 1) {
      const candidate = addDaysStr(anchor, delta);
      if (candidate >= targetDate) continue;
      if (getWeekday(candidate) === targetWeekday) {
        results.add(candidate);
      }
    }
  }

  return Array.from(results).sort();
}

function buildHistoricalWindow(targetDates: string[]) {
  const references = new Set<string>();
  for (const date of targetDates) {
    for (const ref of getProjectionReferenceDates(date)) {
      references.add(ref);
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

function splitCounts(rows: Array<{ playgroup: string; isHalfAndHalf?: boolean }>) {
  let large = 0;
  let small = 0;
  let privatePlay = 0;
  let halfAndHalf = 0;
  let unknown = 0;

  for (const row of rows) {
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

  return { large, small, privatePlay, halfAndHalf, unknown };
}

function countDepartureBaths(rows: Array<{ services: any[] }>, targetDate: string): number {
  let baths = 0;
  for (const row of rows) {
    const bathServices = extractBathLikeServices(row.services || [], []);
    const { scheduledToday } = getBathSchedulingForDate(bathServices, targetDate);
    if (scheduledToday) baths += 1;
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

function buildTrustPayload({
  openingUnknown,
  closingUnknown,
  daycareUnknown,
  roomCountsEstimated,
}: {
  openingUnknown: number;
  closingUnknown: number;
  daycareUnknown: number;
  roomCountsEstimated: boolean;
}) {
  const blockers: string[] = [];
  const notes: string[] = [];

  if (openingUnknown > 0) {
    blockers.push(`${openingUnknown} opening boarding dogs are missing a verified size/playgroup assignment.`);
  }
  if (closingUnknown > 0) {
    blockers.push(`${closingUnknown} closing boarding dogs are missing a verified size/playgroup assignment.`);
  }
  if (daycareUnknown > 0) {
    blockers.push(`${daycareUnknown} daytime dogs are missing a verified size/playgroup assignment.`);
  }
  if (roomCountsEstimated) {
    notes.push("Room occupancy counts are estimated from the latest available room totals.");
  }

  return {
    state: "trusted",
    source: "gingr_reservations + v_dog_playgroup_assignments_current",
    can_generate: blockers.length === 0,
    blockers,
    notes,
  };
}

function buildAssignmentSnapshot(row: any) {
  const assignment = row.playgroupAssignment;
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

  const opening = {
    large_boarding: openingCounts.large,
    small_boarding: openingCounts.small,
    private_play_boarding: openingCounts.privatePlay,
    half_and_half_boarding: openingCounts.halfAndHalf,
    unclassified_boarding: openingCounts.unknown,
  };
  const closing = {
    large_boarding: closingCounts.large,
    small_boarding: closingCounts.small,
    private_play_boarding: closingCounts.privatePlay,
    half_and_half_boarding: closingCounts.halfAndHalf,
    unclassified_boarding: closingCounts.unknown,
  };
  const daycare = {
    evaluations: evaluationsCount,
    private_play_dayboarding: daycareCounts.privatePlay + dayboardingCounts.privatePlay,
    half_and_half_daytime: daytimeHalfAndHalf,
    large_daycare: daycareCounts.large,
    small_daycare: daycareCounts.small,
    unclassified_daycare: daycareCounts.unknown,
  };

  const openingTotal =
    opening.large_boarding
    + opening.small_boarding
    + opening.private_play_boarding
    + opening.half_and_half_boarding
    + opening.unclassified_boarding;
  const closingTotal =
    closing.large_boarding
    + closing.small_boarding
    + closing.private_play_boarding
    + closing.half_and_half_boarding
    + closing.unclassified_boarding;
  const daycareTotal =
    daycare.evaluations
    + daycare.private_play_dayboarding
    + daycare.half_and_half_daytime
    + daycare.large_daycare
    + daycare.small_daycare
    + daycare.unclassified_daycare;

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
  };
}

function flattenDisplay(display: any) {
  return {
    opening_large_boarding: Number(display?.opening?.large_boarding || 0),
    opening_small_boarding: Number(display?.opening?.small_boarding || 0),
    opening_private_play_boarding: Number(display?.opening?.private_play_boarding || 0),
    opening_half_and_half_boarding: Number(display?.opening?.half_and_half_boarding || 0),
    opening_unclassified_boarding: Number(display?.opening?.unclassified_boarding || 0),
    closing_large_boarding: Number(display?.closing?.large_boarding || 0),
    closing_small_boarding: Number(display?.closing?.small_boarding || 0),
    closing_private_play_boarding: Number(display?.closing?.private_play_boarding || 0),
    closing_half_and_half_boarding: Number(display?.closing?.half_and_half_boarding || 0),
    closing_unclassified_boarding: Number(display?.closing?.unclassified_boarding || 0),
    daycare_evaluations: Number(display?.daycare?.evaluations || 0),
    daycare_private_play_dayboarding: Number(display?.daycare?.private_play_dayboarding || 0),
    daycare_half_and_half_daytime: Number(display?.daycare?.half_and_half_daytime || 0),
    daycare_large_daycare: Number(display?.daycare?.large_daycare || 0),
    daycare_small_daycare: Number(display?.daycare?.small_daycare || 0),
    daycare_unclassified_daycare: Number(display?.daycare?.unclassified_daycare || 0),
    support_departure_baths: Number(display?.support?.departure_baths || 0),
    support_medication_dogs: Number(display?.support?.medication_dogs || 0),
    support_tours: Number(display?.support?.tours || 0),
  };
}

function buildDisplayFromFlat(flat: Record<string, number>) {
  return buildDisplayShape({
    openingCounts: {
      large: Number(flat.opening_large_boarding || 0),
      small: Number(flat.opening_small_boarding || 0),
      privatePlay: Number(flat.opening_private_play_boarding || 0),
      halfAndHalf: Number(flat.opening_half_and_half_boarding || 0),
      unknown: Number(flat.opening_unclassified_boarding || 0),
    },
    closingCounts: {
      large: Number(flat.closing_large_boarding || 0),
      small: Number(flat.closing_small_boarding || 0),
      privatePlay: Number(flat.closing_private_play_boarding || 0),
      halfAndHalf: Number(flat.closing_half_and_half_boarding || 0),
      unknown: Number(flat.closing_unclassified_boarding || 0),
    },
    daycareCounts: {
      large: Number(flat.daycare_large_daycare || 0),
      small: Number(flat.daycare_small_daycare || 0),
      privatePlay: Number(flat.daycare_private_play_dayboarding || 0),
      halfAndHalf: Number(flat.daycare_half_and_half_daytime || 0),
      unknown: Number(flat.daycare_unclassified_daycare || 0),
    },
    dayboardingCounts: {
      large: 0,
      small: 0,
      privatePlay: 0,
      halfAndHalf: 0,
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
  const activeToday = reservations.filter((row) => row.startKey <= targetDate && row.endKey >= targetDate);

  const openingBoarding = activeToday.filter((row) => row.cls === "boarding" && row.startKey < targetDate);
  const closingBoarding = activeToday.filter((row) => row.cls === "boarding" && row.endKey > targetDate);
  const activeBoardingForPeak = activeToday.filter((row) => row.cls === "boarding");
  const activeDaycare = activeToday.filter((row) => row.cls === "daycare");
  const activeDayboarding = activeToday.filter((row) => row.cls === "dayboarding");
  const evaluations = activeToday.filter((row) => row.cls === "evaluation");
  const tours = activeToday.filter((row) => row.cls === "tour");

  const openingCounts = splitCounts(openingBoarding);
  const closingCounts = splitCounts(closingBoarding);
  const daycareCounts = splitCounts(activeDaycare);
  const dayboardingCounts = splitCounts(activeDayboarding);
  const peakCounts = splitCounts([...activeBoardingForPeak, ...activeDaycare]);

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

function projectionWeight(targetDate: string, sampleDate: string) {
  const exactLastYear = shiftYearsStr(targetDate, -1);
  if (sampleDate === exactLastYear) return 4;
  const distance = Math.abs(diffDays(sampleDate, exactLastYear));
  if (distance <= 7) return 2;
  return 1;
}

function buildProjectionForDate({
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
  const exactLastYearReservations = historicalReservations.filter((row) => row.startKey <= exactLastYear && row.endKey > exactLastYear);
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

  const referenceDates = getProjectionReferenceDates(targetDate);
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

  const samples = referenceDates.map((sampleDate) => {
    const finalSnapshot = getHistoricalSnapshot(sampleDate);
    const asOfDate = addDaysStr(sampleDate, -leadDays);
    const asOfSnapshot = getHistoricalSnapshot(sampleDate, asOfDate);
    const weight = projectionWeight(targetDate, sampleDate);
    if (sampleDate === exactLastYear) {
      exactLastYearDisplayProjected = finalSnapshot.display;
    }
    return {
      sampleDate,
      weight,
      finalFlat: flattenDisplay(finalSnapshot.display),
      asOfFlat: flattenDisplay(asOfSnapshot.display),
      finalDisplay: finalSnapshot.display,
    };
  });

  const metricKeys = Object.keys(currentFlat);

  for (const metricKey of metricKeys) {
    const currentValue = Number(currentFlat[metricKey] || 0);
    const usableSamples = samples.filter((sample) => Number(sample.finalFlat[metricKey] || 0) > 0);
    sampleCount = Math.max(sampleCount, usableSamples.length);

    if (!usableSamples.length) {
      explanations[metricKey] = {
        current_value: currentValue,
        projected_value: currentValue,
        lead_days: leadDays,
        method: "carry_forward_no_history",
        sample_count: 0,
      };
      continue;
    }

    const weights = usableSamples.map((sample) => sample.weight);
    const finalValues = usableSamples.map((sample) => Number(sample.finalFlat[metricKey] || 0));
    const baselineFinal = weightedAverage(finalValues, weights, currentValue);

    const multiplierSamples = usableSamples
      .map((sample) => {
        const asOfValue = Number(sample.asOfFlat[metricKey] || 0);
        const finalValue = Number(sample.finalFlat[metricKey] || 0);
        if (asOfValue <= 0 || finalValue <= 0) return null;
        return {
          weight: sample.weight,
          latePickupRatio: clampNumber((finalValue - asOfValue) / asOfValue, 0, 3),
          completionRate: clampNumber(asOfValue / finalValue, 0, 1),
          asOfValue,
          finalValue,
        };
      })
      .filter(Boolean) as Array<{ weight: number; latePickupRatio: number; completionRate: number; asOfValue: number; finalValue: number }>;

    let projectedValue = currentValue;
    let method = "carry_forward";
    let avgLatePickupRatio = 0;
    let avgCompletionRate = 1;

    if (currentValue === 0) {
      projectedValue = Math.round(baselineFinal);
      method = "seasonal_baseline";
    } else if (multiplierSamples.length > 0) {
      const multiplierWeights = multiplierSamples.map((sample) => sample.weight);
      avgLatePickupRatio = weightedAverage(
        multiplierSamples.map((sample) => sample.latePickupRatio),
        multiplierWeights,
        0,
      );
      avgCompletionRate = weightedAverage(
        multiplierSamples.map((sample) => sample.completionRate),
        multiplierWeights,
        1,
      );
      const pickupProjection = currentValue * (1 + avgLatePickupRatio);
      const pickupWeight = Math.min(0.8, multiplierSamples.length / 6);
      projectedValue = Math.round(
        (pickupProjection * pickupWeight) + (baselineFinal * (1 - pickupWeight)),
      );
      method = "pickup_curve_blend";
    } else {
      projectedValue = Math.round(baselineFinal);
      method = "baseline_only";
    }

    projectedFlat[metricKey] = Math.max(currentValue, projectedValue);
    explanations[metricKey] = {
      current_value: currentValue,
      projected_value: projectedFlat[metricKey],
      lead_days: leadDays,
      method,
      sample_count: usableSamples.length,
      avg_late_pickup_ratio: Number(avgLatePickupRatio.toFixed(4)),
      avg_completion_rate: Number(avgCompletionRate.toFixed(4)),
      baseline_final_average: Number(baselineFinal.toFixed(2)),
      exact_last_year_final: exactLastYearDisplayProjected ? Number(flattenDisplay(exactLastYearDisplayProjected)[metricKey] || 0) : null,
    };
  }

  const projectedDisplay = buildDisplayFromFlat(projectedFlat);

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
  const historicalWindow = buildHistoricalWindow(targetDates);

  const [resTypesRes, roomOccRes, runsRes, reservationsRes, historicalReservationsRes, playgroupAssignments] = await Promise.all([
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
    historicalWindow
      ? supabase
        .from("gingr_reservations")
        .select("gingr_id, animal_gingr_id, animal_name, reservation_type_id, reservation_type_name, start_date, end_date, check_in_date, check_out_date, cancelled_date, created_date, confirmed_date, created_at, services")
        .eq("location_id", locationId)
        .is("cancelled_date", null)
        .lt("start_date", `${addDaysStr(historicalWindow.windowEnd, 1)}T00:00:00`)
        .gte("end_date", `${historicalWindow.windowStart}T00:00:00`)
      : Promise.resolve({ data: [], error: null }),
    fetchPlaygroupAssignments({
      supabase,
      locationId,
    }),
  ]);

  if (reservationsRes.error) throw reservationsRes.error;
  if (historicalReservationsRes.error) throw historicalReservationsRes.error;
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

  const reservations = (reservationsRes.data || []).map((row: ReservationRow) =>
    buildReservationRecord(row, resTypeMaps, playgroupMap),
  );
  const historicalReservations = (historicalReservationsRes.data || []).map((row: ReservationRow) =>
    buildReservationRecord(row, resTypeMaps, playgroupMap),
  );

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

    const trust = buildTrustPayload({
      openingUnknown: snapshot.openingCounts.unknown,
      closingUnknown: snapshot.closingCounts.unknown,
      daycareUnknown: snapshot.daycareCounts.unknown,
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
      daycare_unknown_size: snapshot.daycareCounts.unknown,
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
          opening_boarding: snapshot.openingBoarding.map(buildAssignmentSnapshot),
          closing_boarding: snapshot.closingBoarding.map(buildAssignmentSnapshot),
          daytime_daycare: snapshot.activeDaycare.map(buildAssignmentSnapshot),
          daytime_dayboarding: snapshot.activeDayboarding.map(buildAssignmentSnapshot),
          evaluations: snapshot.evaluations.map(buildAssignmentSnapshot),
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

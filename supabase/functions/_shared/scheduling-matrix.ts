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
  name?: string | null;
  is_boarding?: boolean | null;
  is_daycare?: boolean | null;
  single_day?: boolean | null;
};

type ReservationRow = {
  gingr_id?: string | null;
  animal_gingr_id?: string | null;
  animal_name?: string | null;
  reservation_type_name?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  check_in_date?: string | null;
  check_out_date?: string | null;
  cancelled_date?: string | null;
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

function buildReservationRecord(
  row: ReservationRow,
  resTypeMap: Map<string, ReservationTypeRow>,
  playgroupMap: Map<string, PlaygroupAssignment>,
) {
  const services = Array.isArray(row.services) ? row.services : [];
  const typeName = String(row.reservation_type_name || "");
  const cls = classifySchedulingReservationType(typeName, resTypeMap.get(typeName) || null);
  const startKey = getDateKey(row.start_date);
  const endKey = getDateKey(row.end_date);
  const animalId = String(row.animal_gingr_id || "");
  const playgroupAssignment = playgroupMap.get(animalId) || null;
  const playgroup = normalizePlaygroup(playgroupAssignment?.schedulingPlaygroup);

  return {
    ...row,
    services,
    cls,
    startKey,
    endKey,
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
  const [resTypesRes, roomOccRes, runsRes, reservationsRes, playgroupAssignments] = await Promise.all([
    supabase
      .from("gingr_reservation_types")
      .select("name, is_boarding, is_daycare, single_day")
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
      .select("gingr_id, animal_gingr_id, animal_name, reservation_type_name, start_date, end_date, check_in_date, check_out_date, cancelled_date, services")
      .eq("location_id", locationId)
      .is("cancelled_date", null)
      .lt("start_date", `${addDaysStr(dateTo, 1)}T00:00:00`)
      .gte("end_date", `${dateFrom}T00:00:00`),
    fetchPlaygroupAssignments({
      supabase,
      locationId,
    }),
  ]);

  if (reservationsRes.error) throw reservationsRes.error;
  if (resTypesRes.error) throw resTypesRes.error;
  if (roomOccRes.error) throw roomOccRes.error;
  if (runsRes.error) throw runsRes.error;

  const resTypeMap = new Map<string, ReservationTypeRow>();
  for (const row of (resTypesRes.data || [])) {
    resTypeMap.set(String(row.name || ""), row);
  }

  const playgroupMap = buildPlaygroupAssignmentMap(playgroupAssignments || []);

  const totalRooms = new Set(
    (runsRes.data || [])
      .map((row: any) => String(row.gingr_run_id || row.id || ""))
      .filter(Boolean),
  ).size;
  const roomByDate = summarizeRoomOccupancy(roomOccRes.data || []);

  const reservations = (reservationsRes.data || []).map((row: ReservationRow) =>
    buildReservationRecord(row, resTypeMap, playgroupMap),
  );

  const rows = [];
  for (const targetDate of enumerateDates(dateFrom, dateTo)) {
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
    const daytimeHalfAndHalf = daycareCounts.halfAndHalf + dayboardingCounts.halfAndHalf;

    const totalBoardingOpening =
      openingCounts.large + openingCounts.small + openingCounts.privatePlay + openingCounts.halfAndHalf + openingCounts.unknown;
    const totalBoardingClosing =
      closingCounts.large + closingCounts.small + closingCounts.privatePlay + closingCounts.halfAndHalf + closingCounts.unknown;
    const totalDaycare =
      daycareCounts.privatePlay +
      daycareCounts.large +
      daycareCounts.small +
      daycareCounts.unknown +
      dayboardingCounts.privatePlay +
      daytimeHalfAndHalf +
      evaluations.length;
    const totalDogVolume = totalBoardingClosing + totalDaycare;

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

    const morningFeedingDogs = totalBoardingOpening;
    const eveningFeedingDogs = totalBoardingClosing;
    const medicationDogs = uniqueMedicationDogs(activeToday, targetDate);

    const roomSummary = roomByDate[targetDate];
    const roomsOccupied = roomSummary?.occupied ?? totalBoardingClosing;
    const resolvedTotalRooms = roomSummary?.total || totalRooms || 0;
    const roomsAvailable = roomSummary?.available ?? Math.max(resolvedTotalRooms - roomsOccupied, 0);
    const roomCountsEstimated = !roomSummary && resolvedTotalRooms > 0;

    const trust = buildTrustPayload({
      openingUnknown: openingCounts.unknown,
      closingUnknown: closingCounts.unknown,
      daycareUnknown: daycareCounts.unknown,
      roomCountsEstimated,
    });

    rows.push({
      location_id: locationId,
      matrix_date: targetDate,
      boarding_large: openingCounts.large,
      boarding_small: openingCounts.small,
      boarding_unknown_size: openingCounts.unknown,
      daycare_large: daycareCounts.large,
      daycare_small: daycareCounts.small,
      daycare_unknown_size: daycareCounts.unknown,
      pp_dayboarders: daycareCounts.privatePlay + dayboardingCounts.privatePlay,
      pp_overnight_boarders: openingCounts.privatePlay,
      departure_baths: departureBaths,
      evaluations: evaluations.length,
      tours: tours.length,
      gross_dogs_in_building: totalDogVolume,
      feeding_dogs: eveningFeedingDogs,
      medication_dogs: medicationDogs,
      dogs_arriving: dogsArriving,
      dogs_departing: dogsDeparting,
      dogs_checked_out: 0,
      rooms_occupied: roomsOccupied,
      rooms_available: roomsAvailable,
      total_rooms: resolvedTotalRooms,
      detail_json: {
        trust,
        display: {
          opening: {
            large_boarding: openingCounts.large,
            small_boarding: openingCounts.small,
            private_play_boarding: openingCounts.privatePlay,
            half_and_half_boarding: openingCounts.halfAndHalf,
            unclassified_boarding: openingCounts.unknown,
            total_boarding: totalBoardingOpening,
          },
          closing: {
            large_boarding: closingCounts.large,
            small_boarding: closingCounts.small,
            private_play_boarding: closingCounts.privatePlay,
            half_and_half_boarding: closingCounts.halfAndHalf,
            unclassified_boarding: closingCounts.unknown,
            total_boarding: totalBoardingClosing,
          },
          daycare: {
            evaluations: evaluations.length,
            private_play_dayboarding: daycareCounts.privatePlay + dayboardingCounts.privatePlay,
            half_and_half_daytime: daytimeHalfAndHalf,
            large_daycare: daycareCounts.large,
            small_daycare: daycareCounts.small,
            unclassified_daycare: daycareCounts.unknown,
            total_daycare: totalDaycare,
          },
          support: {
            departure_baths: departureBaths,
            morning_feeding_dogs: morningFeedingDogs,
            evening_feeding_dogs: eveningFeedingDogs,
            medication_dogs: medicationDogs,
            tours: tours.length,
            total_dog_volume: totalDogVolume,
          },
        },
        solver_inputs: {
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
          morning_feeding_dogs: morningFeedingDogs,
          evening_feeding_dogs: eveningFeedingDogs,
          medication_dogs: medicationDogs,
        },
        provenance: {
          opening_boarding: openingBoarding.map(buildAssignmentSnapshot),
          closing_boarding: closingBoarding.map(buildAssignmentSnapshot),
          daytime_daycare: activeDaycare.map(buildAssignmentSnapshot),
          daytime_dayboarding: activeDayboarding.map(buildAssignmentSnapshot),
          evaluations: evaluations.map(buildAssignmentSnapshot),
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

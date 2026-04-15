import {
  buildRoomOccupancySnapshot,
  extractRoomCode,
} from "./room-occupancy.ts";

export const ROOM_CLEANING_CLASSIFICATION_BUCKETS = [
  "room_refresh",
  "full_disinfect",
  "setup",
  "sanitize_and_setup",
  "full_disinfect_then_setup",
  "full_disinfect_then_setup_and_sanitize",
] as const;

export type RoomCleaningClassificationBucket =
  typeof ROOM_CLEANING_CLASSIFICATION_BUCKETS[number];

export type RoomCleaningTaskType =
  | "room_refresh"
  | "full_disinfect"
  | "setup"
  | "sanitize";

export type RoomCleaningTaskScope = "room" | "reservation";

export type RoomResolutionStatus =
  | "resolved_from_occupancy"
  | "resolved_from_boh"
  | "resolved_from_reservation"
  | "resolved_from_reservation_label"
  | "mixed_sources"
  | "catalog_only"
  | "not_assigned_in_gingr";

export interface RoomCleaningRunInput {
  gingr_run_id?: string | number | null;
  run_name?: string | null;
  area_name?: string | null;
  run_type?: string | null;
}

export interface RoomCleaningOccupancyInput {
  gingr_run_id?: string | number | null;
  run_name?: string | null;
  area_name?: string | null;
  occupancy_date?: string | null;
  animal_names?: string | null;
  occupied?: boolean | null;
  end_date?: string | null;
}

export interface RoomCleaningBohDogInput {
  animal_id?: string | number | null;
  id?: string | number | null;
  run_name?: string | null;
  area_name?: string | null;
}

export interface RoomCleaningReservationInput {
  reservation_id: string;
  animal_id: string;
  animal_name: string;
  owner_first_name?: string | null;
  owner_last_name: string;
  reservation_type_name: string;
  start_date: string;
  end_date: string;
  check_in_date?: string | null;
  check_out_date?: string | null;
  cancelled_date?: string | null;
  raw_data?: Record<string, any> | null;
  room_assignment?: string | null;
  photo_url?: string | null;
  dog_weight?: number | null;
}

export interface RoomCleaningOccupant {
  reservation_id: string;
  animal_id: string;
  animal_name: string;
  owner_last_name: string;
  reservation_type: string;
  start_date: string;
  end_date: string;
  day_number: number;
  total_nights: number;
  photo_url: string | null;
  dog_weight: number | null;
  suggested_bowl_size: string | null;
  setup_reason: string | null;
  room_resolution_status: RoomResolutionStatus;
}

export interface RoomCleaningTaskInstance {
  task_id: string;
  task_type: RoomCleaningTaskType;
  scope: RoomCleaningTaskScope;
  room: string;
  room_key: string;
  room_code: string | null;
  run_id: string | null;
  room_type: string;
  area_name: string;
  reservation_id: string;
  animal_id: string;
  animal_name: string;
  owner_last_name: string;
  photo_url: string | null;
  blocked_by_task_id: string | null;
  classification_bucket: RoomCleaningClassificationBucket;
  rationale: string;
  supporting_data: Record<string, any>;
  setup_reason: string | null;
  suggested_bowl_size: string | null;
  dog_weight: number | null;
  display_priority: number;
  room_resolution_status: RoomResolutionStatus;
  occupants: RoomCleaningOccupant[];
}

export interface RoomCleaningRoomClassification {
  room: string;
  room_key: string;
  room_code: string | null;
  run_id: string | null;
  room_type: string;
  area_name: string;
  classification_bucket: RoomCleaningClassificationBucket | null;
  rationale: string;
  task_ids: string[];
  occupants: RoomCleaningOccupant[];
  room_resolution_status: RoomResolutionStatus;
  supporting_data: Record<string, any>;
  is_vacant: boolean;
}

export interface RoomCleaningDataIssue {
  issue_type:
    | "not_assigned_in_gingr"
    | "room_resolution_conflict"
    | "ambiguous_room_match";
  message: string;
  reservation_id: string;
  animal_id: string;
  animal_name: string;
  reservation_type: string;
  start_date: string;
  end_date: string;
  chosen_room?: string | null;
  chosen_room_code?: string | null;
  room_candidates?: Array<{
    source: string;
    room: string | null;
    room_code: string | null;
    run_id: string | null;
  }>;
}

export interface RoomCleaningPayload {
  rooms: Array<Record<string, any>>;
  task_instances: RoomCleaningTaskInstance[];
  classification_summary: Record<RoomCleaningClassificationBucket, number>;
  task_summary: {
    total_tasks: number;
    room_refresh: number;
    full_disinfect: number;
    setup: number;
    sanitize: number;
    blocked_setup: number;
  };
  room_classifications: RoomCleaningRoomClassification[];
  data_issues: RoomCleaningDataIssue[];
  summary: {
    totalOccupied: number;
    totalRooms: number;
    totalRefresh: number;
    totalDisinfect: number;
    totalSetups: number;
    totalSanitize: number;
    totalTasks: number;
    dataIssueCount: number;
  };
}

export interface RoomCleaningComputationInput {
  date: string;
  runs: RoomCleaningRunInput[];
  occupancyRows: RoomCleaningOccupancyInput[];
  bohDogs: RoomCleaningBohDogInput[];
  reservations: RoomCleaningReservationInput[];
}

interface RunCatalogEntry {
  runId: string | null;
  runName: string;
  roomCode: string | null;
  roomKey: string;
  areaName: string;
  roomType: string;
}

interface ResolvedRoom {
  room: string;
  roomKey: string;
  roomCode: string | null;
  runId: string | null;
  areaName: string;
  roomType: string;
  resolutionStatus: RoomResolutionStatus;
  chosenSource: string;
  candidates: Array<{
    source: string;
    room: string | null;
    room_code: string | null;
    run_id: string | null;
  }>;
}

interface ReservationContext {
  reservationId: string;
  animalId: string;
  animalName: string;
  ownerLastName: string;
  reservationType: string;
  startDate: string;
  endDate: string;
  checkOutDate: string | null;
  totalNights: number;
  dayNumber: number;
  photoUrl: string | null;
  dogWeight: number | null;
  suggestedBowlSize: string | null;
  setupReason: string | null;
  resolvedRoom: ResolvedRoom | null;
  roomIssues: RoomCleaningDataIssue[];
  arrivalTodayMulti: boolean;
  sameDayStay: boolean;
  departureTodayMulti: boolean;
  midStay: boolean;
}

const ROOM_CLEANING_BUCKET_LABELS: Record<
  RoomCleaningClassificationBucket,
  string
> = {
  room_refresh: "Room Refresh",
  full_disinfect: "Full Disinfect",
  setup: "Set Up",
  sanitize_and_setup: "Sanitize + Set Up",
  full_disinfect_then_setup: "Full Disinfect + Set Up",
  full_disinfect_then_setup_and_sanitize: "Full Disinfect + Set Up + Sanitize",
};

function normalizeDate(value: string | null | undefined): string {
  if (!value) return "";
  const str = String(value).trim();
  if (!str) return "";
  if (str.includes("T")) return str.split("T")[0];
  if (str.includes(" ")) return str.split(" ")[0];
  return str;
}

function daysBetween(startDate: string, endDate: string): number {
  if (!startDate || !endDate) return 0;
  const start = new Date(`${startDate}T12:00:00`).getTime();
  const end = new Date(`${endDate}T12:00:00`).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.max(0, Math.round((end - start) / 86400000));
}

function sanitizeRoomKey(value: string): string {
  return (value || "")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .toLowerCase();
}

function normalizeLabel(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[()]/g, "")
    .replace(/[^a-z0-9 ]/g, "");
}

function suggestBowlSize(weight: number | null): string | null {
  if (weight == null || weight <= 0) return null;
  if (weight < 20) return "Small";
  if (weight <= 50) return "Medium";
  return "Large";
}

function shouldIgnoreReservationType(typeName: string): boolean {
  const lower = String(typeName || "").toLowerCase();
  return lower.startsWith("daycare") ||
    lower.startsWith("day care") ||
    lower.includes("resort tour");
}

function setupReasonForReservation(typeName: string): string | null {
  const lower = String(typeName || "").toLowerCase();
  if (lower.includes("evaluation") || lower.includes("eval")) return "Evaluation";
  if (lower.includes("day boarding")) return "Day Boarding";
  return "Check-In";
}

function buildRunCatalog(runs: RoomCleaningRunInput[]): {
  all: RunCatalogEntry[];
  byRunId: Map<string, RunCatalogEntry>;
  byLabel: Map<string, RunCatalogEntry>;
  byRoomCode: Map<string, RunCatalogEntry[]>;
} {
  const all: RunCatalogEntry[] = [];
  const byRunId = new Map<string, RunCatalogEntry>();
  const byLabel = new Map<string, RunCatalogEntry>();
  const byRoomCode = new Map<string, RunCatalogEntry[]>();

  for (const run of runs || []) {
    const runName = String(run.run_name || "").trim();
    if (!runName) continue;
    const runId = run.gingr_run_id == null ? null : String(run.gingr_run_id);
    const roomCode = extractRoomCode(runName);
    const roomKey = roomCode ? roomCode.toLowerCase() : sanitizeRoomKey(runName);
    const entry: RunCatalogEntry = {
      runId,
      runName,
      roomCode,
      roomKey,
      areaName: String(run.area_name || "").trim(),
      roomType: String(run.run_type || run.area_name || "").trim(),
    };
    all.push(entry);
    if (runId) byRunId.set(runId, entry);
    byLabel.set(normalizeLabel(runName), entry);
    if (roomCode) {
      const existing = byRoomCode.get(roomCode) || [];
      existing.push(entry);
      byRoomCode.set(roomCode, existing);
    }
  }

  return { all, byRunId, byLabel, byRoomCode };
}

function parseOccupancyAnimalNames(value: string | null | undefined): string[] {
  const raw = String(value || "");
  if (!raw) return [];
  return raw
    .split(/<br\s*\/?>/i)
    .map((entry) => entry.replace(/<[^>]+>/g, "").trim())
    .map((entry) => entry.replace(/\s*\(.*\)\s*$/, "").trim())
    .filter(Boolean);
}

function resolveRunCandidate(
  source: string,
  candidate: { runId?: string | null; room?: string | null; areaName?: string | null },
  catalog: ReturnType<typeof buildRunCatalog>,
): { resolved: ResolvedRoom | null; ambiguous: boolean } {
  const candidateRunId = candidate.runId ? String(candidate.runId) : null;
  const candidateRoom = String(candidate.room || "").trim();
  const candidateArea = String(candidate.areaName || "").trim();

  if (candidateRunId && catalog.byRunId.has(candidateRunId)) {
    const match = catalog.byRunId.get(candidateRunId)!;
    return {
      resolved: {
        room: match.runName,
        roomKey: match.roomKey,
        roomCode: match.roomCode,
        runId: match.runId,
        areaName: match.areaName,
        roomType: match.roomType,
        resolutionStatus: source === "occupancy"
          ? "resolved_from_occupancy"
          : source === "boh"
            ? "resolved_from_boh"
            : "resolved_from_reservation",
        chosenSource: source,
        candidates: [{
          source,
          room: match.runName,
          room_code: match.roomCode,
          run_id: match.runId,
        }],
      },
      ambiguous: false,
    };
  }

  const normalizedRoom = normalizeLabel(candidateRoom);
  if (normalizedRoom && catalog.byLabel.has(normalizedRoom)) {
    const match = catalog.byLabel.get(normalizedRoom)!;
    return {
      resolved: {
        room: match.runName,
        roomKey: match.roomKey,
        roomCode: match.roomCode,
        runId: match.runId,
        areaName: match.areaName,
        roomType: match.roomType,
        resolutionStatus: source === "occupancy"
          ? "resolved_from_occupancy"
          : source === "boh"
            ? "resolved_from_boh"
            : "resolved_from_reservation",
        chosenSource: source,
        candidates: [{
          source,
          room: match.runName,
          room_code: match.roomCode,
          run_id: match.runId,
        }],
      },
      ambiguous: false,
    };
  }

  const roomCode = extractRoomCode(candidateRoom);
  if (roomCode) {
    const matches = catalog.byRoomCode.get(roomCode) || [];
    if (matches.length === 1) {
      const match = matches[0];
      return {
        resolved: {
          room: match.runName,
          roomKey: match.roomKey,
          roomCode: match.roomCode,
          runId: match.runId,
          areaName: match.areaName,
          roomType: match.roomType,
          resolutionStatus: source === "occupancy"
            ? "resolved_from_occupancy"
            : source === "boh"
              ? "resolved_from_boh"
              : candidateRoom === roomCode
                ? "resolved_from_reservation_label"
                : "resolved_from_reservation",
          chosenSource: source,
          candidates: [{
            source,
            room: match.runName,
            room_code: match.roomCode,
            run_id: match.runId,
          }],
        },
        ambiguous: false,
      };
    }
    if (matches.length > 1) {
      const candidateTokens = normalizeLabel(`${candidateArea} ${candidateRoom}`);
      const scored = matches
        .map((match) => {
          const matchTokens = normalizeLabel(`${match.areaName} ${match.runName}`);
          let score = 0;
          if (candidateTokens && matchTokens && candidateTokens.includes(matchTokens)) score += 3;
          if (candidateTokens && matchTokens && matchTokens.includes(candidateTokens)) score += 2;
          if (candidateArea && normalizeLabel(match.areaName) === normalizeLabel(candidateArea)) score += 1;
          return { match, score };
        })
        .sort((a, b) => b.score - a.score);
      if (scored[0]?.score > 0 && (!scored[1] || scored[0].score > scored[1].score)) {
        const match = scored[0].match;
        return {
          resolved: {
            room: match.runName,
            roomKey: match.roomKey,
            roomCode: match.roomCode,
            runId: match.runId,
            areaName: match.areaName,
            roomType: match.roomType,
            resolutionStatus: source === "occupancy"
              ? "resolved_from_occupancy"
              : source === "boh"
                ? "resolved_from_boh"
                : candidateRoom === roomCode
                  ? "resolved_from_reservation_label"
                  : "resolved_from_reservation",
            chosenSource: source,
            candidates: [{
              source,
              room: match.runName,
              room_code: match.roomCode,
              run_id: match.runId,
            }],
          },
          ambiguous: false,
        };
      }
      return { resolved: null, ambiguous: true };
    }

    return {
      resolved: {
        room: candidateRoom || roomCode,
        roomKey: roomCode.toLowerCase(),
        roomCode,
        runId: null,
        areaName: candidateArea,
        roomType: "",
        resolutionStatus: candidateRoom === roomCode
          ? "resolved_from_reservation_label"
          : source === "boh"
            ? "resolved_from_boh"
            : "resolved_from_reservation_label",
        chosenSource: source,
        candidates: [{
          source,
          room: candidateRoom || roomCode,
          room_code: roomCode,
          run_id: null,
        }],
      },
      ambiguous: false,
    };
  }

  if (!candidateRoom) return { resolved: null, ambiguous: false };

  return {
    resolved: {
      room: candidateRoom,
      roomKey: sanitizeRoomKey(candidateRoom),
      roomCode: null,
      runId: null,
      areaName: candidateArea,
      roomType: "",
      resolutionStatus: source === "boh" ? "resolved_from_boh" : "resolved_from_reservation_label",
      chosenSource: source,
      candidates: [{
        source,
        room: candidateRoom,
        room_code: null,
        run_id: null,
      }],
    },
    ambiguous: false,
  };
}

function buildOccupancyMap(
  occupancyRows: RoomCleaningOccupancyInput[],
  catalog: ReturnType<typeof buildRunCatalog>,
): Map<string, ResolvedRoom> {
  const map = new Map<string, ResolvedRoom>();
  for (const row of occupancyRows || []) {
    if (!row.occupied) continue;
    const resolvedCandidate = resolveRunCandidate("occupancy", {
      runId: row.gingr_run_id == null ? null : String(row.gingr_run_id),
      room: row.run_name || null,
      areaName: row.area_name || null,
    }, catalog);
    if (!resolvedCandidate.resolved) continue;
    for (const dogName of parseOccupancyAnimalNames(row.animal_names)) {
      map.set(dogName.trim().toLowerCase(), resolvedCandidate.resolved);
    }
  }
  return map;
}

function buildBohMap(
  bohDogs: RoomCleaningBohDogInput[],
  catalog: ReturnType<typeof buildRunCatalog>,
): Map<string, ResolvedRoom> {
  const map = new Map<string, ResolvedRoom>();
  for (const dog of bohDogs || []) {
    const animalId = dog.animal_id == null ? dog.id : dog.animal_id;
    if (animalId == null) continue;
    const resolvedCandidate = resolveRunCandidate("boh", {
      room: dog.run_name || null,
      areaName: dog.area_name || null,
    }, catalog);
    if (!resolvedCandidate.resolved) continue;
    map.set(String(animalId), resolvedCandidate.resolved);
  }
  return map;
}

function buildOccupant(ctx: ReservationContext): RoomCleaningOccupant {
  return {
    reservation_id: ctx.reservationId,
    animal_id: ctx.animalId,
    animal_name: ctx.animalName,
    owner_last_name: ctx.ownerLastName,
    reservation_type: ctx.reservationType,
    start_date: ctx.startDate,
    end_date: ctx.endDate,
    day_number: ctx.dayNumber,
    total_nights: ctx.totalNights,
    photo_url: ctx.photoUrl,
    dog_weight: ctx.dogWeight,
    suggested_bowl_size: ctx.suggestedBowlSize,
    setup_reason: ctx.setupReason,
    room_resolution_status: ctx.resolvedRoom?.resolutionStatus || "not_assigned_in_gingr",
  };
}

function displayAnimalName(occupants: RoomCleaningOccupant[]): string {
  if (occupants.length === 0) return "";
  if (occupants.length === 1) return occupants[0].animal_name;
  return occupants.map((occupant) => occupant.animal_name).join(", ");
}

function buildTaskRationale(
  taskType: RoomCleaningTaskType,
  occupants: RoomCleaningOccupant[],
  blockedByTaskId: string | null,
): string {
  if (taskType === "room_refresh") {
    return `Room refreshes are required every day for each guest on a multi-night reservation after arrival day. Occupants: ${occupants.map((occupant) => `${occupant.animal_name} (${occupant.start_date} to ${occupant.end_date})`).join(", ")}.`;
  }
  if (taskType === "full_disinfect") {
    return `A full disinfect is required after a multi-night stay checks out. Departing occupants: ${occupants.map((occupant) => `${occupant.animal_name} (${occupant.end_date})`).join(", ")}.`;
  }
  const occupant = occupants[0];
  if (!occupant) return "";
  if (taskType === "setup") {
    if (blockedByTaskId) {
      return `This setup is blocked until the same-room full disinfect is complete. ${occupant.animal_name} arrives on ${occupant.start_date} and the room must be disinfected first.`;
    }
    return `Setups prepare the room with water before arrival. ${occupant.animal_name} arrives on ${occupant.start_date} for ${occupant.setup_reason || "today's stay"}.`;
  }
  return `Sanitize is required after a same-day / single-day stay. ${occupant.animal_name} arrives and departs on ${occupant.end_date}, so the room needs post-stay cleaning.`;
}

function makeRoomTaskId(taskType: RoomCleaningTaskType, roomKey: string, date: string): string {
  return [taskType, roomKey || "room", date].join("__");
}

function makeReservationTaskId(
  taskType: RoomCleaningTaskType,
  roomKey: string,
  reservationId: string,
  animalId: string,
): string {
  return [taskType, roomKey || "room", reservationId || "reservation", animalId || "animal"].join("__");
}

function bucketFromLabel(label: string): RoomCleaningClassificationBucket | null {
  for (const [bucket, display] of Object.entries(ROOM_CLEANING_BUCKET_LABELS)) {
    if (display === label) return bucket as RoomCleaningClassificationBucket;
  }
  return null;
}

function buildRoomClassificationRationale(
  bucket: RoomCleaningClassificationBucket | null,
  occupants: RoomCleaningOccupant[],
): string {
  if (!bucket) {
    return "Vacant, therefore no cleaning required.";
  }
  if (bucket === "room_refresh") {
    return `Mid stay (not the first day or last day of a multi-day reservation), therefore room refresh required. Occupants: ${displayAnimalName(occupants)}.`;
  }
  if (bucket === "full_disinfect") {
    return `Last day of multi-day stay, therefore full disinfect required. Departing occupants: ${displayAnimalName(occupants)}.`;
  }
  if (bucket === "setup") {
    return `First day of multi-day reservation, therefore no cleaning required, however a set up is required to prepare the room for the incoming reservation.`;
  }
  if (bucket === "sanitize_and_setup") {
    return `Occupied for only one day, so the room needs a set up before arrival and sanitize after departure.`;
  }
  if (bucket === "full_disinfect_then_setup") {
    return `A multi-night guest departs today and a new multi-night guest arrives in the same room, so full disinfect must happen before set up.`;
  }
  return `A multi-night guest departs today and a same-day guest arrives in the same room, so full disinfect must happen before set up, followed by sanitize after departure.`;
}

function createPrimaryFields(occupants: RoomCleaningOccupant[]) {
  const primary = occupants[0];
  return {
    reservationId: primary?.reservation_id || "",
    animalId: primary?.animal_id || "",
    animalName: displayAnimalName(occupants),
    ownerLastName: primary?.owner_last_name || "",
    photoUrl: primary?.photo_url || null,
    dogWeight: primary?.dog_weight ?? null,
    suggestedBowlSize: primary?.suggested_bowl_size || null,
    setupReason: primary?.setup_reason || null,
  };
}

function compareRoomCodes(a: string | null, b: string | null): number {
  const aa = a || "";
  const bb = b || "";
  return aa.localeCompare(bb, undefined, { numeric: true });
}

export function classificationBucketToDisplayLabel(
  bucket: RoomCleaningClassificationBucket | null,
): string {
  if (!bucket) return "-";
  return ROOM_CLEANING_BUCKET_LABELS[bucket];
}

export function buildRoomCleaningDisplayMap(
  payload: Pick<RoomCleaningPayload, "room_classifications">,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const classification of payload.room_classifications || []) {
    if (!classification.room_code) continue;
    map[classification.room_code] = classificationBucketToDisplayLabel(
      classification.classification_bucket,
    );
  }
  return map;
}

export function summarizeRoomCleaningDisplayCounts(
  payload: Pick<RoomCleaningPayload, "room_classifications">,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const classification of payload.room_classifications || []) {
    const label = classificationBucketToDisplayLabel(classification.classification_bucket);
    counts[label] = (counts[label] || 0) + 1;
  }
  return counts;
}

export function buildRoomCleaningPayload(
  input: RoomCleaningComputationInput,
): RoomCleaningPayload {
  const date = normalizeDate(input.date);
  const catalog = buildRunCatalog(input.runs || []);
  const occupancy = buildRoomOccupancySnapshot({
    date,
    runs: input.runs || [],
    occupancy_rows: input.occupancyRows || [],
    reservations: (input.reservations || []).map((reservation) => ({
      reservation_id: reservation.reservation_id,
      animal_id: reservation.animal_id,
      animal_name: reservation.animal_name,
      owner_first_name: reservation.owner_first_name || null,
      owner_last_name: reservation.owner_last_name || null,
      reservation_type_name: reservation.reservation_type_name,
      start_date: reservation.start_date,
      end_date: reservation.end_date,
      check_in_date: reservation.check_in_date || null,
      check_out_date: reservation.check_out_date || null,
      cancelled_date: reservation.cancelled_date || null,
      raw_data: reservation.raw_data || null,
      room_assignment: reservation.room_assignment || null,
      photo_url: reservation.photo_url || null,
    })),
    include_categories: ["boarding", "day_boarding"],
  });
  const dataIssues: RoomCleaningDataIssue[] = [];
  const reservationContexts: ReservationContext[] = [];

  for (const unresolved of occupancy.unresolved_assignments) {
    const totalNights = daysBetween(unresolved.start_day, unresolved.end_day);
    const isRelevant =
      (unresolved.start_day === date && unresolved.end_day > date) ||
      (unresolved.start_day === date && unresolved.end_day === date) ||
      (unresolved.start_day < date && unresolved.end_day === date && totalNights >= 1) ||
      (unresolved.start_day < date && unresolved.end_day > date && totalNights >= 1);
    if (!isRelevant) continue;

    dataIssues.push({
      issue_type: "not_assigned_in_gingr",
      message: `Not assigned in GINGR for ${unresolved.animal_name} on ${date}.`,
      reservation_id: unresolved.reservation_id,
      animal_id: unresolved.animal_id,
      animal_name: unresolved.animal_name,
      reservation_type: unresolved.reservation_type_name,
      start_date: unresolved.start_day,
      end_date: unresolved.end_day,
      room_candidates: unresolved.assignment_candidates.map((candidate) => ({
        source: candidate.source,
        room: candidate.room_name,
        room_code: candidate.room_code,
        run_id: candidate.run_id,
      })),
    });
  }

  const weightByReservationId = new Map<string, number | null>();
  for (const reservation of input.reservations || []) {
    weightByReservationId.set(
      reservation.reservation_id,
      reservation.dog_weight ?? null,
    );
  }

  for (const assignment of occupancy.assignments) {
    const startDate = assignment.start_day;
    const endDate = assignment.end_day;
    if (!startDate || !endDate) continue;
    if (startDate > date || endDate < date) continue;

    const totalNights = daysBetween(startDate, endDate);
    const dayNumber = daysBetween(startDate, date) + 1;
    const arrivalTodayMulti = assignment.reservation_category === "boarding" &&
      startDate === date && endDate > date;
    const sameDayStay = startDate === date && endDate === date;
    const departureTodayMulti = startDate < date && endDate === date && totalNights >= 1;
    const midStay = startDate < date && endDate > date && totalNights >= 1;

    const resolvedRoom: ResolvedRoom | null = assignment.assigned_room_name
      ? {
        room: assignment.assigned_room_name,
        roomKey: assignment.assigned_room_key || sanitizeRoomKey(assignment.assigned_room_name),
        roomCode: assignment.assigned_room_code,
        runId: assignment.assigned_run_id,
        areaName: assignment.assigned_area_name,
        roomType: assignment.assigned_room_type,
        resolutionStatus: assignment.room_resolution_status as RoomResolutionStatus,
        chosenSource: assignment.assignment_source,
        candidates: assignment.assignment_candidates.map((candidate) => ({
          source: candidate.source,
          room: candidate.room_name,
          room_code: candidate.room_code,
          run_id: candidate.run_id,
        })),
      }
      : null;

    const roomIssues: RoomCleaningDataIssue[] = [];
    const distinctCandidateRooms = [
      ...new Set(
        (assignment.assignment_candidates || [])
          .map((candidate) => candidate.room_code || candidate.room_name || "")
          .filter(Boolean),
      ),
    ];
    if (resolvedRoom && distinctCandidateRooms.length > 1) {
      roomIssues.push({
        issue_type: "room_resolution_conflict",
        message: `Room sources disagreed for ${assignment.animal_name}; using ${resolvedRoom.room}.`,
        reservation_id: assignment.reservation_id,
        animal_id: assignment.animal_id,
        animal_name: assignment.animal_name,
        reservation_type: assignment.reservation_type_name,
        start_date: startDate,
        end_date: endDate,
        chosen_room: resolvedRoom.room,
        chosen_room_code: resolvedRoom.roomCode,
        room_candidates: assignment.assignment_candidates.map((candidate) => ({
          source: candidate.source,
          room: candidate.room_name,
          room_code: candidate.room_code,
          run_id: candidate.run_id,
        })),
      });
      dataIssues.push(...roomIssues);
    }

    reservationContexts.push({
      reservationId: assignment.reservation_id,
      animalId: assignment.animal_id,
      animalName: assignment.animal_name,
      ownerLastName: assignment.owner_last_name,
      reservationType: assignment.reservation_type_name,
      startDate,
      endDate,
      checkOutDate: normalizeDate(assignment.check_out_date),
      totalNights,
      dayNumber,
      photoUrl: assignment.photo_url || null,
      dogWeight: weightByReservationId.get(assignment.reservation_id) ?? null,
      suggestedBowlSize: suggestBowlSize(weightByReservationId.get(assignment.reservation_id) ?? null),
      setupReason: setupReasonForReservation(assignment.reservation_type_name),
      resolvedRoom,
      roomIssues,
      arrivalTodayMulti,
      sameDayStay,
      departureTodayMulti,
      midStay,
    });
  }

  const contextsByRoom = new Map<string, ReservationContext[]>();
  for (const ctx of reservationContexts) {
    if (!ctx.resolvedRoom) continue;
    const roomKey = ctx.resolvedRoom.roomKey;
    const existing = contextsByRoom.get(roomKey) || [];
    existing.push(ctx);
    contextsByRoom.set(roomKey, existing);
  }

  const tasks: RoomCleaningTaskInstance[] = [];
  const classificationSummary = ROOM_CLEANING_CLASSIFICATION_BUCKETS.reduce((acc, bucket) => {
    acc[bucket] = 0;
    return acc;
  }, {} as Record<RoomCleaningClassificationBucket, number>);
  const roomClassifications: RoomCleaningRoomClassification[] = [];

  const roomCatalogOrder = new Map<string, RunCatalogEntry>();
  for (const entry of catalog.all) {
    roomCatalogOrder.set(entry.roomKey, entry);
  }

  for (const [roomKey, contexts] of contextsByRoom.entries()) {
    if (!roomCatalogOrder.has(roomKey)) {
      const room = contexts[0].resolvedRoom!;
      roomCatalogOrder.set(roomKey, {
        runId: room.runId,
        runName: room.room,
        roomCode: room.roomCode,
        roomKey: room.roomKey,
        areaName: room.areaName,
        roomType: room.roomType,
      });
    }
  }

  const orderedRoomKeys = [...roomCatalogOrder.keys()].sort((a, b) => {
    const left = roomCatalogOrder.get(a)!;
    const right = roomCatalogOrder.get(b)!;
    if (left.roomType !== right.roomType) {
      return left.roomType.localeCompare(right.roomType);
    }
    return compareRoomCodes(left.roomCode, right.roomCode) || left.runName.localeCompare(right.runName, undefined, { numeric: true });
  });

  for (const roomKey of orderedRoomKeys) {
    const run = roomCatalogOrder.get(roomKey)!;
    const contexts = (contextsByRoom.get(roomKey) || []).sort((a, b) => {
      if (a.startDate !== b.startDate) return a.startDate.localeCompare(b.startDate);
      if (a.endDate !== b.endDate) return a.endDate.localeCompare(b.endDate);
      return a.animalName.localeCompare(b.animalName);
    });
    const room = contexts[0]?.resolvedRoom || {
      room: run.runName,
      roomKey: run.roomKey,
      roomCode: run.roomCode,
      runId: run.runId,
      areaName: run.areaName,
      roomType: run.roomType,
      resolutionStatus: "catalog_only" as RoomResolutionStatus,
      chosenSource: "catalog",
      candidates: [],
    };

    const refreshOccupants = contexts.filter((ctx) => ctx.midStay);
    const departingMulti = contexts.filter((ctx) => ctx.departureTodayMulti);
    const arrivingMulti = contexts.filter((ctx) => ctx.arrivalTodayMulti);
    const sameDay = contexts.filter((ctx) => ctx.sameDayStay);
    const hasContinuingOccupants = refreshOccupants.length > 0;
    const canDisinfectRoom = departingMulti.length > 0 && !hasContinuingOccupants;

    const roomTaskIds: string[] = [];
    let roomClassificationBucket: RoomCleaningClassificationBucket | null = null;
    let roomResolutionStatus = room.resolutionStatus;

    const roomScopeOccupants = (sourceContexts: ReservationContext[]) =>
      sourceContexts.map((ctx) => buildOccupant(ctx));

    let fullDisinfectTaskId: string | null = null;

    if (canDisinfectRoom) {
      const occupants = roomScopeOccupants(departingMulti);
      const primary = createPrimaryFields(occupants);
      fullDisinfectTaskId = makeRoomTaskId("full_disinfect", room.roomKey, date);
      tasks.push({
        task_id: fullDisinfectTaskId,
        task_type: "full_disinfect",
        scope: "room",
        room: room.room,
        room_key: room.roomKey,
        room_code: room.roomCode,
        run_id: room.runId,
        room_type: room.roomType,
        area_name: room.areaName,
        reservation_id: primary.reservationId,
        animal_id: primary.animalId,
        animal_name: primary.animalName,
        owner_last_name: primary.ownerLastName,
        photo_url: primary.photoUrl,
        blocked_by_task_id: null,
        classification_bucket: "full_disinfect",
        rationale: buildTaskRationale("full_disinfect", occupants, null),
        supporting_data: {
          occupant_count: occupants.length,
          start_date: occupants[0]?.start_date || "",
          end_date: occupants[0]?.end_date || "",
          room_scope: true,
        },
        setup_reason: null,
        suggested_bowl_size: primary.suggestedBowlSize,
        dog_weight: primary.dogWeight,
        display_priority: 0,
        room_resolution_status: room.resolutionStatus,
        occupants,
      });
      roomTaskIds.push(fullDisinfectTaskId);
    }

    if (refreshOccupants.length > 0) {
      const occupants = roomScopeOccupants(refreshOccupants);
      const primary = createPrimaryFields(occupants);
      const taskId = makeRoomTaskId("room_refresh", room.roomKey, date);
      tasks.push({
        task_id: taskId,
        task_type: "room_refresh",
        scope: "room",
        room: room.room,
        room_key: room.roomKey,
        room_code: room.roomCode,
        run_id: room.runId,
        room_type: room.roomType,
        area_name: room.areaName,
        reservation_id: primary.reservationId,
        animal_id: primary.animalId,
        animal_name: primary.animalName,
        owner_last_name: primary.ownerLastName,
        photo_url: primary.photoUrl,
        blocked_by_task_id: null,
        classification_bucket: "room_refresh",
        rationale: buildTaskRationale("room_refresh", occupants, null),
        supporting_data: {
          occupant_count: occupants.length,
          start_date: occupants[0]?.start_date || "",
          end_date: occupants[0]?.end_date || "",
          room_scope: true,
        },
        setup_reason: null,
        suggested_bowl_size: primary.suggestedBowlSize,
        dog_weight: primary.dogWeight,
        display_priority: 2,
        room_resolution_status: room.resolutionStatus,
        occupants,
      });
      roomTaskIds.push(taskId);
    }

    for (const ctx of [...arrivingMulti, ...sameDay]) {
      const occupant = buildOccupant(ctx);
      const blockedByTaskId = fullDisinfectTaskId;
      const classificationBucket: RoomCleaningClassificationBucket = ctx.sameDayStay
        ? (fullDisinfectTaskId ? "full_disinfect_then_setup_and_sanitize" : "sanitize_and_setup")
        : (fullDisinfectTaskId ? "full_disinfect_then_setup" : "setup");
      const setupTaskId = makeReservationTaskId(
        "setup",
        room.roomKey,
        ctx.reservationId,
        ctx.animalId,
      );
      tasks.push({
        task_id: setupTaskId,
        task_type: "setup",
        scope: "reservation",
        room: room.room,
        room_key: room.roomKey,
        room_code: room.roomCode,
        run_id: room.runId,
        room_type: room.roomType,
        area_name: room.areaName,
        reservation_id: ctx.reservationId,
        animal_id: ctx.animalId,
        animal_name: ctx.animalName,
        owner_last_name: ctx.ownerLastName,
        photo_url: ctx.photoUrl,
        blocked_by_task_id: blockedByTaskId,
        classification_bucket: classificationBucket,
        rationale: buildTaskRationale("setup", [occupant], blockedByTaskId),
        supporting_data: {
          start_date: ctx.startDate,
          end_date: ctx.endDate,
          check_out_date: ctx.checkOutDate,
          reservation_type: ctx.reservationType,
          reservation_status: ctx.sameDayStay
            ? "departing_today"
            : ctx.arrivalTodayMulti
              ? "arriving_today"
              : "in_house",
          day_number: ctx.dayNumber,
          total_nights: ctx.totalNights,
          room_type: room.roomType,
          area_name: room.areaName,
          setup_reason: ctx.setupReason,
          blocked_reason: blockedByTaskId ? "Blocked by full disinfect" : null,
        },
        setup_reason: ctx.setupReason,
        suggested_bowl_size: ctx.suggestedBowlSize,
        dog_weight: ctx.dogWeight,
        display_priority: 1,
        room_resolution_status: ctx.resolvedRoom?.resolutionStatus || "not_assigned_in_gingr",
        occupants: [occupant],
      });
      roomTaskIds.push(setupTaskId);

      if (ctx.sameDayStay) {
        const sanitizeTaskId = makeReservationTaskId(
          "sanitize",
          room.roomKey,
          ctx.reservationId,
          ctx.animalId,
        );
        tasks.push({
          task_id: sanitizeTaskId,
          task_type: "sanitize",
          scope: "reservation",
          room: room.room,
          room_key: room.roomKey,
          room_code: room.roomCode,
          run_id: room.runId,
          room_type: room.roomType,
          area_name: room.areaName,
          reservation_id: ctx.reservationId,
          animal_id: ctx.animalId,
          animal_name: ctx.animalName,
          owner_last_name: ctx.ownerLastName,
          photo_url: ctx.photoUrl,
          blocked_by_task_id: null,
          classification_bucket: classificationBucket,
          rationale: buildTaskRationale("sanitize", [occupant], null),
          supporting_data: {
            start_date: ctx.startDate,
            end_date: ctx.endDate,
            check_out_date: ctx.checkOutDate,
            reservation_type: ctx.reservationType,
            reservation_status: "departing_today",
            day_number: ctx.dayNumber,
            total_nights: ctx.totalNights,
            room_type: room.roomType,
            area_name: room.areaName,
            setup_reason: ctx.setupReason,
            blocked_reason: null,
          },
          setup_reason: ctx.setupReason,
          suggested_bowl_size: ctx.suggestedBowlSize,
          dog_weight: ctx.dogWeight,
          display_priority: 3,
          room_resolution_status: ctx.resolvedRoom?.resolutionStatus || "not_assigned_in_gingr",
          occupants: [occupant],
        });
        roomTaskIds.push(sanitizeTaskId);
      }
    }

    if (fullDisinfectTaskId) {
      if (sameDay.length > 0) {
        roomClassificationBucket = "full_disinfect_then_setup_and_sanitize";
      } else if (arrivingMulti.length > 0) {
        roomClassificationBucket = "full_disinfect_then_setup";
      } else {
        roomClassificationBucket = "full_disinfect";
      }
    } else if (refreshOccupants.length > 0) {
      roomClassificationBucket = "room_refresh";
    } else if (sameDay.length > 0) {
      roomClassificationBucket = "sanitize_and_setup";
    } else if (arrivingMulti.length > 0) {
      roomClassificationBucket = "setup";
    }

    if (roomClassificationBucket) {
      classificationSummary[roomClassificationBucket] += 1;
    }

    const classificationOccupants = contexts.map((ctx) => buildOccupant(ctx));
    if (classificationOccupants.length > 0) {
      const statuses = [...new Set(classificationOccupants.map((occupant) => occupant.room_resolution_status))];
      roomResolutionStatus = statuses.length > 1 ? "mixed_sources" : statuses[0];
    }

    roomClassifications.push({
      room: room.room,
      room_key: room.roomKey,
      room_code: room.roomCode,
      run_id: room.runId,
      room_type: room.roomType,
      area_name: room.areaName,
      classification_bucket: roomClassificationBucket,
      rationale: buildRoomClassificationRationale(roomClassificationBucket, classificationOccupants),
      task_ids: roomTaskIds,
      occupants: classificationOccupants,
      room_resolution_status: roomResolutionStatus,
      supporting_data: {
        arriving_multi_count: arrivingMulti.length,
        same_day_count: sameDay.length,
        departing_multi_count: departingMulti.length,
        mid_stay_count: refreshOccupants.length,
      },
      is_vacant: !roomClassificationBucket && classificationOccupants.length === 0,
    });
  }

  tasks.sort((a, b) => {
    if (a.room_type !== b.room_type) return a.room_type.localeCompare(b.room_type);
    if ((a.room_code || "") !== (b.room_code || "")) {
      return compareRoomCodes(a.room_code, b.room_code);
    }
    if (a.room !== b.room) return a.room.localeCompare(b.room, undefined, { numeric: true });
    if (a.display_priority !== b.display_priority) return a.display_priority - b.display_priority;
    return a.animal_name.localeCompare(b.animal_name);
  });

  roomClassifications.sort((a, b) => {
    if (a.room_type !== b.room_type) return a.room_type.localeCompare(b.room_type);
    if ((a.room_code || "") !== (b.room_code || "")) {
      return compareRoomCodes(a.room_code, b.room_code);
    }
    return a.room.localeCompare(b.room, undefined, { numeric: true });
  });

  const taskSummary = {
    total_tasks: tasks.length,
    room_refresh: tasks.filter((task) => task.task_type === "room_refresh").length,
    full_disinfect: tasks.filter((task) => task.task_type === "full_disinfect").length,
    setup: tasks.filter((task) => task.task_type === "setup").length,
    sanitize: tasks.filter((task) => task.task_type === "sanitize").length,
    blocked_setup: tasks.filter((task) => task.task_type === "setup" && !!task.blocked_by_task_id).length,
  };

  const rooms = roomClassifications.map((classification) => {
    const dogs = classification.occupants.map((occupant) => ({
      name: occupant.animal_name,
      ownerLastName: occupant.owner_last_name,
      weight: occupant.dog_weight,
      suggestedBowlSize: occupant.suggested_bowl_size,
      setupReason: occupant.setup_reason,
      needsSetup: classification.task_ids.some((taskId) => taskId.startsWith("setup__") && taskId.includes(occupant.reservation_id)),
    }));
    const taskSet = new Set(classification.task_ids.map((taskId) => taskId.split("__")[0]));
    return {
      room: classification.room,
      roomCode: classification.room_code,
      roomType: classification.room_type,
      areaName: classification.area_name,
      dogName: dogs.map((dog) => dog.name).join(", "),
      dogNames: dogs.map((dog) => dog.name),
      ownerLastName: dogs[0]?.ownerLastName || "",
      reservationType: classification.occupants[0]?.reservation_type || "",
      checkIn: classification.occupants.reduce((earliest, occupant) => {
        if (!earliest) return occupant.start_date;
        return occupant.start_date < earliest ? occupant.start_date : earliest;
      }, ""),
      checkOut: classification.occupants.reduce((latest, occupant) => {
        if (!latest) return occupant.end_date;
        return occupant.end_date > latest ? occupant.end_date : latest;
      }, ""),
      dayNumber: classification.occupants.reduce((max, occupant) => Math.max(max, occupant.day_number), 0),
      totalNights: classification.occupants.reduce((max, occupant) => Math.max(max, occupant.total_nights), 0),
      cleaningType: classification.classification_bucket === "room_refresh"
        ? "refresh"
        : classification.classification_bucket?.includes("full_disinfect")
          ? "disinfect"
          : classification.classification_bucket?.includes("setup")
            ? "setup"
            : "none",
      needsDisinfect: taskSet.has("full_disinfect"),
      needsRefresh: taskSet.has("room_refresh"),
      needsSetup: taskSet.has("setup"),
      needsSanitize: taskSet.has("sanitize"),
      setupReason: classification.occupants[0]?.setup_reason || null,
      suggestedBowlSize: classification.occupants[0]?.suggested_bowl_size || null,
      dogWeight: classification.occupants[0]?.dog_weight ?? null,
      photoUrl: classification.occupants[0]?.photo_url || null,
      isCheckedOut: classification.classification_bucket === "full_disinfect" || classification.classification_bucket === "full_disinfect_then_setup" || classification.classification_bucket === "full_disinfect_then_setup_and_sanitize",
      dogs,
      room_resolution_status: classification.room_resolution_status,
      occupants: classification.occupants,
    };
  });

  return {
    rooms,
    task_instances: tasks,
    classification_summary: classificationSummary,
    task_summary: taskSummary,
    room_classifications: roomClassifications,
    data_issues: dataIssues,
    summary: {
      totalOccupied: roomClassifications.filter((classification) => classification.classification_bucket != null).length,
      totalRooms: roomClassifications.length,
      totalRefresh: taskSummary.room_refresh,
      totalDisinfect: taskSummary.full_disinfect,
      totalSetups: taskSummary.setup,
      totalSanitize: taskSummary.sanitize,
      totalTasks: taskSummary.total_tasks,
      dataIssueCount: dataIssues.length,
    },
  };
}

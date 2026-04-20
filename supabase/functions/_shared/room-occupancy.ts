export type RoomOccupancyReservationCategory =
  | "boarding"
  | "day_boarding"
  | "daycare"
  | "evaluation"
  | "tour"
  | "grooming"
  | "other";

export type RoomOccupancyResolutionStatus =
  | "resolved_from_occupancy"
  | "resolved_from_reservation"
  | "resolved_from_reservation_label"
  | "not_assigned_in_gingr";

export const ROOM_OCCUPANCY_LODGING_CATEGORIES: RoomOccupancyReservationCategory[] = [
  "boarding",
  "day_boarding",
];

export interface RoomOccupancyRunInput {
  gingr_run_id?: string | number | null;
  run_name?: string | null;
  area_name?: string | null;
  run_type?: string | null;
}

export interface RoomOccupancyInputRow {
  gingr_run_id?: string | number | null;
  run_name?: string | null;
  area_name?: string | null;
  occupancy_date?: string | null;
  animal_names?: string | null;
  occupied?: boolean | null;
  end_date?: string | null;
}

export interface RoomOccupancyReservationInput {
  reservation_id: string;
  animal_id?: string | null;
  animal_name: string;
  owner_first_name?: string | null;
  owner_last_name?: string | null;
  reservation_type_name: string;
  start_date: string;
  end_date: string;
  check_in_date?: string | null;
  check_out_date?: string | null;
  cancelled_date?: string | null;
  raw_data?: Record<string, any> | null;
  room_assignment?: string | null;
  photo_url?: string | null;
}

export interface RoomOccupancyCandidate {
  source:
    | "occupancy"
    | "reservation_run_id"
    | "reservation_raw_run"
    | "reservation_room_assignment";
  source_date: string | null;
  room_name: string;
  room_code: string | null;
  room_key: string;
  run_id: string | null;
  area_name: string;
  room_type: string;
  score: number;
  matched_on: string;
  occupancy_end_date: string | null;
}

export interface RoomOccupancyAssignment {
  reservation_id: string;
  animal_id: string;
  animal_name: string;
  owner_first_name: string;
  owner_last_name: string;
  owner_name: string;
  join_key: string;
  reservation_type_name: string;
  reservation_category: RoomOccupancyReservationCategory;
  start_date: string;
  end_date: string;
  start_day: string;
  end_day: string;
  check_in_date: string | null;
  check_out_date: string | null;
  photo_url: string | null;
  assigned_room_name: string | null;
  assigned_room_code: string | null;
  assigned_room_key: string | null;
  assigned_run_id: string | null;
  assigned_area_name: string;
  assigned_room_type: string;
  room_resolution_status: RoomOccupancyResolutionStatus;
  assignment_source: RoomOccupancyCandidate["source"] | "unresolved";
  assignment_source_date: string | null;
  assignment_score: number | null;
  assignment_matched_on: string | null;
  occupancy_end_date: string | null;
  assignment_candidates: RoomOccupancyCandidate[];
}

export interface RoomOccupancyObservation {
  date: string;
  animal_name: string;
  owner_name: string;
  join_key: string;
  room_name: string;
  room_code: string | null;
  room_key: string;
  run_id: string | null;
  area_name: string;
  room_type: string;
  occupancy_end_date: string | null;
}

export interface RoomOccupancyRoomGroup {
  room_name: string;
  room_code: string | null;
  room_key: string;
  run_id: string | null;
  area_name: string;
  room_type: string;
  observed_by_date: Record<string, RoomOccupancyObservation[]>;
  assignments: RoomOccupancyAssignment[];
}

export interface RoomOccupancySnapshot {
  date: string;
  previous_date: string;
  next_date: string;
  assignments: RoomOccupancyAssignment[];
  room_groups: RoomOccupancyRoomGroup[];
  shadow_dropped_reservations: RoomOccupancyAssignment[];
  unresolved_assignments: RoomOccupancyAssignment[];
}

export interface RoomOccupancyLookupCompanion {
  animal_name: string;
  owner_name: string;
  is_sibling: boolean;
}

export interface RoomOccupancyLookupEntry {
  reservation_id: string;
  animal_id: string;
  animal_name: string;
  owner_name: string;
  join_key: string;
  reservation_type_name: string;
  reservation_category: RoomOccupancyReservationCategory;
  start_day: string;
  end_day: string;
  check_in_date: string | null;
  check_out_date: string | null;
  room_label: string | null;
  room_code: string | null;
  room_key: string | null;
  run_id: string | null;
  area_name: string;
  room_type: string;
  room_resolution_status: RoomOccupancyResolutionStatus;
  assignment_source: RoomOccupancyCandidate["source"] | "unresolved";
  assignment_source_date: string | null;
  assignment_score: number | null;
  assignment_matched_on: string | null;
  occupancy_end_date: string | null;
  occupants_today: RoomOccupancyLookupCompanion[];
  roommates: RoomOccupancyLookupCompanion[];
}

export interface RoomOccupancyLookup {
  byReservationId: Map<string, RoomOccupancyLookupEntry>;
  byAnimalId: Map<string, RoomOccupancyLookupEntry[]>;
  byAnimalName: Map<string, RoomOccupancyLookupEntry[]>;
  byJoinKey: Map<string, RoomOccupancyLookupEntry[]>;
}

export interface RoomOccupancyComputedItems {
  date: string;
  previous_date: string;
  next_date: string;
  summary: {
    total_assignments: number;
    resolved_assignments: number;
    unresolved_assignments: number;
    shadow_dropped_reservations: number;
    total_rooms: number;
    occupied_rooms_today: number;
  };
  assignments: RoomOccupancyLookupEntry[];
  rooms: Array<{
    room_label: string;
    room_code: string | null;
    room_key: string;
    run_id: string | null;
    area_name: string;
    room_type: string;
    occupants_today: RoomOccupancyLookupCompanion[];
    occupants_previous_day: RoomOccupancyLookupCompanion[];
    occupants_next_day: RoomOccupancyLookupCompanion[];
    assignment_reservation_ids: string[];
  }>;
  unresolved_assignments: RoomOccupancyLookupEntry[];
  shadow_dropped_reservations: Array<{
    reservation_id: string;
    animal_id: string;
    animal_name: string;
    owner_name: string;
    reservation_type_name: string;
    start_day: string;
    end_day: string;
  }>;
}

export interface BuildRoomOccupancyInput {
  date: string;
  runs: RoomOccupancyRunInput[];
  occupancy_rows: RoomOccupancyInputRow[];
  reservations: RoomOccupancyReservationInput[];
  include_categories?: RoomOccupancyReservationCategory[];
}

export interface FetchRoomOccupancySnapshotInput {
  supabase: any;
  locationId: string;
  date: string;
  reservations?: RoomOccupancyReservationInput[];
  includeCategories?: RoomOccupancyReservationCategory[];
}

interface RunCatalogEntry {
  runId: string | null;
  runName: string;
  roomCode: string | null;
  roomKey: string;
  areaName: string;
  roomType: string;
}

interface ResolvedRunCandidate {
  source: RoomOccupancyCandidate["source"];
  roomName: string;
  roomCode: string | null;
  roomKey: string;
  runId: string | null;
  areaName: string;
  roomType: string;
  matchedOn: string;
}

interface EnrichedReservation {
  reservation_id: string;
  animal_id: string;
  animal_name: string;
  owner_first_name: string;
  owner_last_name: string;
  owner_name: string;
  join_key: string;
  reservation_type_name: string;
  reservation_category: RoomOccupancyReservationCategory;
  start_date: string;
  end_date: string;
  start_day: string;
  end_day: string;
  check_in_date: string | null;
  check_out_date: string | null;
  cancelled_date: string | null;
  raw_data: Record<string, any> | null;
  room_assignment: string | null;
  photo_url: string | null;
}

function normalizeDate(value: string | null | undefined): string {
  if (!value) return "";
  const raw = String(value).trim();
  if (!raw) return "";
  if (raw.includes("T")) return raw.split("T")[0];
  if (raw.includes(" ")) return raw.split(" ")[0];
  return raw;
}

function addDays(date: string, days: number): string {
  const dt = new Date(`${date}T12:00:00`);
  dt.setDate(dt.getDate() + days);
  return dt.toISOString().slice(0, 10);
}

function normalizeWhitespace(value: string): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeName(value: string | null | undefined): string {
  return normalizeWhitespace(String(value || "")).toLowerCase();
}

function normalizeLabel(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[()]/g, "")
    .replace(/[^a-z0-9 ]/g, "");
}

function sanitizeRoomKey(value: string): string {
  return String(value || "")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .toLowerCase();
}

function safeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function extractRoomCode(label: string | null | undefined): string | null {
  const source = String(label || "").trim().toUpperCase();
  if (!source) return null;

  const letterRoom = source.match(/\b([1-8][ABC])\b/);
  if (letterRoom) return letterRoom[1];

  const wingRoom = source.match(/\b(LER|SER)\s*0*([1-9]|10)\b/);
  if (wingRoom) return `${wingRoom[1]}${wingRoom[2]}`;

  const numericRoom = source.match(/\b([1-9][0-9]{2})\b/);
  if (numericRoom) return numericRoom[1];

  return null;
}

export function parseRoomOccupancyAnimalNames(
  animalNames: string | null | undefined,
): Array<{ dogName: string; ownerName: string }> {
  if (!animalNames) return [];
  const entries = String(animalNames)
    .split(/<br\s*\/?>/i)
    .map((entry) => entry.trim())
    .filter(Boolean);

  const results: Array<{ dogName: string; ownerName: string }> = [];
  for (const entry of entries) {
    const parenGroups: string[] = [];
    const parenRe = /\(([^)]+)\)/g;
    let match;
    while ((match = parenRe.exec(entry)) !== null) {
      parenGroups.push(match[1].trim());
    }

    let dogName = normalizeWhitespace(entry);
    let ownerName = "";
    if (parenGroups.length >= 1) {
      ownerName = normalizeWhitespace(parenGroups[parenGroups.length - 1]);
      const suffix = `(${ownerName})`;
      const lastIndex = entry.lastIndexOf(suffix);
      dogName = normalizeWhitespace(
        lastIndex >= 0 ? entry.substring(0, lastIndex) : entry,
      );
    }

    if (dogName) {
      results.push({ dogName, ownerName });
    }
  }

  return results;
}

export function classifyRoomOccupancyReservationType(
  reservationTypeName: string | null | undefined,
): RoomOccupancyReservationCategory {
  const value = String(reservationTypeName || "").toLowerCase();
  if (value.includes("evaluation") || value.includes("eval")) return "evaluation";
  if (value.includes("tour")) return "tour";
  if (value.includes("day boarding") || value.includes("day board")) {
    return "day_boarding";
  }
  if (value.includes("daycare") || value.includes("day care")) return "daycare";
  if (
    value.includes("boarding") ||
    value.includes("lodge") ||
    value.includes("kennel") ||
    value.includes("suite") ||
    value.includes("villa") ||
    value.includes("executive") ||
    value.includes("compartment") ||
    value.includes("overnight")
  ) {
    return "boarding";
  }
  if (value.includes("groom") || value.includes("bath")) return "grooming";
  return "other";
}

export function mapDbReservationRowToRoomOccupancyInput(
  row: any,
): RoomOccupancyReservationInput {
  return {
    reservation_id: safeText(row?.gingr_id || row?.reservation_id || row?.id),
    animal_id: safeText(row?.animal_gingr_id || row?.animal_id || row?.raw_data?.animal?.id),
    animal_name: safeText(row?.animal_name || row?.raw_data?.animal?.name),
    owner_first_name: safeText(row?.owner_first_name || row?.raw_data?.owner?.first_name),
    owner_last_name: safeText(row?.owner_last_name || row?.raw_data?.owner?.last_name),
    reservation_type_name: safeText(
      row?.reservation_type_name || row?.raw_data?.reservation_type?.type,
    ),
    start_date: safeText(row?.start_date || row?.raw_data?.start_date),
    end_date: safeText(row?.end_date || row?.raw_data?.end_date),
    check_in_date: safeText(row?.check_in_date),
    check_out_date: safeText(row?.check_out_date),
    cancelled_date: safeText(row?.cancelled_date),
    raw_data: row?.raw_data || null,
    room_assignment: safeText(row?.room_assignment),
    photo_url: safeText(row?.photo_url || row?.image_url || row?.local_photo_url),
  };
}

function buildRunCatalog(runs: RoomOccupancyRunInput[]): {
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
    const runName = normalizeWhitespace(String(run.run_name || ""));
    if (!runName) continue;
    const runId = run.gingr_run_id == null ? null : String(run.gingr_run_id);
    const roomCode = extractRoomCode(runName);
    const roomKey = roomCode ? roomCode.toLowerCase() : sanitizeRoomKey(runName);
    const entry: RunCatalogEntry = {
      runId,
      runName,
      roomCode,
      roomKey,
      areaName: normalizeWhitespace(String(run.area_name || "")),
      roomType: normalizeWhitespace(String(run.run_type || run.area_name || "")),
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

function resolveRunCandidate(
  source: RoomOccupancyCandidate["source"],
  candidate: { runId?: string | null; room?: string | null; areaName?: string | null },
  catalog: ReturnType<typeof buildRunCatalog>,
): ResolvedRunCandidate | null {
  const candidateRunId = candidate.runId ? String(candidate.runId) : null;
  const candidateRoom = normalizeWhitespace(String(candidate.room || ""));
  const candidateArea = normalizeWhitespace(String(candidate.areaName || ""));

  if (candidateRunId && catalog.byRunId.has(candidateRunId)) {
    const match = catalog.byRunId.get(candidateRunId)!;
    return {
      source,
      roomName: match.runName,
      roomCode: match.roomCode,
      roomKey: match.roomKey,
      runId: match.runId,
      areaName: match.areaName,
      roomType: match.roomType,
      matchedOn: "run_id",
    };
  }

  const normalizedRoom = normalizeLabel(candidateRoom);
  if (normalizedRoom && catalog.byLabel.has(normalizedRoom)) {
    const match = catalog.byLabel.get(normalizedRoom)!;
    return {
      source,
      roomName: match.runName,
      roomCode: match.roomCode,
      roomKey: match.roomKey,
      runId: match.runId,
      areaName: match.areaName,
      roomType: match.roomType,
      matchedOn: "exact_room_label",
    };
  }

  const roomCode = extractRoomCode(candidateRoom);
  if (roomCode) {
    const matches = catalog.byRoomCode.get(roomCode) || [];
    if (matches.length === 1) {
      const match = matches[0];
      return {
        source,
        roomName: match.runName,
        roomCode: match.roomCode,
        roomKey: match.roomKey,
        runId: match.runId,
        areaName: match.areaName,
        roomType: match.roomType,
        matchedOn: candidateRoom === roomCode ? "room_code_alias" : "room_code_from_label",
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
          if (
            candidateArea &&
            normalizeLabel(match.areaName) === normalizeLabel(candidateArea)
          ) {
            score += 1;
          }
          return { match, score };
        })
        .sort((left, right) => right.score - left.score);

      if (scored[0]?.score > 0 && (!scored[1] || scored[0].score > scored[1].score)) {
        const match = scored[0].match;
        return {
          source,
          roomName: match.runName,
          roomCode: match.roomCode,
          roomKey: match.roomKey,
          runId: match.runId,
          areaName: match.areaName,
          roomType: match.roomType,
          matchedOn: "room_code_scored_match",
        };
      }
    }

    return {
      source,
      roomName: candidateRoom || roomCode,
      roomCode,
      roomKey: roomCode.toLowerCase(),
      runId: null,
      areaName: candidateArea,
      roomType: "",
      matchedOn: "room_code_only",
    };
  }

  if (!candidateRoom) return null;

  return {
    source,
    roomName: candidateRoom,
    roomCode: null,
    roomKey: sanitizeRoomKey(candidateRoom),
    runId: null,
    areaName: candidateArea,
    roomType: "",
    matchedOn: "raw_room_label",
  };
}

function buildObservations(
  occupancyRows: RoomOccupancyInputRow[],
  catalog: ReturnType<typeof buildRunCatalog>,
): RoomOccupancyObservation[] {
  const observations: RoomOccupancyObservation[] = [];
  for (const row of occupancyRows || []) {
    if (!row.occupied) continue;
    const resolved = resolveRunCandidate(
      "occupancy",
      {
        runId: row.gingr_run_id == null ? null : String(row.gingr_run_id),
        room: row.run_name || null,
        areaName: row.area_name || null,
      },
      catalog,
    );
    if (!resolved) continue;

    const occupancyDate = normalizeDate(row.occupancy_date);
    for (const dog of parseRoomOccupancyAnimalNames(row.animal_names)) {
      observations.push({
        date: occupancyDate,
        animal_name: dog.dogName,
        owner_name: dog.ownerName,
        join_key: `${normalizeName(dog.dogName)}|${normalizeName(dog.ownerName)}`,
        room_name: resolved.roomName,
        room_code: resolved.roomCode,
        room_key: resolved.roomKey,
        run_id: resolved.runId,
        area_name: resolved.areaName,
        room_type: resolved.roomType,
        occupancy_end_date: normalizeDate(row.end_date),
      });
    }
  }

  return observations;
}

function enrichReservations(
  reservations: RoomOccupancyReservationInput[],
  serviceDate: string,
  includeCategories?: RoomOccupancyReservationCategory[],
): EnrichedReservation[] {
  const result: EnrichedReservation[] = [];
  const allowed = new Set(
    includeCategories?.length ? includeCategories : ROOM_OCCUPANCY_LODGING_CATEGORIES,
  );

  for (const reservation of reservations || []) {
    const cancelledDate = normalizeDate(reservation.cancelled_date);
    if (cancelledDate) continue;

    const startDate = normalizeDate(reservation.start_date || reservation.raw_data?.start_date);
    const endDate = normalizeDate(reservation.end_date || reservation.raw_data?.end_date);
    if (!startDate || !endDate) continue;
    if (startDate > serviceDate || endDate < serviceDate) continue;
    const checkOutDate = normalizeDate(reservation.check_out_date);
    if (checkOutDate && checkOutDate < serviceDate) continue;

    const category = classifyRoomOccupancyReservationType(
      reservation.reservation_type_name || reservation.raw_data?.reservation_type?.type,
    );
    if (allowed && !allowed.has(category)) continue;

    const animalName = safeText(reservation.animal_name || reservation.raw_data?.animal?.name);
    const ownerFirstName = safeText(
      reservation.owner_first_name || reservation.raw_data?.owner?.first_name,
    );
    const ownerLastName = safeText(
      reservation.owner_last_name || reservation.raw_data?.owner?.last_name,
    );
    const ownerName = [ownerFirstName, ownerLastName].filter(Boolean).join(" ");
    const animalId = safeText(
      reservation.animal_id || reservation.raw_data?.animal?.id,
    );
    result.push({
      reservation_id: String(reservation.reservation_id),
      animal_id: animalId,
      animal_name: animalName,
      owner_first_name: ownerFirstName,
      owner_last_name: ownerLastName,
      owner_name: ownerName,
      join_key: `${normalizeName(animalName)}|${normalizeName(ownerName)}`,
      reservation_type_name: safeText(
        reservation.reservation_type_name || reservation.raw_data?.reservation_type?.type,
      ),
      reservation_category: category,
      start_date: reservation.start_date,
      end_date: reservation.end_date,
      start_day: startDate,
      end_day: endDate,
      check_in_date: reservation.check_in_date ? String(reservation.check_in_date) : null,
      check_out_date: reservation.check_out_date ? String(reservation.check_out_date) : null,
      cancelled_date: cancelledDate || null,
      raw_data: reservation.raw_data || null,
      room_assignment: reservation.room_assignment ? String(reservation.room_assignment) : null,
      photo_url: reservation.photo_url ? String(reservation.photo_url) : null,
    });
  }

  return result;
}

function dedupeReservations(
  reservations: EnrichedReservation[],
): {
  kept: EnrichedReservation[];
  dropped: EnrichedReservation[];
} {
  const groups = new Map<string, EnrichedReservation[]>();
  for (const reservation of reservations || []) {
    const key = [
      reservation.join_key,
      reservation.reservation_category,
      reservation.start_day,
      reservation.end_day,
    ].join("|");
    const existing = groups.get(key) || [];
    existing.push(reservation);
    groups.set(key, existing);
  }

  const kept: EnrichedReservation[] = [];
  const dropped: EnrichedReservation[] = [];
  for (const group of groups.values()) {
    const sorted = [...group].sort((left, right) => {
      const leftCheckedIn = left.check_in_date ? 1 : 0;
      const rightCheckedIn = right.check_in_date ? 1 : 0;
      if (leftCheckedIn !== rightCheckedIn) return rightCheckedIn - leftCheckedIn;

      const leftId = Number.parseInt(left.reservation_id, 10);
      const rightId = Number.parseInt(right.reservation_id, 10);
      if (Number.isFinite(leftId) && Number.isFinite(rightId) && leftId !== rightId) {
        return leftId - rightId;
      }

      return left.reservation_id.localeCompare(right.reservation_id);
    });

    kept.push(sorted[0]);
    dropped.push(...sorted.slice(1));
  }

  return { kept, dropped };
}

function scoreObservationCandidate(
  reservation: EnrichedReservation,
  observation: RoomOccupancyObservation,
  serviceDate: string,
  previousDate: string,
  nextDate: string,
): number {
  let score = 0;
  if (
    observation.occupancy_end_date &&
    reservation.end_day &&
    observation.occupancy_end_date === reservation.end_day
  ) {
    score += 50;
  }
  if (observation.date === serviceDate) score += 40;
  if (reservation.start_day === serviceDate && observation.date === nextDate) score += 30;
  if (reservation.end_day === serviceDate && observation.date === previousDate) score += 30;
  if (reservation.check_in_date && observation.date === serviceDate) score += 10;
  if (reservation.reservation_category === "boarding" && observation.date !== serviceDate) {
    score += 5;
  }
  return score;
}

function buildFallbackCandidates(
  reservation: EnrichedReservation,
  catalog: ReturnType<typeof buildRunCatalog>,
): RoomOccupancyCandidate[] {
  const candidates: RoomOccupancyCandidate[] = [];
  const rawRunId = reservation.raw_data?.run_id == null
    ? null
    : String(reservation.raw_data.run_id);
  const rawRunName = safeText(reservation.raw_data?.run_name);
  const roomAssignment = safeText(reservation.room_assignment);

  const addCandidate = (
    source: RoomOccupancyCandidate["source"],
    resolved: ResolvedRunCandidate | null,
    score: number,
  ) => {
    if (!resolved) return;
    candidates.push({
      source,
      source_date: null,
      room_name: resolved.roomName,
      room_code: resolved.roomCode,
      room_key: resolved.roomKey,
      run_id: resolved.runId,
      area_name: resolved.areaName,
      room_type: resolved.roomType,
      score,
      matched_on: resolved.matchedOn,
      occupancy_end_date: null,
    });
  };

  addCandidate(
    "reservation_run_id",
    resolveRunCandidate(
      "reservation_run_id",
      { runId: rawRunId, room: rawRunName || roomAssignment || null },
      catalog,
    ),
    35,
  );

  if (roomAssignment) {
    addCandidate(
      "reservation_room_assignment",
      resolveRunCandidate(
        "reservation_room_assignment",
        { room: roomAssignment },
        catalog,
      ),
      30,
    );
  }

  if (rawRunName) {
    addCandidate(
      "reservation_raw_run",
      resolveRunCandidate(
        "reservation_raw_run",
        { room: rawRunName, areaName: safeText(reservation.raw_data?.area_name) },
        catalog,
      ),
      25,
    );
  }

  return candidates;
}

function toAssignment(
  reservation: EnrichedReservation,
  candidates: RoomOccupancyCandidate[],
): RoomOccupancyAssignment {
  const best = candidates[0] || null;
  return {
    reservation_id: reservation.reservation_id,
    animal_id: reservation.animal_id,
    animal_name: reservation.animal_name,
    owner_first_name: reservation.owner_first_name,
    owner_last_name: reservation.owner_last_name,
    owner_name: reservation.owner_name,
    join_key: reservation.join_key,
    reservation_type_name: reservation.reservation_type_name,
    reservation_category: reservation.reservation_category,
    start_date: reservation.start_date,
    end_date: reservation.end_date,
    start_day: reservation.start_day,
    end_day: reservation.end_day,
    check_in_date: reservation.check_in_date,
    check_out_date: reservation.check_out_date,
    photo_url: reservation.photo_url,
    assigned_room_name: best?.room_name || null,
    assigned_room_code: best?.room_code || null,
    assigned_room_key: best?.room_key || null,
    assigned_run_id: best?.run_id || null,
    assigned_area_name: best?.area_name || "",
    assigned_room_type: best?.room_type || "",
    room_resolution_status: best
      ? best.source === "occupancy"
        ? "resolved_from_occupancy"
        : best.matched_on === "room_code_only" || best.matched_on === "raw_room_label"
          ? "resolved_from_reservation_label"
          : "resolved_from_reservation"
      : "not_assigned_in_gingr",
    assignment_source: best?.source || "unresolved",
    assignment_source_date: best?.source_date || null,
    assignment_score: best?.score ?? null,
    assignment_matched_on: best?.matched_on || null,
    occupancy_end_date: best?.occupancy_end_date || null,
    assignment_candidates: candidates,
  };
}

export function buildRoomOccupancySnapshot(
  input: BuildRoomOccupancyInput,
): RoomOccupancySnapshot {
  const date = normalizeDate(input.date);
  const previousDate = addDays(date, -1);
  const nextDate = addDays(date, 1);
  const catalog = buildRunCatalog(input.runs || []);
  const observations = buildObservations(input.occupancy_rows || [], catalog);
  const observationsByJoinKey = new Map<string, RoomOccupancyObservation[]>();
  for (const observation of observations) {
    const existing = observationsByJoinKey.get(observation.join_key) || [];
    existing.push(observation);
    observationsByJoinKey.set(observation.join_key, existing);
  }

  const enriched = enrichReservations(
    input.reservations || [],
    date,
    input.include_categories,
  );
  const { kept, dropped } = dedupeReservations(enriched);

  const assignments = kept.map((reservation) => {
    const occupancyCandidates = (observationsByJoinKey.get(reservation.join_key) || [])
      .map((observation) => ({
        source: "occupancy" as const,
        source_date: observation.date,
        room_name: observation.room_name,
        room_code: observation.room_code,
        room_key: observation.room_key,
        run_id: observation.run_id,
        area_name: observation.area_name,
        room_type: observation.room_type,
        score: scoreObservationCandidate(
          reservation,
          observation,
          date,
          previousDate,
          nextDate,
        ),
        matched_on: "dog_owner_join",
        occupancy_end_date: observation.occupancy_end_date,
      }))
      .sort((left, right) => {
        if (left.score !== right.score) return right.score - left.score;
        return left.room_name.localeCompare(right.room_name);
      });

    const fallbackCandidates = buildFallbackCandidates(reservation, catalog);
    const allCandidates = [...occupancyCandidates, ...fallbackCandidates]
      .sort((left, right) => {
        if (left.score !== right.score) return right.score - left.score;
        if ((left.source_date || "") !== (right.source_date || "")) {
          return (right.source_date || "").localeCompare(left.source_date || "");
        }
        return left.room_name.localeCompare(right.room_name);
      })
      .slice(0, 5);

    return toAssignment(reservation, allCandidates);
  });

  const roomGroups = new Map<string, RoomOccupancyRoomGroup>();
  const ensureGroup = (
    roomKey: string,
    payload: {
      room_name: string;
      room_code: string | null;
      run_id: string | null;
      area_name: string;
      room_type: string;
    },
  ) => {
    if (!roomGroups.has(roomKey)) {
      roomGroups.set(roomKey, {
        room_name: payload.room_name,
        room_code: payload.room_code,
        room_key: roomKey,
        run_id: payload.run_id,
        area_name: payload.area_name,
        room_type: payload.room_type,
        observed_by_date: {},
        assignments: [],
      });
    }
    return roomGroups.get(roomKey)!;
  };

  for (const observation of observations) {
    const group = ensureGroup(observation.room_key, {
      room_name: observation.room_name,
      room_code: observation.room_code,
      run_id: observation.run_id,
      area_name: observation.area_name,
      room_type: observation.room_type,
    });
    const existing = group.observed_by_date[observation.date] || [];
    existing.push(observation);
    group.observed_by_date[observation.date] = existing;
  }

  for (const assignment of assignments) {
    if (!assignment.assigned_room_key || !assignment.assigned_room_name) continue;
    const group = ensureGroup(assignment.assigned_room_key, {
      room_name: assignment.assigned_room_name,
      room_code: assignment.assigned_room_code,
      run_id: assignment.assigned_run_id,
      area_name: assignment.assigned_area_name,
      room_type: assignment.assigned_room_type,
    });
    group.assignments.push(assignment);
  }

  const droppedAssignments = dropped.map((reservation) => toAssignment(reservation, []));
  const unresolvedAssignments = assignments.filter((assignment) => !assignment.assigned_room_name);
  const orderedGroups = [...roomGroups.values()].sort((left, right) => {
    if (left.area_name !== right.area_name) {
      return left.area_name.localeCompare(right.area_name);
    }
    if ((left.room_code || "") !== (right.room_code || "")) {
      return (left.room_code || "").localeCompare(right.room_code || "", undefined, {
        numeric: true,
      });
    }
    return left.room_name.localeCompare(right.room_name, undefined, { numeric: true });
  });

  return {
    date,
    previous_date: previousDate,
    next_date: nextDate,
    assignments,
    room_groups: orderedGroups,
    shadow_dropped_reservations: droppedAssignments,
    unresolved_assignments: unresolvedAssignments,
  };
}

export function buildRoomOccupancyLookup(
  snapshot: RoomOccupancySnapshot,
): RoomOccupancyLookup {
  const byReservationId = new Map<string, RoomOccupancyLookupEntry>();
  const byAnimalId = new Map<string, RoomOccupancyLookupEntry[]>();
  const byAnimalName = new Map<string, RoomOccupancyLookupEntry[]>();
  const byJoinKey = new Map<string, RoomOccupancyLookupEntry[]>();
  const roomGroupByKey = new Map<string, RoomOccupancyRoomGroup>();

  for (const group of snapshot.room_groups || []) {
    roomGroupByKey.set(group.room_key, group);
  }

  for (const assignment of snapshot.assignments || []) {
    const group = assignment.assigned_room_key
      ? roomGroupByKey.get(assignment.assigned_room_key) || null
      : null;
    const occupantsToday = (group?.observed_by_date?.[snapshot.date] || []).map((occupant) => ({
      animal_name: occupant.animal_name,
      owner_name: occupant.owner_name,
      is_sibling: occupant.owner_name !== "" && occupant.owner_name === assignment.owner_name,
    }));
    const roommates = occupantsToday.filter((occupant) =>
      normalizeName(occupant.animal_name) !== normalizeName(assignment.animal_name) ||
      normalizeName(occupant.owner_name) !== normalizeName(assignment.owner_name)
    );

    const entry: RoomOccupancyLookupEntry = {
      reservation_id: assignment.reservation_id,
      animal_id: assignment.animal_id,
      animal_name: assignment.animal_name,
      owner_name: assignment.owner_name,
      join_key: assignment.join_key,
      reservation_type_name: assignment.reservation_type_name,
      reservation_category: assignment.reservation_category,
      start_day: assignment.start_day,
      end_day: assignment.end_day,
      check_in_date: assignment.check_in_date,
      check_out_date: assignment.check_out_date,
      room_label: assignment.assigned_room_name,
      room_code: assignment.assigned_room_code,
      room_key: assignment.assigned_room_key,
      run_id: assignment.assigned_run_id,
      area_name: assignment.assigned_area_name,
      room_type: assignment.assigned_room_type,
      room_resolution_status: assignment.room_resolution_status,
      assignment_source: assignment.assignment_source,
      assignment_source_date: assignment.assignment_source_date,
      assignment_score: assignment.assignment_score,
      assignment_matched_on: assignment.assignment_matched_on,
      occupancy_end_date: assignment.occupancy_end_date,
      occupants_today: occupantsToday,
      roommates,
    };

    byReservationId.set(entry.reservation_id, entry);
    if (entry.animal_id) {
      const existingByAnimalId = byAnimalId.get(entry.animal_id) || [];
      existingByAnimalId.push(entry);
      byAnimalId.set(entry.animal_id, existingByAnimalId);
    }
    const animalNameKey = normalizeName(entry.animal_name);
    if (animalNameKey) {
      const existingByAnimalName = byAnimalName.get(animalNameKey) || [];
      existingByAnimalName.push(entry);
      byAnimalName.set(animalNameKey, existingByAnimalName);
    }
    const existingByJoinKey = byJoinKey.get(entry.join_key) || [];
    existingByJoinKey.push(entry);
    byJoinKey.set(entry.join_key, existingByJoinKey);
  }

  return {
    byReservationId,
    byAnimalId,
    byAnimalName,
    byJoinKey,
  };
}

export function resolveRoomOccupancyLookupEntry(
  lookup: RoomOccupancyLookup,
  input: {
    reservationId?: string | null;
    animalId?: string | null;
    animalName?: string | null;
    ownerFirstName?: string | null;
    ownerLastName?: string | null;
    ownerName?: string | null;
  },
): RoomOccupancyLookupEntry | null {
  const reservationId = safeText(input.reservationId);
  if (reservationId && lookup.byReservationId.has(reservationId)) {
    return lookup.byReservationId.get(reservationId)!;
  }

  const animalId = safeText(input.animalId);
  if (animalId && lookup.byAnimalId.has(animalId)) {
    const candidates = lookup.byAnimalId.get(animalId) || [];
    if (candidates.length === 1) return candidates[0];
    if (candidates.length > 1) {
      return [...candidates].sort((left, right) =>
        (right.assignment_score || 0) - (left.assignment_score || 0)
      )[0] || null;
    }
  }

  const ownerName = safeText(input.ownerName)
    || [safeText(input.ownerFirstName), safeText(input.ownerLastName)]
      .filter(Boolean)
      .join(" ");
  const joinKey = `${normalizeName(input.animalName || "")}|${normalizeName(ownerName)}`;
  if (lookup.byJoinKey.has(joinKey)) {
    return (lookup.byJoinKey.get(joinKey) || [])[0] || null;
  }

  const animalNameKey = normalizeName(input.animalName || "");
  if (animalNameKey && lookup.byAnimalName.has(animalNameKey)) {
    return (lookup.byAnimalName.get(animalNameKey) || [])[0] || null;
  }

  return null;
}

export function buildRoomOccupancyComputedItems(
  snapshot: RoomOccupancySnapshot,
): RoomOccupancyComputedItems {
  const lookup = buildRoomOccupancyLookup(snapshot);
  const assignments = snapshot.assignments
    .map((assignment) => lookup.byReservationId.get(assignment.reservation_id))
    .filter(Boolean) as RoomOccupancyLookupEntry[];

  const rooms = (snapshot.room_groups || []).map((group) => ({
    room_label: group.room_name,
    room_code: group.room_code,
    room_key: group.room_key,
    run_id: group.run_id,
    area_name: group.area_name,
    room_type: group.room_type,
    occupants_today: (group.observed_by_date?.[snapshot.date] || []).map((occupant) => ({
      animal_name: occupant.animal_name,
      owner_name: occupant.owner_name,
      is_sibling: false,
    })),
    occupants_previous_day: (group.observed_by_date?.[snapshot.previous_date] || []).map((occupant) => ({
      animal_name: occupant.animal_name,
      owner_name: occupant.owner_name,
      is_sibling: false,
    })),
    occupants_next_day: (group.observed_by_date?.[snapshot.next_date] || []).map((occupant) => ({
      animal_name: occupant.animal_name,
      owner_name: occupant.owner_name,
      is_sibling: false,
    })),
    assignment_reservation_ids: group.assignments.map((assignment) => assignment.reservation_id),
  }));

  return {
    date: snapshot.date,
    previous_date: snapshot.previous_date,
    next_date: snapshot.next_date,
    summary: {
      total_assignments: snapshot.assignments.length,
      resolved_assignments: snapshot.assignments.filter((assignment) => !!assignment.assigned_room_name).length,
      unresolved_assignments: snapshot.unresolved_assignments.length,
      shadow_dropped_reservations: snapshot.shadow_dropped_reservations.length,
      total_rooms: snapshot.room_groups.length,
      occupied_rooms_today: snapshot.room_groups.filter((group) =>
        (group.observed_by_date?.[snapshot.date] || []).length > 0
      ).length,
    },
    assignments,
    rooms,
    unresolved_assignments: snapshot.unresolved_assignments
      .map((assignment) => lookup.byReservationId.get(assignment.reservation_id))
      .filter(Boolean) as RoomOccupancyLookupEntry[],
    shadow_dropped_reservations: snapshot.shadow_dropped_reservations.map((assignment) => ({
      reservation_id: assignment.reservation_id,
      animal_id: assignment.animal_id,
      animal_name: assignment.animal_name,
      owner_name: assignment.owner_name,
      reservation_type_name: assignment.reservation_type_name,
      start_day: assignment.start_day,
      end_day: assignment.end_day,
    })),
  };
}

export async function fetchRoomOccupancySnapshotForDate(
  input: FetchRoomOccupancySnapshotInput,
): Promise<RoomOccupancySnapshot> {
  const date = normalizeDate(input.date);
  const previousDate = addDays(date, -1);
  const nextDate = addDays(date, 1);

  const [runsResult, occupancyResult, reservationsResult] = await Promise.all([
    input.supabase
      .from("gingr_runs")
      .select("gingr_run_id, run_name, area_name, run_type")
      .eq("location_id", input.locationId),
    input.supabase
      .from("gingr_room_occupancy")
      .select("gingr_run_id, run_name, area_name, occupancy_date, animal_names, occupied, end_date")
      .eq("location_id", input.locationId)
      .in("occupancy_date", [previousDate, date, nextDate])
      .eq("occupied", true),
    input.reservations
      ? Promise.resolve({ data: input.reservations, error: null })
      : input.supabase
          .from("gingr_reservations")
          .select(
            "gingr_id, animal_gingr_id, animal_name, owner_first_name, owner_last_name, reservation_type_name, start_date, end_date, check_in_date, check_out_date, cancelled_date, raw_data, room_assignment",
          )
          .eq("location_id", input.locationId)
          .is("cancelled_date", null)
          .lte("start_date", `${date}T23:59:59`)
          .gte("end_date", `${date}T00:00:00`),
  ]);

  if (runsResult.error) {
    throw new Error(`Room occupancy runs query failed: ${runsResult.error.message}`);
  }
  if (occupancyResult.error) {
    throw new Error(`Room occupancy rows query failed: ${occupancyResult.error.message}`);
  }
  if (reservationsResult.error) {
    throw new Error(`Room occupancy reservations query failed: ${reservationsResult.error.message}`);
  }

  const reservations = input.reservations || (reservationsResult.data || []).map(
    mapDbReservationRowToRoomOccupancyInput,
  );

  return buildRoomOccupancySnapshot({
    date,
    runs: runsResult.data || [],
    occupancy_rows: occupancyResult.data || [],
    reservations,
    include_categories: input.includeCategories || ROOM_OCCUPANCY_LODGING_CATEGORIES,
  });
}

import {
  buildPlaygroupAssignmentMap,
  fetchPlaygroupAssignments,
  getCanonicalPlaygroupTags,
  humanizePlaygroupTag,
} from "./playgroup-assignments.ts";
import { fetchRoomOccupancySnapshotForDate } from "./room-occupancy.ts";

export type RollCallSession = "opening" | "closing";

export interface RollCallDog {
  animalGingrId: string;
  reservationGingrId: string;
  dogName: string;
  ownerName: string;
  breed: string;
  reservationTypeName: string;
  startDate: string;
  endDate: string;
  roomName: string;
  areaName: string;
  photoUrl: string | null;
  playgroup: string | null;
  tags: string[];
}

export interface RollCallRoom {
  roomKey: string;
  roomName: string;
  areaName: string;
  dogs: RollCallDog[];
}

export interface RollCallArea {
  name: string;
  roomCount: number;
  dogCount: number;
  rooms: RollCallRoom[];
}

export interface RollCallComputedItems {
  summary: {
    session: RollCallSession;
    totalRooms: number;
    totalDogs: number;
  };
  areas: RollCallArea[];
  rooms: RollCallRoom[];
}

function todayET(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeRoomName(value: string): string {
  return normalizeWhitespace(value)
    .replace(/\s*-\s*/g, " - ")
    .toLowerCase();
}

function normalizeName(value: string): string {
  return normalizeWhitespace(value).toLowerCase();
}

function safeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatDate(value: string): string {
  if (!value) return "";
  const datePart = value.includes("T") ? value.split("T")[0] : value;
  return datePart;
}

function isBoardingReservationType(typeName: string): boolean {
  const value = String(typeName || "").toLowerCase();
  return value.includes("boarding")
    || value.includes("suite")
    || value.includes("villa")
    || value.includes("executive")
    || value.includes("compartment")
    || value.includes("overnight")
    || value.includes("lodge")
    || value.includes("kennel");
}

function roomKey(areaName: string, roomName: string): string {
  return `${areaName}__${roomName}`;
}

function parseAnimalNames(
  animalNames: string,
): Array<{ dogName: string; ownerName: string }> {
  if (!animalNames) return [];
  return animalNames
    .split(/<br\s*\/?>/i)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const match = entry.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
      if (match) {
        return {
          dogName: normalizeWhitespace(match[1]),
          ownerName: normalizeWhitespace(match[2]),
        };
      }
      return {
        dogName: normalizeWhitespace(entry),
        ownerName: "",
      };
    });
}

function chooseCandidateRoom(
  reservation: any,
  occupancyByDogOwner: Record<string, { roomName: string; areaName: string }>,
  occupancyByDog: Record<string, { roomName: string; areaName: string }>,
): { roomName: string; areaName: string; score: number } | null {
  const roomAssignment = safeText(reservation.room_assignment);
  if (roomAssignment) {
    return { roomName: roomAssignment, areaName: "", score: 3 };
  }

  const rawRunName = safeText(reservation.raw_data?.run?.name);
  if (rawRunName) {
    return { roomName: rawRunName, areaName: "", score: 2 };
  }

  const animalName = safeText(reservation.animal_name || reservation.raw_data?.animal?.name);
  const ownerName = [
    safeText(reservation.owner_first_name || reservation.raw_data?.owner?.first_name),
    safeText(reservation.owner_last_name || reservation.raw_data?.owner?.last_name),
  ].filter(Boolean).join(" ");
  const byOwnerKey = `${normalizeName(animalName)}::${normalizeName(ownerName)}`;
  if (occupancyByDogOwner[byOwnerKey]) {
    return { ...occupancyByDogOwner[byOwnerKey], score: 1 };
  }

  const byDogKey = normalizeName(animalName);
  if (occupancyByDog[byDogKey]) {
    return { ...occupancyByDog[byDogKey], score: 0 };
  }

  return null;
}

function isBetterReservationCandidate(next: any, current: any): boolean {
  if (!current) return true;
  if (next.roomScore !== current.roomScore) return next.roomScore > current.roomScore;

  const nextCheckIn = safeText(next.checkInDate);
  const currentCheckIn = safeText(current.checkInDate);
  if (nextCheckIn !== currentCheckIn) return nextCheckIn > currentCheckIn;

  const nextEnd = safeText(next.endDate);
  const currentEnd = safeText(current.endDate);
  if (nextEnd !== currentEnd) return nextEnd > currentEnd;

  return safeText(next.reservationGingrId) > safeText(current.reservationGingrId);
}

export function normalizeRollCallSession(value?: string | null): RollCallSession {
  return value === "opening" ? "opening" : "closing";
}

export function getRollCallOpsId(
  session: RollCallSession,
  targetDate: string,
): string {
  return `ops_roll_call_${session}_${targetDate}`;
}

export function getRollCallWorkflowId(session: RollCallSession): string {
  return session === "opening" ? "roll-call-opening" : "roll-call-closing";
}

export function getRollCallWorkflowTitle(session: RollCallSession): string {
  return session === "opening" ? "Opening Roll Call" : "Closing Roll Call";
}

export function countVerifiedRollCallRooms(items: Record<string, any> | null | undefined): number {
  if (!items || typeof items !== "object") return 0;
  return Object.values(items).filter((value: any) => value?.verified).length;
}

export async function buildRollCallSnapshot(
  supabase: any,
  locationId: string,
  targetDate: string,
  session: RollCallSession,
): Promise<RollCallComputedItems> {
  const { data: reservations, error: reservationError } = await supabase
    .from("gingr_reservations")
    .select(
      "gingr_id, animal_gingr_id, animal_name, owner_first_name, owner_last_name, reservation_type_name, start_date, end_date, check_in_date, check_out_date, cancelled_date, room_assignment, raw_data",
    )
    .eq("location_id", locationId)
    .is("cancelled_date", null)
    .lte("start_date", `${targetDate}T23:59:59`)
    .gte("end_date", `${targetDate}T00:00:00`);

  if (reservationError) {
    throw new Error(`Roll call reservation query failed: ${reservationError.message}`);
  }

  const reservationById = new Map<string, any>();
  for (const reservation of reservations || []) {
    reservationById.set(safeText(reservation.gingr_id), reservation);
  }

  const areaOrder = new Map<string, number>();
  const roomOrder = new Map<string, number>();
  const occupancyModel = await fetchRoomOccupancySnapshotForDate({
    supabase,
    locationId,
    date: targetDate,
    reservations: reservations || [],
    includeCategories: ["boarding"],
  });

  for (const [index, roomGroup] of (occupancyModel.room_groups || []).entries()) {
    const runName = safeText(roomGroup.room_name);
    const areaName = safeText(roomGroup.area_name) || "Other";
    if (!areaOrder.has(areaName)) {
      areaOrder.set(areaName, areaOrder.size);
    }
    roomOrder.set(`${areaName}::${runName}`, index);
  }

  const animalIds = [...new Set(
    occupancyModel.assignments
      .map((assignment) => safeText(assignment.animal_id))
      .filter(Boolean),
  )];

  const [{ data: animalRows }, assignmentRows] = await Promise.all([
    animalIds.length > 0
      ? supabase
        .from("gingr_animals")
        .select("gingr_id, local_photo_url, image_url")
        .in("gingr_id", animalIds)
      : Promise.resolve({ data: [] }),
    animalIds.length > 0
      ? fetchPlaygroupAssignments({ supabase, locationId, animalIds })
      : Promise.resolve([]),
  ]);

  const photoByAnimalId: Record<string, string> = {};
  for (const animal of animalRows || []) {
    const animalId = safeText(animal.gingr_id);
    if (!animalId) continue;
    photoByAnimalId[animalId] = safeText(animal.local_photo_url) || safeText(animal.image_url);
  }

  const assignmentsByAnimalId = buildPlaygroupAssignmentMap(assignmentRows || []);

  const roomMap = new Map<string, RollCallRoom>();
  for (const assignment of occupancyModel.assignments) {
    const startDate = formatDate(assignment.start_day);
    const endDate = formatDate(assignment.end_day);
    const isOpeningDog = startDate < targetDate;
    const isClosingDog = endDate > targetDate;
    if (session === "opening" ? !isOpeningDog : !isClosingDog) continue;
    if (!assignment.assigned_room_name) continue;

    const animalGingrId = safeText(assignment.animal_id);
    const playgroupAssignment = animalGingrId
      ? (assignmentsByAnimalId.get(animalGingrId) || null)
      : null;
    const playgroup = humanizePlaygroupTag(playgroupAssignment?.primaryDisplayPlaygroup)
      || humanizePlaygroupTag(playgroupAssignment?.schedulingPlaygroup)
      || null;
    const tags = playgroupAssignment?.sourceIconTitles?.length
      ? playgroupAssignment.sourceIconTitles
      : getCanonicalPlaygroupTags(playgroupAssignment, { includeHalfAndHalf: true })
          .map((tag) => humanizePlaygroupTag(tag))
          .filter(Boolean) as string[];

    const dog = {
      animalGingrId,
      reservationGingrId: safeText(assignment.reservation_id),
      dogName: assignment.animal_name,
      ownerName: assignment.owner_name,
      breed: safeText(
        reservationById.get(safeText(assignment.reservation_id))?.raw_data?.animal?.breed,
      ),
      reservationTypeName: assignment.reservation_type_name,
      startDate,
      endDate,
      roomName: normalizeWhitespace(assignment.assigned_room_name),
      areaName: normalizeWhitespace(assignment.assigned_area_name || "Other"),
      photoUrl: animalGingrId ? (photoByAnimalId[animalGingrId] || assignment.photo_url || null) : assignment.photo_url || null,
      playgroup,
      tags,
    };
    const key = roomKey(dog.areaName, dog.roomName);
    if (!roomMap.has(key)) {
      roomMap.set(key, {
        roomKey: key,
        roomName: dog.roomName,
        areaName: dog.areaName,
        dogs: [],
      });
    }

    roomMap.get(key)!.dogs.push({
      animalGingrId: dog.animalGingrId,
      reservationGingrId: dog.reservationGingrId,
      dogName: dog.dogName,
      ownerName: dog.ownerName,
      breed: dog.breed,
      reservationTypeName: dog.reservationTypeName,
      startDate: dog.startDate,
      endDate: dog.endDate,
      roomName: dog.roomName,
      areaName: dog.areaName,
      photoUrl: dog.photoUrl,
      playgroup: dog.playgroup,
      tags: dog.tags,
    });
  }

  const rooms = [...roomMap.values()]
    .map((room) => ({
      ...room,
      dogs: [...room.dogs].sort((a, b) => a.dogName.localeCompare(b.dogName)),
    }))
    .sort((a, b) => {
      const areaDiff =
        (areaOrder.get(a.areaName) ?? Number.MAX_SAFE_INTEGER) -
        (areaOrder.get(b.areaName) ?? Number.MAX_SAFE_INTEGER);
      if (areaDiff !== 0) return areaDiff;

      const roomDiff =
        (roomOrder.get(`${a.areaName}::${a.roomName}`) ?? Number.MAX_SAFE_INTEGER) -
        (roomOrder.get(`${b.areaName}::${b.roomName}`) ?? Number.MAX_SAFE_INTEGER);
      if (roomDiff !== 0) return roomDiff;

      return a.roomName.localeCompare(b.roomName, undefined, { numeric: true });
    });

  const areaMap = new Map<string, RollCallRoom[]>();
  for (const room of rooms) {
    if (!areaMap.has(room.areaName)) areaMap.set(room.areaName, []);
    areaMap.get(room.areaName)!.push(room);
  }

  const areas = [...areaMap.entries()]
    .sort((a, b) =>
      (areaOrder.get(a[0]) ?? Number.MAX_SAFE_INTEGER) -
      (areaOrder.get(b[0]) ?? Number.MAX_SAFE_INTEGER))
    .map(([name, areaRooms]) => ({
      name,
      roomCount: areaRooms.length,
      dogCount: areaRooms.reduce((sum, room) => sum + room.dogs.length, 0),
      rooms: areaRooms,
    }));

  return {
    summary: {
      session,
      totalRooms: rooms.length,
      totalDogs: rooms.reduce((sum, room) => sum + room.dogs.length, 0),
    },
    areas,
    rooms,
  };
}

export async function loadRollCallSessionRow(
  supabase: any,
  locationId: string,
  targetDate: string,
  sessionInput: string | null | undefined,
  options?: {
    createIfMissing?: boolean;
    forceRefresh?: boolean;
  },
): Promise<any | null> {
  const session = normalizeRollCallSession(sessionInput);
  const id = getRollCallOpsId(session, targetDate);
  const createIfMissing = options?.createIfMissing ?? true;
  const forceRefresh = options?.forceRefresh ?? false;

  const { data: existingRow, error: existingError } = await supabase
    .from("lite_daily_ops")
    .select("id, items, computed_items, computed_at, date, type_sub")
    .eq("id", id)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to load roll call row ${id}: ${existingError.message}`);
  }

  const hasVerifiedRooms = countVerifiedRollCallRooms(existingRow?.items) > 0;
  if (existingRow && (!forceRefresh || hasVerifiedRooms)) {
    return existingRow;
  }

  const isPastDate = targetDate < todayET();
  if (!existingRow && isPastDate && !createIfMissing) {
    return null;
  }

  if (forceRefresh && hasVerifiedRooms) {
    return existingRow;
  }

  if (!existingRow && !createIfMissing) {
    return null;
  }

  const computedItems = await buildRollCallSnapshot(supabase, locationId, targetDate, session);
  const payload = {
    id,
    location_id: locationId,
    type: "roll_call",
    type_sub: session,
    date: targetDate,
    computed_items: computedItems,
    computed_at: new Date().toISOString(),
    items: existingRow?.items || {},
  };

  const { data: savedRow, error: saveError } = await supabase
    .from("lite_daily_ops")
    .upsert(payload, { onConflict: "id", ignoreDuplicates: false })
    .select("id, items, computed_items, computed_at, date, type_sub")
    .maybeSingle();

  if (saveError) {
    throw new Error(`Failed to save roll call row ${id}: ${saveError.message}`);
  }

  return savedRow || payload;
}

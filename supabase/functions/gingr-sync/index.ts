// ============================================================================
// Gingr Sync Edge Function — K9 Operations Lite
// Fetches data from Gingr API and upserts into Supabase tables
// Supports: full sync, incremental sync, single-entity sync
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  addDaysStr,
} from "../_shared/scheduling-matrix.ts";
import {
  buildIconIdentityKey,
  upsertAnimalIconsFromGingr,
} from "../_shared/gingr-icons.ts";
import {
  DEFAULT_PLAYGROUP_ASSIGNMENT_COLUMNS,
  fetchPlaygroupAssignments,
  type PlaygroupAssignment,
} from "../_shared/playgroup-assignments.ts";
import {
  fetchFeedingRowsForAnimals,
  fetchMedicationRowsForAnimals,
} from "../_shared/gingr-operational-details.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SCHEDULING_FUTURE_SYNC_DAYS = 28;
const PRESENCE_SYNC_FRESH_MS = 5_000;
const PRESENCE_SYNC_SETTING_KEY = "presence_sync_config_v1";
const PRESENCE_WORKER_MAX_RUN_MS = 55_000;
const PRESENCE_ALLOWED_INTERVAL_SECONDS = [3, 5, 10, 15, 30];

const PRESENCE_SYNC_DEFAULT_CONFIG = {
  enabled: true,
  normalIntervalSeconds: 5,
  offHoursIntervalSeconds: 30,
  businessHoursEnabled: true,
  businessHoursStart: "06:30",
  businessHoursEnd: "19:30",
  peakEnabled: false,
  peakIntervalSeconds: 3,
  peakWindows: [
    { start: "07:00", end: "09:30" },
    { start: "16:00", end: "18:30" },
  ],
};

// ─── Eastern Time helper ─────────────────────────────────────────────────────
// Edge functions run in UTC. All date-sensitive operations must use ET.
function nowET(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
}
function dateStrET(d?: Date): string {
  const dt = d || nowET();
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function isAllowedPresenceInterval(value: any): value is number {
  return PRESENCE_ALLOWED_INTERVAL_SECONDS.includes(Number(value));
}

function normalizePresenceInterval(value: any, fallback: number) {
  const numeric = Number(value);
  return isAllowedPresenceInterval(numeric) ? numeric : fallback;
}

function isTimeValue(value: any) {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value);
}

function sanitizePresenceSyncConfig(value: any) {
  const source = value && typeof value === "object" ? value : {};
  const windows = Array.isArray(source.peakWindows) ? source.peakWindows : PRESENCE_SYNC_DEFAULT_CONFIG.peakWindows;
  return {
    enabled: source.enabled === false ? false : PRESENCE_SYNC_DEFAULT_CONFIG.enabled,
    normalIntervalSeconds: normalizePresenceInterval(
      source.normalIntervalSeconds,
      PRESENCE_SYNC_DEFAULT_CONFIG.normalIntervalSeconds,
    ),
    offHoursIntervalSeconds: normalizePresenceInterval(
      source.offHoursIntervalSeconds,
      PRESENCE_SYNC_DEFAULT_CONFIG.offHoursIntervalSeconds,
    ),
    businessHoursEnabled: source.businessHoursEnabled === false ? false : PRESENCE_SYNC_DEFAULT_CONFIG.businessHoursEnabled,
    businessHoursStart: isTimeValue(source.businessHoursStart) ? source.businessHoursStart : PRESENCE_SYNC_DEFAULT_CONFIG.businessHoursStart,
    businessHoursEnd: isTimeValue(source.businessHoursEnd) ? source.businessHoursEnd : PRESENCE_SYNC_DEFAULT_CONFIG.businessHoursEnd,
    peakEnabled: source.peakEnabled === true,
    peakIntervalSeconds: normalizePresenceInterval(
      source.peakIntervalSeconds,
      PRESENCE_SYNC_DEFAULT_CONFIG.peakIntervalSeconds,
    ),
    peakWindows: windows
      .map((window: any) => ({
        start: isTimeValue(window?.start) ? window.start : null,
        end: isTimeValue(window?.end) ? window.end : null,
      }))
      .filter((window: any) => window.start && window.end)
      .slice(0, 6),
  };
}

function minutesFromTime(value: string) {
  const [hours, minutes] = value.split(":").map((part) => Number(part));
  return (hours * 60) + minutes;
}

function minutesForDate(date: Date) {
  return (date.getHours() * 60) + date.getMinutes();
}

function isWithinMinuteWindow(currentMinutes: number, start: string, end: string) {
  const startMinutes = minutesFromTime(start);
  const endMinutes = minutesFromTime(end);
  if (startMinutes === endMinutes) return true;
  if (startMinutes < endMinutes) return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
}

function getEffectivePresenceCadence(config: any, date: Date = nowET()) {
  const sanitized = sanitizePresenceSyncConfig(config);
  if (!sanitized.enabled) {
    return { ...sanitized, active: false, mode: "disabled", intervalSeconds: sanitized.offHoursIntervalSeconds };
  }

  const currentMinutes = minutesForDate(date);
  const withinBusinessHours = !sanitized.businessHoursEnabled
    || isWithinMinuteWindow(currentMinutes, sanitized.businessHoursStart, sanitized.businessHoursEnd);
  if (!withinBusinessHours) {
    return { ...sanitized, active: true, mode: "off-hours", intervalSeconds: sanitized.offHoursIntervalSeconds };
  }

  const inPeakWindow = sanitized.peakEnabled
    && sanitized.peakWindows.some((window: any) => isWithinMinuteWindow(currentMinutes, window.start, window.end));

  return {
    ...sanitized,
    active: true,
    mode: inPeakWindow ? "peak" : "normal",
    intervalSeconds: inPeakWindow ? sanitized.peakIntervalSeconds : sanitized.normalIntervalSeconds,
  };
}

// ─── Gingr API helper ──────────────────────────────────────────────────────
async function gingrFetch(
  subdomain: string,
  endpoint: string,
  apiKey: string,
  method: "GET" | "POST" = "GET",
  body?: Record<string, string>
) {
  const url = `https://${subdomain}.gingrapp.com/api/v1/${endpoint}`;

  let resp: Response;
  if (method === "POST") {
    const params = new URLSearchParams();
    params.append("key", apiKey);
    if (body) {
      for (const [k, v] of Object.entries(body)) {
        params.append(k, v);
      }
    }
    resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
      body: params.toString(),
    });
  } else {
    const params = new URLSearchParams({ key: apiKey });
    if (body) {
      for (const [k, v] of Object.entries(body)) {
        params.append(k, v);
      }
    }
    const sep = url.includes("?") ? "&" : "?";
    resp = await fetch(`${url}${sep}${params.toString()}`);
  }

  if (!resp.ok) {
    throw new Error(`Gingr API error ${resp.status}: ${await resp.text()}`);
  }
  return resp.json();
}

// ─── Sync functions ────────────────────────────────────────────────────────

async function syncOwners(
  supabase: any,
  subdomain: string,
  apiKey: string,
  locationId: string
) {
  const result = await gingrFetch(subdomain, "owners", apiKey);
  const owners = result.data || [];

  if (owners.length === 0) return { synced: 0 };

  // Batch upsert in chunks of 500
  const chunkSize = 500;
  let total = 0;

  for (let i = 0; i < owners.length; i += chunkSize) {
    const chunk = owners.slice(i, i + chunkSize);
    const rows = chunk.map((o: any) => ({
      gingr_id: String(o.id),
      location_id: locationId,
      first_name: o.first_name?.trim() || null,
      last_name: o.last_name?.trim() || null,
      email: o.email || null,
      cell_phone: o.cell_phone || null,
      home_phone: o.home_phone || null,
      emergency_contact_name: o.emergency_contact_name || null,
      emergency_contact_phone: o.emergency_contact_phone || null,
      address_1: o.address_1 || null,
      address_2: o.address_2 || null,
      city: o.city || null,
      state: o.state || null,
      zip: o.zip || null,
      current_balance: o.current_balance ? parseFloat(o.current_balance) : 0,
      home_location: o.home_location || null,
      animal_names: o.animal_names || null,
      last_reservation: o.last_reservation || null,
      next_reservation: o.next_reservation || null,
      number_reservations: o.number_reservations ? parseInt(o.number_reservations) : 0,
      owner_created_at: o.owner_created_at_iso || o.created_at || null,
      source: o.source || null,
      opt_out_email: o.opt_out_email === "1",
      opt_out_sms: o.opt_out_sms === "1",
      opt_out_marketing_email: o.opt_out_marketing_email === "1",
      opt_out_marketing_sms: o.opt_out_marketing_sms === "1",
      raw_data: o,
      synced_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from("gingr_owners")
      .upsert(rows, { onConflict: "location_id,gingr_id" });

    if (error) throw new Error(`Owner upsert error: ${error.message}`);
    total += chunk.length;
  }

  return { synced: total };
}

async function syncAnimals(
  supabase: any,
  subdomain: string,
  apiKey: string,
  locationId: string
) {
  const result = await gingrFetch(subdomain, "animals", apiKey);
  const animals = result.data || [];

  // Also fetch breeds for name lookup
  const breedsResult = await gingrFetch(subdomain, "get_breeds", apiKey);
  const breedMap: Record<string, string> = {};
  if (Array.isArray(breedsResult)) {
    for (const b of breedsResult) {
      breedMap[b.value] = b.label;
    }
  }

  if (animals.length === 0) return { synced: 0 };

  const chunkSize = 500;
  let total = 0;

  for (let i = 0; i < animals.length; i += chunkSize) {
    const chunk = animals.slice(i, i + chunkSize);
    const rows = chunk.map((a: any) => ({
      gingr_id: String(a.id),
      location_id: locationId,
      owner_gingr_id: String(a.owner_id),
      name: a.first_name || null,
      breed_id: a.breed_id || null,
      breed_name: breedMap[a.breed_id] || null,
      species_id: a.species_id || null,
      gender: a.gender || null,
      fixed: a.fixed === "1",
      birthday: a.birthday ? parseInt(a.birthday) : null,
      weight: a.weight || null,
      image_url: a.image || null,
      vip: a.vip === "1",
      banned: a.banned === "1",
      medicines: a.medicines || null,
      allergies: a.allergies || null,
      notes: a.notes || null,
      grooming_notes: a.grooming_notes || null,
      next_immunization_expiration: a.next_immunization_expiration
        ? parseInt(a.next_immunization_expiration)
        : null,
      last_reservation: a.last_reservation || null,
      next_reservation: a.next_reservation || null,
      number_reservations: a.number_reservations ? parseInt(a.number_reservations) : 0,
      owner_first_name: a.owner_first_name || null,
      owner_last_name: a.owner_last_name || null,
      raw_data: a,
      synced_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from("gingr_animals")
      .upsert(rows, { onConflict: "location_id,gingr_id" });

    if (error) throw new Error(`Animal upsert error: ${error.message}`);
    total += chunk.length;
  }

  // Also sync breeds reference
  if (Array.isArray(breedsResult) && breedsResult.length > 0) {
    const breedRows = breedsResult.map((b: any) => ({
      gingr_id: String(b.value),
      location_id: locationId,
      name: b.label,
    }));
    for (let i = 0; i < breedRows.length; i += 500) {
      const chunk = breedRows.slice(i, i + 500);
      await supabase
        .from("gingr_breeds")
        .upsert(chunk, { onConflict: "location_id,gingr_id" });
    }
  }

  return { synced: total };
}

function mapReservationRow(r: any, locationId: string) {
  return {
    gingr_id: String(r.reservation_id),
    location_id: locationId,
    owner_gingr_id: r.owner?.id ? String(r.owner.id) : null,
    animal_gingr_id: r.animal?.id ? String(r.animal.id) : null,
    reservation_type_id: r.reservation_type?.id ? String(r.reservation_type.id) : null,
    reservation_type_name: r.reservation_type?.type || null,
    start_date: r.start_date || null,
    end_date: r.end_date || null,
    check_in_date: r.check_in_date || null,
    check_out_date: r.check_out_date || null,
    cancelled_date: r.cancelled_date || null,
    confirmed_date: r.confirmed_date || null,
    created_date: r.created_date || null,
    standing_reservation: r.standing_reservation || false,
    owner_first_name: r.owner?.first_name?.trim() || null,
    owner_last_name: r.owner?.last_name?.trim() || null,
    owner_email: r.owner?.email || null,
    animal_name: r.animal?.name || null,
    animal_breed: r.animal?.breed || null,
    notes_reservation: r.notes?.reservation_notes || null,
    notes_animal: r.notes?.animal_notes || null,
    notes_owner: r.notes?.owner_notes || null,
    services: r.services || null,
    deposit: r.deposit || null,
    transaction: r.transaction || null,
    raw_data: r,
    synced_at: new Date().toISOString(),
  };
}

function normalizeText(value: any): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalizeIso(value: any): string | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value * 1000).toISOString();
  }
  const text = String(value).trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) {
    const asNumber = Number(text);
    if (Number.isFinite(asNumber)) return new Date(asNumber * 1000).toISOString();
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function firstNormalizedIso(...values: any[]): string | null {
  for (const value of values) {
    const iso = normalizeIso(value);
    if (iso) return iso;
  }
  return null;
}

function classifyPresenceType(typeName: any): string {
  const type = String(typeName || "").toLowerCase();
  if (type.includes("evaluation") || type.includes("eval") || type.includes("assessment")) return "evaluation";
  if (type.includes("day boarding") || type.includes("dayboarding")) return "dayboarding";
  if (type.includes("daycare") || type.includes("day care")) return "daycare";
  if (
    type.includes("boarding") ||
    type.includes("lodging") ||
    type.includes("overnight") ||
    type.includes("suite")
  ) return "boarding";
  if (type.includes("groom") || type.includes("bath")) return "grooming";
  if (type.includes("tour")) return "tour";
  return "other";
}

function getBohLists(bohData: any) {
  const root = bohData?.data || bohData || {};
  return {
    checkingIn: Array.isArray(root.checking_in) ? root.checking_in : [],
    checkingOut: Array.isArray(root.checking_out) ? root.checking_out : [],
  };
}

function buildBohLookup(bohData: any) {
  const { checkingIn, checkingOut } = getBohLists(bohData);
  const byReservation = new Map<string, any>();
  const byAnimal = new Map<string, any>();

  for (const entry of [...checkingOut, ...checkingIn]) {
    const reservationId = normalizeText(entry.reservation_id || entry.id);
    const animalId = normalizeText(entry.animal_id);
    if (reservationId) byReservation.set(reservationId, entry);
    if (animalId) byAnimal.set(animalId, entry);
  }

  return { byReservation, byAnimal };
}

function parseOccupancyAnimalEntry(entry: string) {
  const text = normalizeText(entry);
  if (!text) return null;
  const match = text.match(/^(.+?)\s*\((.+?)\)\s*$/);
  const animalName = normalizeText(match ? match[1] : text);
  const ownerName = normalizeText(match ? match[2] : "");
  const ownerParts = ownerName ? ownerName.split(/\s+/).filter(Boolean) : [];
  const ownerLastName = ownerParts.length > 0 ? ownerParts[ownerParts.length - 1] : null;
  return { animalName, ownerName, ownerLastName };
}

function normalizeLookupKey(...values: any[]) {
  return values.map((value) => String(value || "").trim().toLowerCase()).join("|");
}

async function loadPresenceRoomAssignments(supabase: any, locationId: string, checkedInReservations: any[]) {
  const animalIds = [...new Set(
    checkedInReservations
      .map((reservation: any) => normalizeText(reservation?.animal?.id))
      .filter(Boolean),
  )] as string[];

  const lookup = {
    byReservation: new Map<string, any>(),
    byAnimal: new Map<string, any>(),
    occupancyByDogOwner: new Map<string, any>(),
    occupancyByDog: new Map<string, any>(),
  };

  if (animalIds.length > 0) {
    const { data: reservationRows, error } = await supabase
      .from("gingr_reservations")
      .select("gingr_id, animal_gingr_id, animal_name, owner_last_name, room_assignment")
      .eq("location_id", locationId)
      .in("animal_gingr_id", animalIds);

    if (error) throw new Error(`presence room assignment query error: ${error.message}`);

    for (const row of reservationRows || []) {
      const roomName = normalizeText(row.room_assignment);
      if (!roomName) continue;
      const assignment = {
        room_name: roomName,
        area_name: null,
        source: "gingr_reservations.room_assignment",
      };
      const reservationId = normalizeText(row.gingr_id);
      const animalId = normalizeText(row.animal_gingr_id);
      if (reservationId) lookup.byReservation.set(reservationId, assignment);
      if (animalId && !lookup.byAnimal.has(animalId)) lookup.byAnimal.set(animalId, assignment);
    }
  }

  const todayET = dateStrET();
  const { data: occupancyRows, error: occupancyError } = await supabase
    .from("gingr_room_occupancy")
    .select("run_name, area_name, animal_names")
    .eq("location_id", locationId)
    .eq("occupancy_date", todayET)
    .eq("occupied", true);

  if (occupancyError) throw new Error(`presence room occupancy query error: ${occupancyError.message}`);

  const dogOnlyCandidates = new Map<string, any[]>();
  for (const row of occupancyRows || []) {
    const roomName = normalizeText(row.run_name);
    if (!roomName) continue;
    const areaName = normalizeText(row.area_name);
    const entries = String(row.animal_names || "")
      .split("<br>")
      .map((entry) => entry.trim())
      .filter(Boolean);

    for (const entry of entries) {
      const parsed = parseOccupancyAnimalEntry(entry);
      if (!parsed?.animalName) continue;
      const assignment = {
        room_name: roomName,
        area_name: areaName,
        source: "gingr_room_occupancy",
      };
      const dogKey = normalizeLookupKey(parsed.animalName);
      const dogOwnerKey = normalizeLookupKey(parsed.animalName, parsed.ownerLastName);
      if (parsed.ownerLastName) lookup.occupancyByDogOwner.set(dogOwnerKey, assignment);
      dogOnlyCandidates.set(dogKey, [...(dogOnlyCandidates.get(dogKey) || []), assignment]);
    }
  }

  for (const [dogKey, candidates] of dogOnlyCandidates.entries()) {
    const uniqueRooms = [...new Set(candidates.map((candidate) => candidate.room_name))];
    if (uniqueRooms.length === 1) lookup.occupancyByDog.set(dogKey, candidates[0]);
  }

  return lookup;
}

function resolvePresenceRoomAssignment(roomLookup: any, {
  reservationId,
  animalId,
  animalName,
  ownerLastName,
}: {
  reservationId?: string | null;
  animalId?: string | null;
  animalName?: string | null;
  ownerLastName?: string | null;
}) {
  if (!roomLookup) return null;
  if (reservationId && roomLookup.byReservation?.has(reservationId)) {
    return roomLookup.byReservation.get(reservationId);
  }
  if (animalId && roomLookup.byAnimal?.has(animalId)) {
    return roomLookup.byAnimal.get(animalId);
  }
  if (animalName && ownerLastName) {
    const ownerKey = normalizeLookupKey(animalName, ownerLastName);
    if (roomLookup.occupancyByDogOwner?.has(ownerKey)) return roomLookup.occupancyByDogOwner.get(ownerKey);
  }
  if (animalName) {
    const dogKey = normalizeLookupKey(animalName);
    if (roomLookup.occupancyByDog?.has(dogKey)) return roomLookup.occupancyByDog.get(dogKey);
  }
  return null;
}

function pickPrimaryPresenceReservation(rows: any[]) {
  return [...rows].sort((a, b) => {
    const aCheckIn = normalizeIso(a.check_in_date);
    const bCheckIn = normalizeIso(b.check_in_date);
    if (aCheckIn && !bCheckIn) return -1;
    if (!aCheckIn && bCheckIn) return 1;
    const aStart = normalizeIso(a.start_date) || "";
    const bStart = normalizeIso(b.start_date) || "";
    return bStart.localeCompare(aStart);
  })[0];
}

function buildFacilityPresenceRows(checkedInReservations: any[], bohData: any, source: string, roomLookup: any = null) {
  const byAnimal = new Map<string, any[]>();
  for (const reservation of checkedInReservations) {
    const animalId = normalizeText(reservation?.animal?.id);
    if (!animalId) continue;
    if (!byAnimal.has(animalId)) byAnimal.set(animalId, []);
    byAnimal.get(animalId)!.push(reservation);
  }

  const bohLookup = buildBohLookup(bohData);
  const rows: any[] = [];

  for (const [animalId, reservations] of byAnimal.entries()) {
    const primary = pickPrimaryPresenceReservation(reservations);
    const reservationIds = reservations
      .map((reservation) => normalizeText(reservation?.reservation_id))
      .filter(Boolean) as string[];
    const primaryReservationId = normalizeText(primary?.reservation_id) || reservationIds[0] || null;
    const typeName = normalizeText(primary?.reservation_type?.type);
    const presenceType = classifyPresenceType(typeName);
    const checkInDate = normalizeIso(primary?.check_in_date);
    const startDate = normalizeIso(primary?.start_date);
    const endDate = normalizeIso(primary?.end_date);
    const bohEntry = (primaryReservationId && bohLookup.byReservation.get(primaryReservationId)) || bohLookup.byAnimal.get(animalId) || null;
    const owner = primary?.owner || {};
    const animal = primary?.animal || {};
    const storedRoom = resolvePresenceRoomAssignment(roomLookup, {
      reservationId: primaryReservationId,
      animalId,
      animalName: normalizeText(animal.name),
      ownerLastName: normalizeText(owner.last_name),
    });
    const roomName = normalizeText(
      bohEntry?.run_name
        || bohEntry?.room_name
        || bohEntry?.room
        || storedRoom?.room_name
        || primary?.room_assignment
        || primary?.room_name,
    );
    const areaName = normalizeText(bohEntry?.area_name || bohEntry?.area || storedRoom?.area_name || primary?.area_name);
    const presenceSessionKey = [
      animalId,
      primaryReservationId || "reservation-unknown",
      checkInDate || startDate || dateStrET(),
    ].join(":");

    rows.push({
      animal_gingr_id: animalId,
      reservation_gingr_id: primaryReservationId,
      reservation_gingr_ids: [...new Set(reservationIds)],
      owner_gingr_id: normalizeText(owner.id),
      owner_first_name: normalizeText(owner.first_name),
      owner_last_name: normalizeText(owner.last_name),
      animal_name: normalizeText(animal.name),
      animal_breed: normalizeText(animal.breed),
      reservation_type_name: typeName,
      presence_type: presenceType,
      room_name: roomName,
      area_name: areaName,
      start_date: startDate,
      end_date: endDate,
      check_in_date: checkInDate,
      scheduled_check_out_date: endDate,
      presence_session_key: presenceSessionKey,
      source,
      source_hash: [
        primaryReservationId || "",
        checkInDate || "",
        endDate || "",
        reservationIds.join("+"),
        roomName || "",
      ].join("|"),
      source_payload: {
        primary_reservation: primary,
        reservations,
        boh: bohEntry,
      },
      duplicate_reservation_count: reservations.length,
    });
  }

  return rows;
}

async function upsertBohCacheFromPayload(supabase: any, locationId: string, bohData: any) {
  const { checkingIn, checkingOut } = getBohLists(bohData);
  const nowIso = new Date().toISOString();
  const rows: any[] = [];

  for (const entry of checkingIn) {
    rows.push({
      location_id: locationId,
      gingr_reservation_id: entry.reservation_id || entry.id ? Number(entry.reservation_id || entry.id) : null,
      animal_name: entry.animal_name || entry.a_first || null,
      animal_id: entry.animal_id ? Number(entry.animal_id) : null,
      owner_name: entry.owner_name || [entry.o_first, entry.o_last].filter(Boolean).join(" ") || null,
      owner_id: entry.owner_id ? Number(entry.owner_id) : null,
      reservation_type_name: entry.reservation_type_name || entry.reservation_type || entry.type || null,
      status: "checking_in",
      check_in_time: firstNormalizedIso(entry.check_in_time, entry.start_date),
      check_out_time: firstNormalizedIso(entry.check_out_time, entry.end_date),
      room_name: entry.run_name || entry.room_name || entry.room || null,
      area_name: entry.area_name || entry.area || null,
      raw_data: entry,
      synced_at: nowIso,
    });
  }

  for (const entry of checkingOut) {
    rows.push({
      location_id: locationId,
      gingr_reservation_id: entry.reservation_id || entry.id ? Number(entry.reservation_id || entry.id) : null,
      animal_name: entry.animal_name || entry.a_first || null,
      animal_id: entry.animal_id ? Number(entry.animal_id) : null,
      owner_name: entry.owner_name || [entry.o_first, entry.o_last].filter(Boolean).join(" ") || null,
      owner_id: entry.owner_id ? Number(entry.owner_id) : null,
      reservation_type_name: entry.reservation_type_name || entry.reservation_type || entry.type || null,
      status: "checking_out",
      check_in_time: firstNormalizedIso(entry.check_in_time, entry.start_date),
      check_out_time: firstNormalizedIso(entry.check_out_time, entry.end_date),
      room_name: entry.run_name || entry.room_name || entry.room || null,
      area_name: entry.area_name || entry.area || null,
      raw_data: entry,
      synced_at: nowIso,
    });
  }

  let upserted = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await supabase
      .from("gingr_back_of_house")
      .upsert(chunk, { onConflict: "location_id,gingr_reservation_id" });
    if (error) throw new Error(`BOH cache upsert error: ${error.message}`);
    upserted += chunk.length;
  }

  const staleCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: deleted } = await supabase
    .from("gingr_back_of_house")
    .delete()
    .eq("location_id", locationId)
    .lt("synced_at", staleCutoff)
    .select("id");

  return {
    checking_in_count: checkingIn.length,
    checking_out_count: checkingOut.length,
    upserted,
    stale_deleted: deleted?.length || 0,
  };
}

async function markCheckedOutReservations(
  supabase: any,
  locationId: string,
  checkedInReservations: any[],
) {
  const { data: supaCheckedIn } = await supabase
    .from("gingr_reservations")
    .select("gingr_id")
    .eq("location_id", locationId)
    .not("check_in_date", "is", null)
    .is("check_out_date", null)
    .is("cancelled_date", null);

  const gingrCheckedInIds = new Set(
    checkedInReservations.map((reservation: any) => String(reservation.reservation_id))
  );
  const staleIds = (supaCheckedIn || [])
    .filter((reservation: any) => !gingrCheckedInIds.has(reservation.gingr_id))
    .map((reservation: any) => reservation.gingr_id);

  const isLikelyApiError =
    checkedInReservations.length === 0 && (supaCheckedIn || []).length > 20;

  if (staleIds.length === 0 || isLikelyApiError) {
    return { checked_out_count: 0, skipped_mass_checkout_guard: isLikelyApiError };
  }

  const nowIso = new Date().toISOString();
  for (let i = 0; i < staleIds.length; i += 100) {
    const chunk = staleIds.slice(i, i + 100);
    const { error } = await supabase
      .from("gingr_reservations")
      .update({ check_out_date: nowIso, synced_at: nowIso })
      .eq("location_id", locationId)
      .in("gingr_id", chunk);
    if (error) throw new Error(`Failed to mark checked-out reservations: ${error.message}`);
  }

  return { checked_out_count: staleIds.length, skipped_mass_checkout_guard: false };
}

async function syncFacilityPresence({
  supabase,
  subdomain,
  apiKey,
  gingrLocationId,
  locationId,
  source = "gingr-sync:presence-sync",
  minIntervalMs = PRESENCE_SYNC_FRESH_MS,
}: {
  supabase: any;
  subdomain: string;
  apiKey: string;
  gingrLocationId: string;
  locationId: string;
  source?: string;
  minIntervalMs?: number;
}) {
  const startTime = Date.now();
  const errors: any[] = [];
  const ownerToken = `${source}:${locationId}:${crypto.randomUUID()}`;

  const { data: claimResult, error: claimError } = await supabase.rpc("claim_facility_presence_sync", {
    p_location_id: locationId,
    p_owner_token: ownerToken,
    p_lock_ttl_seconds: 25,
    p_min_interval_ms: Math.max(1000, Math.min(60000, Number(minIntervalMs) || PRESENCE_SYNC_FRESH_MS)),
    p_metadata: {
      source,
      requested_at: new Date().toISOString(),
    },
  });

  if (claimError) {
    throw new Error(`Presence sync claim error: ${claimError.message}`);
  }

  if (!claimResult?.claimed) {
    const { data: snapshot } = await supabase.rpc("facility_presence_snapshot", {
      p_location_id: locationId,
    });

    return {
      success: true,
      sync_type: "presence-sync",
      location_id: locationId,
      skipped_sync: true,
      skipped_reason: claimResult?.reason || "not_claimed",
      claim: claimResult,
      snapshot,
      duration_ms: Date.now() - startTime,
    };
  }

  try {
    let todayResResult = { synced: 0 };
    try {
      todayResResult = await syncTodayReservations(supabase, subdomain, apiKey, locationId);
    } catch (err: any) {
      errors.push({ stage: "today-reservations", message: err.message });
    }

    const [checkedInResult, bohResult] = await Promise.all([
      gingrFetch(subdomain, "reservations", apiKey, "POST", { checked_in: "true" }),
      gingrFetch(subdomain, "back_of_house", apiKey, "GET", {
        location_id: String(gingrLocationId || "1"),
        full_day: "true",
        include_daycare: "true",
      }).catch((err: any) => {
        errors.push({ stage: "back-of-house", message: err.message });
        return null;
      }),
    ]);

    const checkedIn = Object.values(checkedInResult.data || {}) as any[];

    if (checkedIn.length > 0) {
      const rows = checkedIn.map((reservation: any) => mapReservationRow(reservation, locationId));
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const { error } = await supabase
          .from("gingr_reservations")
          .upsert(chunk, { onConflict: "location_id,gingr_id" });
        if (error) throw new Error(`Presence sync reservation upsert error: ${error.message}`);
      }
    }

    let checkoutReconcile = { checked_out_count: 0, skipped_mass_checkout_guard: false };
    try {
      checkoutReconcile = await markCheckedOutReservations(supabase, locationId, checkedIn);
    } catch (err: any) {
      errors.push({ stage: "checkout-reconcile", message: err.message });
    }

    let bohCache = { checking_in_count: 0, checking_out_count: 0, upserted: 0, stale_deleted: 0 };
    if (bohResult) {
      try {
        bohCache = await upsertBohCacheFromPayload(supabase, locationId, bohResult);
      } catch (err: any) {
        errors.push({ stage: "boh-cache", message: err.message });
      }
    }

    let roomResult = { assigned: 0, bohDogs: 0 };
    if (bohResult) {
      try {
        roomResult = await persistBohRoomAssignments(supabase, subdomain, apiKey, gingrLocationId || "1", locationId, bohResult);
      } catch (err: any) {
        errors.push({ stage: "room-assignments", message: err.message });
      }
    }

    let roomLookup = null;
    try {
      roomLookup = await loadPresenceRoomAssignments(supabase, locationId, checkedIn);
    } catch (err: any) {
      errors.push({ stage: "presence-room-lookup", message: err.message });
    }

    const presenceRows = buildFacilityPresenceRows(checkedIn, bohResult, source, roomLookup);
    const duplicateAnimals = presenceRows.filter((row) => row.duplicate_reservation_count > 1).length;
    const { data: reconcileResult, error: reconcileError } = await supabase.rpc("reconcile_facility_presence", {
      p_location_id: locationId,
      p_current_rows: presenceRows,
      p_source: source,
      p_source_checked_in_count: checkedIn.length,
      p_metadata: {
        today_reservations_synced: todayResResult.synced,
        checked_out_count: checkoutReconcile.checked_out_count,
        skipped_mass_checkout_guard: checkoutReconcile.skipped_mass_checkout_guard,
        boh_cache: bohCache,
        rooms_assigned: roomResult.assigned,
        boh_dogs_in_house: roomResult.bohDogs,
        duplicate_animals: duplicateAnimals,
        errors,
        claim: claimResult,
      },
    });

    if (reconcileError) {
      throw new Error(`Presence reconcile error: ${reconcileError.message}`);
    }

    return {
      success: true,
      sync_type: "presence-sync",
      location_id: locationId,
      today_reservations_synced: todayResResult.synced,
      checked_in_count: checkedIn.length,
      checked_out_count: checkoutReconcile.checked_out_count,
      pending_arrivals_count: bohCache.checking_in_count,
      boh_cache: bohCache,
      rooms_assigned: roomResult.assigned,
      boh_dogs_in_house: roomResult.bohDogs,
      duplicate_animals: duplicateAnimals,
      errors,
      presence: reconcileResult,
      claim: claimResult,
      duration_ms: Date.now() - startTime,
    };
  } finally {
    try {
      await supabase.rpc("release_facility_presence_sync", {
        p_location_id: locationId,
        p_owner_token: ownerToken,
        p_metadata: {
          source,
          released_at: new Date().toISOString(),
          duration_ms: Date.now() - startTime,
        },
      });
    } catch (releaseErr: any) {
      console.error("Presence sync release error:", releaseErr?.message || releaseErr);
    }
  }
}

async function loadPresenceSyncConfig(supabase: any, locationId: string) {
  const { data, error } = await supabase
    .from("lite_settings")
    .select("setting_value")
    .eq("location_id", locationId)
    .eq("setting_key", PRESENCE_SYNC_SETTING_KEY)
    .maybeSingle();

  if (error) {
    console.error("Presence config load error:", error.message);
  }

  return sanitizePresenceSyncConfig(data?.setting_value);
}

async function runPresenceWorker({
  supabase,
  subdomain,
  apiKey,
  gingrLocationId,
  locationId,
  maxRunMs = PRESENCE_WORKER_MAX_RUN_MS,
}: {
  supabase: any;
  subdomain: string;
  apiKey: string;
  gingrLocationId: string;
  locationId: string;
  maxRunMs?: number;
}) {
  const workerStartedAt = Date.now();
  const safeMaxRunMs = Math.max(5_000, Math.min(PRESENCE_WORKER_MAX_RUN_MS, Number(maxRunMs) || PRESENCE_WORKER_MAX_RUN_MS));
  const cycles: any[] = [];
  let lastCadence: any = null;

  while (Date.now() - workerStartedAt < safeMaxRunMs - 1_000) {
    const cycleStartedAt = Date.now();
    const config = await loadPresenceSyncConfig(supabase, locationId);
    const cadence = getEffectivePresenceCadence(config);
    lastCadence = cadence;

    if (!cadence.active) {
      cycles.push({
        started_at: new Date(cycleStartedAt).toISOString(),
        mode: cadence.mode,
        interval_seconds: cadence.intervalSeconds,
        skipped: true,
      });
      break;
    }

    try {
      const result = await syncFacilityPresence({
        supabase,
        subdomain,
        apiKey,
        gingrLocationId,
        locationId,
        source: "gingr-sync:presence-worker",
        minIntervalMs: cadence.intervalSeconds * 1000,
      });

      cycles.push({
        started_at: new Date(cycleStartedAt).toISOString(),
        mode: cadence.mode,
        interval_seconds: cadence.intervalSeconds,
        skipped: Boolean(result?.skipped_sync),
        skipped_reason: result?.skipped_reason || null,
        checked_in_count: result?.checked_in_count ?? null,
        arrivals_count: result?.presence?.arrivals_count ?? null,
        departures_count: result?.presence?.departures_count ?? null,
        duration_ms: Date.now() - cycleStartedAt,
      });
    } catch (err: any) {
      cycles.push({
        started_at: new Date(cycleStartedAt).toISOString(),
        mode: cadence.mode,
        interval_seconds: cadence.intervalSeconds,
        success: false,
        error: err?.message || "presence worker cycle failed",
        duration_ms: Date.now() - cycleStartedAt,
      });
    }

    const intervalMs = Math.max(1000, cadence.intervalSeconds * 1000);
    const nextCycleAt = cycleStartedAt + intervalMs;
    const sleepMs = nextCycleAt - Date.now();
    if (Date.now() + Math.max(0, sleepMs) - workerStartedAt >= safeMaxRunMs - 1_000) break;
    await sleep(sleepMs);
  }

  const failures = cycles.filter((cycle) => cycle.success === false);
  return {
    success: failures.length === 0,
    sync_type: "presence-worker",
    location_id: locationId,
    started_at: new Date(workerStartedAt).toISOString(),
    completed_at: new Date().toISOString(),
    duration_ms: Date.now() - workerStartedAt,
    cycles,
    cycle_count: cycles.length,
    failure_count: failures.length,
    effective_cadence: lastCadence,
  };
}

async function syncReservations(
  supabase: any,
  subdomain: string,
  apiKey: string,
  locationId: string,
  startDate?: string,
  endDate?: string
) {
  const now = new Date();
  const end = endDate || now.toISOString().split("T")[0];

  // Resumable: check where we left off from sync state
  let start = startDate || "2015-01-01";
  if (!startDate) {
    try {
      const { data: syncState } = await supabase
        .from("gingr_sync_state")
        .select("*")
        .eq("location_id", locationId)
        .eq("entity_type", "reservations")
        .limit(1);
      const cursor = syncState?.[0]?.backfill_cursor;
      if (cursor && cursor > "2015-01-01") {
        start = cursor;
      }
    } catch (_) {
      // backfill_cursor column may not exist yet — start from beginning
    }
  }

  // If we've already backfilled to today, just sync recent 90 days for updates
  const startD = new Date(start);
  const endD = new Date(end);
  const daysLeft = Math.round((endD.getTime() - startD.getTime()) / 86400000);
  const isBackfillComplete = daysLeft <= 90;

  let total = 0;
  let chunksProcessed = 0;
  let lastChunkEnd = start;
  const errors: string[] = [];

  // ── Backfill: chunked historical fetch (only when backfill is in progress) ─
  if (!isBackfillComplete) {
    const chunks = getDateChunks(start, end, 30);
    const MAX_CHUNKS_PER_RUN = 3; // keep low to leave room for parallel queries + post-sync

    for (const [chunkStart, chunkEnd] of chunks) {
      if (chunksProcessed >= MAX_CHUNKS_PER_RUN) break;

      try {
        const result = await gingrFetch(subdomain, "reservations", apiKey, "POST", {
          checked_in: "false",
          start_date: chunkStart,
          end_date: chunkEnd,
        });

        const resMap = result.data || {};
        const reservations = Object.values(resMap) as any[];
        lastChunkEnd = chunkEnd;
        chunksProcessed++;

        if (reservations.length === 0) continue;

        const batchSize = 500;
        for (let i = 0; i < reservations.length; i += batchSize) {
          const batch = reservations.slice(i, i + batchSize);
          const rows = batch.map((r: any) => mapReservationRow(r, locationId));

          const { error } = await supabase
            .from("gingr_reservations")
            .upsert(rows, { onConflict: "location_id,gingr_id" });

          if (error) throw new Error(`Reservation upsert error: ${error.message}`);
          total += batch.length;
        }
      } catch (chunkErr: any) {
        errors.push(`${chunkStart}-${chunkEnd}: ${chunkErr.message}`);
        lastChunkEnd = chunkEnd;
        chunksProcessed++;
      }
    }

    // Save backfill cursor so next run picks up where we left off
    try {
      await supabase.from("gingr_sync_state").upsert(
        { location_id: locationId, entity_type: "reservations", backfill_cursor: lastChunkEnd },
        { onConflict: "location_id,entity_type" }
      );
    } catch (_) {
      // backfill_cursor column may not exist — non-fatal
    }
  } else {
    // Backfill done — keep cursor at today so next run stays in "complete" mode
    try {
      await supabase.from("gingr_sync_state").upsert(
        { location_id: locationId, entity_type: "reservations", backfill_cursor: end },
        { onConflict: "location_id,entity_type" }
      );
    } catch (_) {}
  }

  // ── Parallel Gingr API fetches ──────────────────────────────────────────
  // Fire checked-in and today's all-states queries in parallel. Future
  // sold-room data is fetched day-by-day below because Gingr's exact-date
  // query shape is materially more complete than the broader future range
  // query for scheduling use cases.
  const tomorrow = new Date(now.getTime() + 1 * 86400000).toISOString().split("T")[0];
  const futureEndDate = new Date(now.getTime() + SCHEDULING_FUTURE_SYNC_DAYS * 86400000).toISOString().split("T")[0];
  const recentDate = dateStrET();

  const [checkedInResult, allResult] = await Promise.all([
    gingrFetch(subdomain, "reservations", apiKey, "POST", { checked_in: "true" })
      .catch((e: any) => { console.error("checked-in fetch error:", e.message); return { data: {} }; }),
    gingrFetch(subdomain, "reservations", apiKey, "POST", { start_date: recentDate, end_date: recentDate })
      .catch((e: any) => { console.error("all-states fetch error:", e.message); return { data: {} }; }),
  ]);

  // ── Upsert checked-in reservations ────────────────────────────────────
  const checkedInMap = checkedInResult.data || {};
  const checkedIn = Object.values(checkedInMap) as any[];

  if (checkedIn.length > 0) {
    const rows = checkedIn.map((r: any) => mapReservationRow(r, locationId));
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error } = await supabase
        .from("gingr_reservations")
        .upsert(chunk, { onConflict: "location_id,gingr_id" });
      if (error) console.error("syncReservations: failed to upsert checked-in:", error.message);
    }
    total += checkedIn.length;
  }

  // ── TV-007: Reconcile — mark checked-out dogs ──────────────────────────
  // Dogs that Supabase thinks are checked in but Gingr no longer reports
  // have been checked out. Stamp check_out_date so the TV picks it up.
  try {
    const { data: supaCheckedIn } = await supabase
      .from("gingr_reservations")
      .select("gingr_id")
      .eq("location_id", locationId)
      .not("check_in_date", "is", null)
      .is("check_out_date", null)
      .is("cancelled_date", null);

    const gingrCheckedInIds = new Set(
      checkedIn.map((r: any) => String(r.reservation_id))
    );
    const staleIds = (supaCheckedIn || [])
      .filter((r: any) => !gingrCheckedInIds.has(r.gingr_id))
      .map((r: any) => r.gingr_id);

    // Safety: if Gingr returned 0 but Supabase has 20+, likely an API error
    // — do not mass-checkout every dog
    const isLikelyApiError =
      checkedIn.length === 0 && (supaCheckedIn || []).length > 20;

    if (staleIds.length > 0 && !isLikelyApiError) {
      const nowIso = new Date().toISOString();
      for (let i = 0; i < staleIds.length; i += 100) {
        const chunk = staleIds.slice(i, i + 100);
        const { error } = await supabase
          .from("gingr_reservations")
          .update({ check_out_date: nowIso, synced_at: nowIso })
          .eq("location_id", locationId)
          .in("gingr_id", chunk);
        if (error) console.error("syncReservations: failed to mark checkout:", error.message);
      }
    }
  } catch (_) {
    // Non-fatal — reconciliation is best-effort
  }

  // ── Upsert all-states (cancellations) for today ───────────────────────
  try {
    const allMap = allResult.data || {};
    const allReservations = Object.values(allMap) as any[];

    if (allReservations.length > 0) {
      const rows = allReservations.map((r: any) => mapReservationRow(r, locationId));
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        await supabase
          .from("gingr_reservations")
          .upsert(chunk, { onConflict: "location_id,gingr_id" });
      }
      console.log(`Re-synced ${allReservations.length} reservations (all states) for ${recentDate}`);
    }
  } catch (allErr: any) {
    console.error("All-states reservation re-sync error:", allErr.message);
  }

  // ── Upsert future reservations (next scheduling horizon) ─────────────
  let futureSynced = 0;
  try {
    const futureDates = enumerateDateRange(tomorrow, futureEndDate);
    const futureResults = await Promise.all(
      futureDates.map((futureDate) =>
        gingrFetch(subdomain, "reservations", apiKey, "POST", {
          start_date: futureDate,
          end_date: futureDate,
        }).catch((e: any) => {
          console.error(`future day fetch error (${futureDate}):`, e.message);
          return { data: {} };
        }),
      ),
    );

    const futureById = new Map<string, any>();
    for (const result of futureResults) {
      const futureResMap = result.data || {};
      for (const reservation of Object.values(futureResMap) as any[]) {
        if (!reservation || typeof reservation !== "object") continue;
        const reservationId = String(reservation.reservation_id || "");
        if (!reservationId) continue;
        futureById.set(reservationId, reservation);
      }
    }

    const futureReservations = Array.from(futureById.values()).filter(
      (r) => typeof r === "object",
    );

    if (futureReservations.length > 0) {
      const rows = futureReservations.map((r: any) => mapReservationRow(r, locationId));
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const { error } = await supabase
          .from("gingr_reservations")
          .upsert(chunk, { onConflict: "location_id,gingr_id" });
        if (error) console.error("syncReservations: failed to upsert future:", error.message);
      }
      futureSynced = futureReservations.length;
      total += futureSynced;
    }
    console.log(`Future reservations synced: ${futureSynced} (${tomorrow} to ${futureEndDate})`);
  } catch (futureErr: any) {
    console.error("Future reservation sync error:", futureErr.message);
  }

  return {
    synced: total,
    backfill_complete: isBackfillComplete,
    backfill_cursor: isBackfillComplete ? null : lastChunkEnd,
    chunks_processed: chunksProcessed,
    chunks_remaining: 0,
    chunk_errors: errors.length > 0 ? errors : undefined,
  };
}

async function syncTodayReservations(
  supabase: any,
  subdomain: string,
  apiKey: string,
  locationId: string
): Promise<{ synced: number }> {
  const today = dateStrET();

  const result = await gingrFetch(subdomain, "reservations", apiKey, "POST", {
    start_date: today,
    end_date: today,
  });

  const resMap = result.data || {};
  const reservations = Object.values(resMap);
  if (reservations.length === 0) return { synced: 0 };

  const rows = reservations.map((r: any) => mapReservationRow(r, locationId));

  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await supabase
      .from("gingr_reservations")
      .upsert(chunk, { onConflict: "location_id,gingr_id" });
    if (error) {
      console.error("syncTodayReservations upsert error:", error.message);
    }
  }

  console.log(`Today reservations sync: ${reservations.length} upserted for ${today}`);
  return { synced: reservations.length };
}

async function syncReservationTypes(
  supabase: any,
  subdomain: string,
  apiKey: string,
  locationId: string
) {
  const result = await gingrFetch(subdomain, "reservation_types", apiKey);
  const types = result.data || [];

  if (types.length === 0) return { synced: 0 };

  const rows = types.map((t: any) => {
    const typeLower = (t.type || t.name || "").toLowerCase();
    return {
      gingr_id: String(t.id),
      location_id: locationId,
      name: t.name || t.reservation_type || t.type,
      type_label: t.type,
      color: t.color || null,
      is_boarding: typeLower.includes("boarding"),
      is_daycare: typeLower.includes("daycare") || typeLower.includes("day care"),
      is_grooming:
        typeLower.includes("groom") ||
        typeLower.includes("bath") ||
        typeLower.includes("bathing"),
      single_day: t.single_day === "1",
      status: t.status,
      raw_data: t,
      synced_at: new Date().toISOString(),
    };
  });

  const { error } = await supabase
    .from("gingr_reservation_types")
    .upsert(rows, { onConflict: "location_id,gingr_id" });

  if (error) throw new Error(`Reservation type upsert error: ${error.message}`);
  return { synced: types.length };
}

async function syncInvoices(
  supabase: any,
  subdomain: string,
  apiKey: string,
  locationId: string,
  fullSync = false
) {
  const now = new Date();
  const toDate = now.toISOString().split("T")[0];

  // Resumable backfill: sync invoices in 90-day chunks from a cursor.
  // Once backfill reaches today, ongoing syncs just refresh the last 90 days.
  let fromDate = "2020-01-01"; // Start of business history
  if (!fullSync) {
    try {
      const { data: syncState } = await supabase
        .from("gingr_sync_state")
        .select("backfill_cursor")
        .eq("location_id", locationId)
        .eq("entity_type", "invoices")
        .limit(1);
      const cursor = syncState?.[0]?.backfill_cursor;
      if (cursor && cursor > "2020-01-01") {
        fromDate = cursor;
      }
    } catch (_) {}
  }

  // Check if backfill is complete (cursor is within 90 days of today)
  const fromD = new Date(fromDate);
  const toD = new Date(toDate);
  const daysLeft = Math.round((toD.getTime() - fromD.getTime()) / 86400000);
  const isBackfillComplete = daysLeft <= 90;

  if (isBackfillComplete) {
    fromDate = new Date(now.getTime() - 90 * 86400000).toISOString().split("T")[0];
  }

  // Process in 90-day date chunks to stay within edge function limits
  const chunks = getDateChunks(fromDate, toDate, 90);
  let total = 0;
  const MAX_CHUNKS_PER_RUN = 4; // ~4 chunks of 90 days per invocation
  let chunksProcessed = 0;
  let lastChunkEnd = fromDate;

  for (const [chunkStart, chunkEnd] of chunks) {
    if (!isBackfillComplete && chunksProcessed >= MAX_CHUNKS_PER_RUN) break;

    let page = 1;
    const perPage = 200;
    const seenIds = new Set<number>();

    while (true) {
      const result = await gingrFetch(subdomain, "list_invoices", apiKey, "GET", {
        from_date: chunkStart,
        to_date: chunkEnd,
        per_page: String(perPage),
        page: String(page),
      });

      const invoices = result.data || result;
      if (!Array.isArray(invoices) || invoices.length === 0) break;

      // Detect stuck pagination
      const newIds = invoices.filter((inv: any) => !seenIds.has(Number(inv.id)));
      if (newIds.length === 0) break;
      for (const inv of invoices) seenIds.add(Number(inv.id));

      const rows = invoices.map((inv: any) => ({
        id: Number(inv.id),
        location_id: locationId,
        owner_id: inv.owner_id ? Number(inv.owner_id) : null,
        first_name: inv.first_name?.trim() || null,
        last_name: inv.last_name?.trim() || null,
        email: inv.email || null,
        subtotal: inv.subtotal ? parseFloat(inv.subtotal) : null,
        tax_amount: inv.tax_amount ? parseFloat(inv.tax_amount) : null,
        total: inv.total ? parseFloat(inv.total) : null,
        is_returned: inv.is_returned === 1 || inv.is_returned === "1" || inv.is_returned === true,
        item_count: inv.item_count ? parseInt(inv.item_count) : null,
        voided_item_count: inv.voided_item_count ? parseInt(inv.voided_item_count) : null,
        username: inv.username || null,
        user_id: inv.user_id ? Number(inv.user_id) : null,
        payment_method: inv.payment_method || null,
        created_at: inv.create_stamp
          ? new Date(Number(inv.create_stamp) * 1000).toISOString()
          : inv.created_at || null,
        synced_at: new Date().toISOString(),
      }));

      const chunkSize = 500;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const { error } = await supabase
          .from("gingr_invoices")
          .upsert(chunk, { onConflict: "location_id,id" });
        if (error) throw new Error(`Invoice upsert error: ${error.message}`);
      }

      total += invoices.length;
      if (invoices.length < perPage) break;
      page++;
      if (page > 100) break; // Per-chunk safety
    }

    lastChunkEnd = chunkEnd;
    chunksProcessed++;
  }

  // Save backfill cursor
  try {
    await supabase.from("gingr_sync_state").upsert(
      {
        location_id: locationId,
        entity_type: "invoices",
        backfill_cursor: isBackfillComplete ? null : lastChunkEnd,
      },
      { onConflict: "location_id,entity_type" }
    );
  } catch (_) {}

  return { synced: total, backfill_complete: isBackfillComplete, backfill_cursor: isBackfillComplete ? null : lastChunkEnd };
}

async function syncInvoicePayments(
  supabase: any,
  subdomain: string,
  apiKey: string,
  locationId: string
) {
  // Three sets of invoices need transaction details:
  // 1. Recent invoices (last 2 days) — catches most same-day payments
  // 2. ALL returned invoices (lifetime) — catches refunds on any invoice
  // 3. Paid invoices missing payment records — catches payments on OLD invoices
  //    (e.g., boarding invoice created weeks ago, paid at checkout today)
  const now = new Date();
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  const [recentRes, returnedRes] = await Promise.all([
    supabase
      .from("gingr_invoices")
      .select("id")
      .eq("location_id", locationId)
      .gte("created_at", `${twoDaysAgo}T00:00:00`),
    // ALL returned invoices — no date limit. Refunds can hit any invoice.
    supabase
      .from("gingr_invoices")
      .select("id")
      .eq("location_id", locationId)
      .eq("is_returned", true),
  ]);

  if (recentRes.error) throw new Error(`Invoice payments query error: ${recentRes.error.message}`);

  // Merge and deduplicate
  const allIds = new Set<number>();
  for (const inv of (recentRes.data || [])) allIds.add(inv.id);
  for (const inv of (returnedRes.data || [])) allIds.add(inv.id);

  // Set 3: Invoice IDs from today's reservations (via Gingr API).
  // Catches payments on OLD invoices — e.g., a boarding invoice created weeks ago
  // that gets paid at checkout today. One API call, extracts pos_transaction_id.
  try {
    const todayStr = now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    const todayRes = await gingrFetch(subdomain, "reservations", apiKey, "POST", {
      start_date: todayStr,
      end_date: todayStr,
    });
    const todayResMap = todayRes.data || {};
    for (const res of Object.values(todayResMap) as any[]) {
      const txnId = res.transaction?.pos_transaction_id;
      if (txnId) allIds.add(Number(txnId));
    }
  } catch (err) {
    // Non-fatal — we still have sets 1 and 2
    console.error("Failed to fetch today's reservations for invoice IDs:", err);
  }

  const invoicesToFetch = [...allIds].map(id => ({ id }));
  if (invoicesToFetch.length === 0) return { synced: 0 };

  let total = 0;

  // Process in batches of 10 concurrent API calls
  for (let i = 0; i < invoicesToFetch.length; i += 10) {
    const batch = invoicesToFetch.slice(i, i + 10);
    const results = await Promise.all(
      batch.map(async (inv: any) => {
        try {
          const result = await gingrFetch(
            subdomain,
            "transaction",
            apiKey,
            "POST",
            { id: String(inv.id) }
          );
          return { invoiceId: inv.id, data: result.data };
        } catch (err: any) {
          console.error(`Transaction fetch error for invoice ${inv.id}:`, err.message);
          return { invoiceId: inv.id, data: null };
        }
      })
    );

    const rows: any[] = [];
    for (const { invoiceId, data } of results) {
      if (!data?.detailed_payments) continue;

      for (const [key, entry] of Object.entries(data.detailed_payments) as [string, any][]) {
        // Skip the "deposit" key — it's metadata, not a payment entry
        if (key === "deposit") continue;

        const paymentId = parseInt(key, 10);
        if (isNaN(paymentId)) continue;

        const txTime = entry.transaction_time
          ? new Date(Number(entry.transaction_time) * 1000).toISOString()
          : null;
        // Use Eastern Time for date assignment (Gingr reports use ET)
        const txDate = entry.transaction_time
          ? new Date(Number(entry.transaction_time) * 1000)
              .toLocaleDateString("en-CA", { timeZone: "America/New_York" })
          : null;

        // Detect deposit payments — these are also counted in gingr_deposits
        // so they must be excluded from invoice payment totals to avoid double-counting
        const description = entry.description || "";
        const isDepositPayment = description.startsWith("Deposit for Reservation");

        rows.push({
          id: paymentId,
          location_id: locationId,
          invoice_id: invoiceId,
          payment_method_type: entry.payment_method_type || null,
          total_balance: parseFloat(entry.total_balance) || 0,
          transaction_time: txTime,
          transaction_date: txDate,
          is_zero_payment:
            entry.zero_payment === "1" || entry.zero_payment === 1,
          is_admin_comp: (entry.payment_method_type || "").includes("ADMIN"),
          is_deposit_payment: isDepositPayment,
          raw_data: entry,
          synced_at: new Date().toISOString(),
        });
      }
    }

    // Batch upsert
    if (rows.length > 0) {
      const chunkSize = 500;
      for (let j = 0; j < rows.length; j += chunkSize) {
        const chunk = rows.slice(j, j + chunkSize);
        const { error } = await supabase
          .from("gingr_invoice_payments")
          .upsert(chunk, { onConflict: "location_id,id" });

        if (error) throw new Error(`Invoice payment upsert error: ${error.message}`);
      }
      total += rows.length;
    }
  }

  return { synced: total };
}

async function syncDeposits(
  supabase: any,
  subdomain: string,
  apiKey: string,
  locationId: string
) {
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  let total = 0;

  // Two-phase deposit sweep:
  //   Phase 1 (always): -7 to +90 days — covers most active/upcoming deposits
  //   Phase 2 (daily): +90 to +365 days — catches far-future bookings
  // Phase 2 only runs if it hasn't run in the last 6 hours (tracked via sync state).
  let maxOffset = 90; // Default: fast sweep only

  try {
    const { data: syncState } = await supabase
      .from("gingr_sync_state")
      .select("last_deep_sweep")
      .eq("location_id", locationId)
      .eq("entity_type", "deposits")
      .limit(1);

    const lastDeep = syncState?.[0]?.last_deep_sweep;
    const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString();

    if (!lastDeep || lastDeep < sixHoursAgo) {
      maxOffset = 365; // Do the full sweep
    }
  } catch (_) {
    // If sync state check fails, just do fast sweep
  }

  for (let offset = -7; offset < maxOffset; offset += 30) {
    const chunkStart = new Date(now.getTime() + offset * 24 * 60 * 60 * 1000)
      .toISOString().split("T")[0];
    const chunkEnd = new Date(now.getTime() + (offset + 30) * 24 * 60 * 60 * 1000)
      .toISOString().split("T")[0];

    const result = await gingrFetch(subdomain, "reservations", apiKey, "POST", {
      start_date: chunkStart,
      end_date: chunkEnd,
    });

    const resMap = result.data || {};
    const reservations = Object.entries(resMap) as [string, any][];

    const rows: any[] = [];
    for (const [resId, res] of reservations) {
      const dep = res.deposit;
      // deposit is sometimes an empty array [] when no deposit exists
      if (!dep || typeof dep !== "object" || Array.isArray(dep)) continue;

      const paidAmount = parseFloat(dep.paid_amount) || 0;
      if (paidAmount <= 0) continue;

      const ownerName = [res.owner?.first_name, res.owner?.last_name]
        .filter(Boolean)
        .join(" ") || null;

      rows.push({
        reservation_gingr_id: Number(res.reservation_id || resId),
        location_id: locationId,
        owner_id: res.owner?.id ? Number(res.owner.id) : null,
        owner_name: ownerName,
        animal_name: res.animal?.name || null,
        deposit_amount: dep.amount ? parseFloat(dep.amount) : null,
        paid_amount: paidAmount,
        last_payment: dep.last_payment || null,
        consumed_at: dep.consumed_at || null,
        forfeited_at: dep.forfeited_at || null,
        refunded_at: dep.refunded_at || null,
        last_email_sent: dep.last_email_sent || null,
        reservation_start: res.start_date || null,
        reservation_end: res.end_date || null,
        synced_at: new Date().toISOString(),
      });
    }

    // Batch upsert in 500-row chunks
    const chunkSize = 500;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const { error } = await supabase
        .from("gingr_deposits")
        .upsert(chunk, { onConflict: "location_id,reservation_gingr_id" });

      if (error) throw new Error(`Deposit upsert error: ${error.message}`);
    }

    total += rows.length;
  }

  // Record deep sweep timestamp if we did the full range
  if (maxOffset > 90) {
    try {
      await supabase.from("gingr_sync_state").upsert(
        {
          location_id: locationId,
          entity_type: "deposits",
          last_deep_sweep: new Date().toISOString(),
        },
        { onConflict: "location_id,entity_type" }
      );
    } catch (_) {}
  }

  // Targeted catch: find deposits paid today that we missed because the
  // reservation starts beyond our sweep window. Cross-reference invoice
  // payments flagged as deposit payments — their raw_data.description
  // contains "Deposit for Reservation #<id>" which gives us the reservation ID.
  try {
    const { data: todayDepPayments } = await supabase
      .from("gingr_invoice_payments")
      .select("raw_data")
      .eq("location_id", locationId)
      .eq("transaction_date", todayStr)
      .eq("is_deposit_payment", true);

    if (todayDepPayments && todayDepPayments.length > 0) {
      // Extract reservation IDs from descriptions like "Deposit for Reservation #12345"
      const missingResIds: number[] = [];
      for (const p of todayDepPayments) {
        const desc = p.raw_data?.description || "";
        const match = desc.match(/Reservation\s*#?\s*(\d+)/i);
        if (match) missingResIds.push(Number(match[1]));
      }

      if (missingResIds.length > 0) {
        // Check which ones we already have in gingr_deposits
        const { data: existing } = await supabase
          .from("gingr_deposits")
          .select("reservation_gingr_id")
          .eq("location_id", locationId)
          .in("reservation_gingr_id", missingResIds);

        const existingSet = new Set((existing || []).map((e: any) => e.reservation_gingr_id));
        const toFetch = missingResIds.filter(id => !existingSet.has(id));

        // Fetch missing reservations individually from Gingr
        for (const resId of toFetch) {
          try {
            const result = await gingrFetch(subdomain, "existing_reservation_estimate", apiKey, "GET", {
              id: String(resId),
            });
            const res = result.data;
            if (!res) continue;

            const dep = res.deposit || (res.deposits && res.deposits[0]);
            if (!dep || typeof dep !== "object" || Array.isArray(dep)) continue;

            const paidAmount = parseFloat(dep.paid_amount || dep.amount_paid) || 0;
            if (paidAmount <= 0) continue;

            const ownerName = [res.owner?.first_name, res.owner?.last_name]
              .filter(Boolean)
              .join(" ") || null;

            const row = {
              reservation_gingr_id: Number(resId),
              location_id: locationId,
              owner_id: res.owner?.id ? Number(res.owner.id) : null,
              owner_name: ownerName,
              animal_name: res.animal?.name || null,
              deposit_amount: dep.amount ? parseFloat(dep.amount) : null,
              paid_amount: paidAmount,
              last_payment: dep.last_payment || null,
              consumed_at: dep.consumed_at || null,
              forfeited_at: dep.forfeited_at || null,
              refunded_at: dep.refunded_at || null,
              last_email_sent: dep.last_email_sent || null,
              reservation_start: res.start_date || null,
              reservation_end: res.end_date || null,
              payment_method: dep.payment_method || null,
              payment_method_id: dep.payment_method_id ? Number(dep.payment_method_id) : null,
              deposit_gingr_id: dep.id ? Number(dep.id) : null,
              synced_at: new Date().toISOString(),
            };

            const { error } = await supabase
              .from("gingr_deposits")
              .upsert(row, { onConflict: "location_id,reservation_gingr_id" });

            if (!error) total++;
          } catch (err) {
            console.error(`Failed to fetch deposit for reservation ${resId}:`, err);
          }
        }
      }
    }
  } catch (err) {
    // Non-fatal — the sweep already got most deposits
    console.error("Targeted deposit catch failed:", err);
  }

  return { synced: total };
}

async function computeCashBasisMetrics(
  supabase: any,
  locationId: string,
  subdomain: string,
  apiKey: string
) {
  const now = nowET();

  // Compute cash basis metrics for the last 7 days.
  const datesToCompute: string[] = [];
  for (let i = 6; i >= 0; i--) {
    datesToCompute.push(dateStrET(new Date(now.getTime() - i * 86400000)));
  }

  // Cash basis only counts real money: Cash, Check, Credit Card.
  const CASH_METHODS = ["Cash", "Check", "Credit Card"];

  for (const dateStr of datesToCompute) {
    // 1) Invoice payments — already have payment_method_type
    // Exclude is_deposit_payment to avoid double-counting with gingr_deposits
    const { data: paymentData } = await supabase
      .from("gingr_invoice_payments")
      .select("total_balance")
      .eq("location_id", locationId)
      .eq("transaction_date", dateStr)
      .in("payment_method_type", CASH_METHODS)
      .eq("is_zero_payment", false)
      .eq("is_admin_comp", false)
      .eq("is_deposit_payment", false);

    const entries = paymentData || [];
    const collectedPayments = entries
      .filter((e: any) => parseFloat(e.total_balance) > 0)
      .reduce((sum: number, e: any) => sum + parseFloat(e.total_balance), 0);
    const refunds = entries
      .filter((e: any) => parseFloat(e.total_balance) < 0)
      .reduce((sum: number, e: any) => sum + Math.abs(parseFloat(e.total_balance)), 0);

    // 2) Deposits — need to check payment_method via existing_reservation_estimate API
    const { data: depositData } = await supabase
      .from("gingr_deposits")
      .select("paid_amount, reservation_gingr_id, payment_method")
      .eq("location_id", locationId)
      .gte("last_payment", `${dateStr}T00:00:00`)
      .lt("last_payment", `${dateStr}T23:59:59`)
      .gt("paid_amount", 0);

    const deposits = depositData || [];

    // For deposits missing payment_method, fetch from Gingr API
    const needsLookup = deposits.filter((d: any) => !d.payment_method);
    if (needsLookup.length > 0 && subdomain && apiKey) {
      // Batch in groups of 5 concurrent calls
      for (let i = 0; i < needsLookup.length; i += 5) {
        const batch = needsLookup.slice(i, i + 5);
        const results = await Promise.all(
          batch.map(async (dep: any) => {
            try {
              const result = await gingrFetch(
                subdomain, "existing_reservation_estimate", apiKey, "GET",
                { id: String(dep.reservation_gingr_id) }
              );
              const depInfo = (result.data?.deposits || [])[0];
              return {
                reservation_gingr_id: dep.reservation_gingr_id,
                payment_method: depInfo?.payment_method || null,
                payment_method_id: depInfo?.payment_method_id ? Number(depInfo.payment_method_id) : null,
                deposit_gingr_id: depInfo?.id ? Number(depInfo.id) : null,
              };
            } catch (err) {
              console.error(`Deposit lookup failed for res ${dep.reservation_gingr_id}:`, err);
              return { reservation_gingr_id: dep.reservation_gingr_id, payment_method: null, payment_method_id: null, deposit_gingr_id: null };
            }
          })
        );

        // Update deposit records with payment method
        for (const r of results) {
          if (r.payment_method) {
            await supabase
              .from("gingr_deposits")
              .update({
                payment_method: r.payment_method,
                payment_method_id: r.payment_method_id,
                deposit_gingr_id: r.deposit_gingr_id,
              })
              .eq("location_id", locationId)
              .eq("reservation_gingr_id", r.reservation_gingr_id);

            // Update the in-memory deposit object too
            const dep = deposits.find((d: any) => d.reservation_gingr_id === r.reservation_gingr_id);
            if (dep) dep.payment_method = r.payment_method;
          }
        }
      }
    }

    // Only count deposits paid via real money (Cash, Check, Credit Card)
    const collectedDeposits = deposits
      .filter((d: any) => {
        const method = d.payment_method;
        // If we have a payment method, filter strictly
        if (method) return CASH_METHODS.some(m => method.toLowerCase().includes(m.toLowerCase()));
        // If lookup failed and no method, include (safe default — matches old behavior)
        return true;
      })
      .reduce((sum: number, d: any) => sum + parseFloat(d.paid_amount || 0), 0);

    // 2b) Deposit refunds — deposits refunded on this date
    const { data: depositRefundData } = await supabase
      .from("gingr_deposits")
      .select("paid_amount")
      .eq("location_id", locationId)
      .gte("refunded_at", `${dateStr}T00:00:00`)
      .lt("refunded_at", `${dateStr}T23:59:59`);

    const depositRefunds = (depositRefundData || [])
      .reduce((sum: number, d: any) => sum + Math.abs(parseFloat(d.paid_amount || 0)), 0);

    // 3) Compute and upsert
    const totalRefunds = refunds + depositRefunds;
    const cashNetRevenue = collectedPayments + collectedDeposits - totalRefunds;

    await supabase
      .from("dashboard_metrics_daily")
      .upsert(
        {
          location_id: locationId,
          metric_date: dateStr,
          cash_collected_payments: collectedPayments,
          cash_collected_deposits: collectedDeposits,
          cash_refunds: totalRefunds,
          cash_net_revenue: cashNetRevenue,
          computed_at: new Date().toISOString(),
        },
        { onConflict: "location_id,metric_date" }
      );
  }
}

async function syncImmunizationTypes(
  supabase: any,
  subdomain: string,
  apiKey: string,
  locationId: string
) {
  const result = await gingrFetch(subdomain, "get_immunization_types", apiKey, "GET", {
    species_id: "1",
  });
  const types = result.data || [];

  if (types.length === 0) return { synced: 0 };

  const rows = types.map((t: any) => ({
    gingr_id: String(t.id),
    location_id: locationId,
    name: t.type,
    required: t.required === "1",
  }));

  const { error } = await supabase
    .from("gingr_immunization_types")
    .upsert(rows, { onConflict: "location_id,gingr_id" });

  if (error) throw new Error(`Immunization type upsert error: ${error.message}`);
  return { synced: types.length };
}

// ─── Sync Runs & Occupancy via get_runs_and_reservations ──────────────────
// Discovers all rooms/runs and their current occupancy from Gingr.
// Replaces the manually-configured room_names setting.

async function syncRunsAndOccupancy(
  supabase: any,
  subdomain: string,
  apiKey: string,
  gingrLocationId: string,
  locationId: string
): Promise<{ runs: number; occupancy: number; areas: number }> {
  // Format dates as MM-DD-YYYY (required by this endpoint)
  const now = nowET();
  const yesterday = new Date(now.getTime() - 86400000);
  const tomorrow = new Date(now.getTime() + 86400000);
  const fmt = (d: Date) =>
    `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}-${d.getFullYear()}`;

  // Build form-encoded body — reservation_dates must be form-encoded arrays, NOT JSON
  // Fetch [yesterday, today, tomorrow] to ensure we always have adjacent-day data for transfers
  const params = new URLSearchParams();
  params.append("key", apiKey);
  params.append("location_id", gingrLocationId);
  params.append("type_id", "5"); // any boarding type — returns ALL areas regardless
  params.append("reservation_dates[0][startDate]", fmt(yesterday));
  params.append("reservation_dates[0][endDate]", fmt(tomorrow));

  const url = `https://${subdomain}.gingrapp.com/api/v1/get_runs_and_reservations`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
    body: params.toString(),
  });

  if (!resp.ok) {
    throw new Error(`get_runs_and_reservations error ${resp.status}: ${await resp.text()}`);
  }

  const areas = await resp.json();
  if (!Array.isArray(areas)) {
    throw new Error(`get_runs_and_reservations unexpected response: ${JSON.stringify(areas).slice(0, 200)}`);
  }

  const todayStr = dateStrET(now);
  const yesterdayStr = dateStrET(yesterday);
  const tomorrowStr = dateStrET(tomorrow);
  const datesToSync = [yesterdayStr, todayStr, tomorrowStr];
  const runRows: any[] = [];
  const occupancyRows: any[] = [];
  const snapshotRows: any[] = [];

  for (const area of areas) {
    const areaId = String(area.id || "");
    const areaName = area.name || "";

    // Area-level occupancy snapshot for each synced date
    for (const syncDate of datesToSync) {
      const occ = area.occupancy?.[syncDate];
      if (occ) {
        snapshotRows.push({
          location_id: locationId,
          snapshot_date: syncDate,
          area_id: areaId,
          area_name: areaName,
          percent_occupied: occ.percent_occupied || "0%",
          number_occupied: parseInt(occ.number_occupied) || 0,
          number_available: parseInt(occ.number_available) || 0,
          total_runs: parseInt(occ.total_runs) || 0,
          synced_at: new Date().toISOString(),
        });
      }
    }

    // Individual runs
    for (const run of area.runs || []) {
      const runId = String(run.id || "");
      const runName = run.name || "";
      const isPP = runName.toLowerCase().includes("private play") || runName.toLowerCase().includes(" pp");
      const isIso = runName.toLowerCase().includes("iso");

      runRows.push({
        location_id: locationId,
        gingr_run_id: runId,
        run_name: runName,
        area_id: areaId,
        area_name: areaName,
        run_type: run.type || null,
        max_animals: run.max_animals ? parseInt(run.max_animals) : null,
        max_weight: run.max_weight ? parseInt(run.max_weight) : null,
        is_private_play: isPP,
        is_isolation: isIso,
        synced_at: new Date().toISOString(),
      });

      // Room-level occupancy for each queried date
      for (const resDate of run.reservation_date || []) {
        if (!resDate.occupied) continue;
        occupancyRows.push({
          location_id: locationId,
          gingr_run_id: runId,
          run_name: runName,
          area_name: areaName,
          occupancy_date: resDate.date,
          animal_names: resDate.animal_name || null,
          current_animals: parseInt(resDate.current_animals) || 0,
          current_weight: parseInt(resDate.current_weight) || 0,
          occupied: true,
          end_date: resDate.end_date || null,
          synced_at: new Date().toISOString(),
        });
      }
    }
  }

  // Upsert runs
  if (runRows.length > 0) {
    const { error } = await supabase
      .from("gingr_runs")
      .upsert(runRows, { onConflict: "location_id,gingr_run_id" });
    if (error) throw new Error(`gingr_runs upsert error: ${error.message}`);
  }

  // Upsert occupancy (clear stale data for all synced dates first, then insert fresh)
  for (const syncDate of datesToSync) {
    await supabase
      .from("gingr_room_occupancy")
      .delete()
      .eq("location_id", locationId)
      .eq("occupancy_date", syncDate);
  }

  if (occupancyRows.length > 0) {
    for (let i = 0; i < occupancyRows.length; i += 500) {
      const chunk = occupancyRows.slice(i, i + 500);
      const { error } = await supabase
        .from("gingr_room_occupancy")
        .upsert(chunk, { onConflict: "location_id,gingr_run_id,occupancy_date" });
      if (error) throw new Error(`gingr_room_occupancy upsert error: ${error.message}`);
    }
  }

  // Upsert area-level snapshots
  if (snapshotRows.length > 0) {
    const { error } = await supabase
      .from("gingr_occupancy_snapshot")
      .upsert(snapshotRows, { onConflict: "location_id,snapshot_date,area_id" });
    if (error) throw new Error(`gingr_occupancy_snapshot upsert error: ${error.message}`);
  }

  console.log(`Runs sync: ${runRows.length} runs, ${occupancyRows.length} occupied rooms, ${snapshotRows.length} area snapshots`);
  return { runs: runRows.length, occupancy: occupancyRows.length, areas: snapshotRows.length };
}

/**
 * Backfill room occupancy for a date range.
 * Fetches room data from Gingr for each day in the range and upserts into DB.
 */
async function backfillRoomOccupancy(
  supabase: any,
  subdomain: string,
  apiKey: string,
  gingrLocationId: string,
  locationId: string,
  startDate: string,
  endDate: string,
): Promise<{ days: number; totalOccupancy: number }> {
  const fmt = (d: Date) =>
    `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}-${d.getFullYear()}`;
  const toDateStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const start = new Date(startDate + "T12:00:00");
  const end = new Date(endDate + "T12:00:00");
  let totalOccupancy = 0;
  let days = 0;

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const nextDay = new Date(d.getTime() + 86400000);
    const dateStr = toDateStr(d);

    const params = new URLSearchParams();
    params.append("key", apiKey);
    params.append("location_id", gingrLocationId);
    params.append("type_id", "5");
    params.append("reservation_dates[0][startDate]", fmt(d));
    params.append("reservation_dates[0][endDate]", fmt(nextDay));

    const url = `https://${subdomain}.gingrapp.com/api/v1/get_runs_and_reservations`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
      body: params.toString(),
    });

    if (!resp.ok) {
      console.error(`Backfill ${dateStr} failed: ${resp.status}`);
      continue;
    }

    const areas = await resp.json();
    if (!Array.isArray(areas)) continue;

    const occupancyRows: any[] = [];
    const snapshotRows: any[] = [];

    for (const area of areas) {
      const areaId = String(area.id || "");
      const areaName = area.name || "";

      const occ = area.occupancy?.[dateStr];
      if (occ) {
        snapshotRows.push({
          location_id: locationId,
          snapshot_date: dateStr,
          area_id: areaId,
          area_name: areaName,
          percent_occupied: occ.percent_occupied || "0%",
          number_occupied: parseInt(occ.number_occupied) || 0,
          number_available: parseInt(occ.number_available) || 0,
          total_runs: parseInt(occ.total_runs) || 0,
          synced_at: new Date().toISOString(),
        });
      }

      for (const run of area.runs || []) {
        for (const resDate of run.reservation_date || []) {
          if (!resDate.occupied) continue;
          occupancyRows.push({
            location_id: locationId,
            gingr_run_id: String(run.id || ""),
            run_name: run.name || "",
            area_name: areaName,
            occupancy_date: resDate.date,
            animal_names: resDate.animal_name || null,
            current_animals: parseInt(resDate.current_animals) || 0,
            current_weight: parseInt(resDate.current_weight) || 0,
            occupied: true,
            end_date: resDate.end_date || null,
            synced_at: new Date().toISOString(),
          });
        }
      }
    }

    // Clear and insert for this date
    await supabase.from("gingr_room_occupancy").delete()
      .eq("location_id", locationId).eq("occupancy_date", dateStr);

    if (occupancyRows.length > 0) {
      for (let i = 0; i < occupancyRows.length; i += 500) {
        const chunk = occupancyRows.slice(i, i + 500);
        await supabase.from("gingr_room_occupancy")
          .upsert(chunk, { onConflict: "location_id,gingr_run_id,occupancy_date" });
      }
    }

    if (snapshotRows.length > 0) {
      await supabase.from("gingr_occupancy_snapshot")
        .upsert(snapshotRows, { onConflict: "location_id,snapshot_date,area_id" });
    }

    totalOccupancy += occupancyRows.length;
    days++;
    console.log(`Backfill ${dateStr}: ${occupancyRows.length} occupied rooms`);
  }

  return { days, totalOccupancy };
}

// ─── Sync Animal Icons via get_icons ──────────────────────────────────────
// Refreshes icon assignments for the operational horizon so current dogs and
// upcoming scheduled dogs share the same canonical icon source.

async function syncAnimalIcons(
  supabase: any,
  subdomain: string,
  apiKey: string,
  locationId: string
): Promise<{ synced: number; animals: number }> {
  const today = dateStrET();
  const futureEndDate = addDaysStr(today, SCHEDULING_FUTURE_SYNC_DAYS);

  // Refresh icons for dogs that are active now or already sold inside the
  // scheduling horizon. This prevents future scheduling from depending on
  // stale icon rows for dogs that are not physically checked in yet.
  const { data: horizonReservations, error } = await supabase
    .from("gingr_reservations")
    .select("animal_gingr_id")
    .eq("location_id", locationId)
    .is("check_out_date", null)
    .is("cancelled_date", null)
    .lt("start_date", `${addDaysStr(futureEndDate, 1)}T00:00:00`)
    .gte("end_date", `${today}T00:00:00`);

  if (error) {
    throw new Error(`gingr_reservations icon scope query error: ${error.message}`);
  }

  const animalIds = [...new Set(
    (horizonReservations || [])
      .map((row: any) => String(row.animal_gingr_id || "").trim())
      .filter(Boolean),
  )];

  if (animalIds.length === 0) {
    return { synced: 0, animals: 0 };
  }

  const result = await upsertAnimalIconsFromGingr({
    supabase,
    locationId,
    gingrConfig: { subdomain, apiKey },
    animalIds,
  });

  console.log(`Icons sync: ${result.synced} icons for ${result.animals} animals`);
  return { synced: result.synced, animals: result.animals };
}

function normalizeAnimalIds(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(
    values
      .map((value) => String(value || "").trim())
      .filter(Boolean),
  )];
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function resolveLocationId(
  supabase: any,
  locationRef: string,
  locationSlug?: string | null,
): Promise<string> {
  const ref = String(locationRef || "").trim();
  const slug = String(locationSlug || "").trim();

  if (isUuid(ref)) return ref;

  const lookupSlug = slug || ref;
  if (!lookupSlug) return ref;

  const { data, error } = await supabase
    .from("locations")
    .select("id")
    .eq("slug", lookupSlug)
    .maybeSingle();

  if (error) {
    console.warn(`Location slug resolution failed for ${lookupSlug}: ${error.message}`);
    return ref;
  }

  return data?.id || ref;
}

function serializePlaygroupAssignment(assignment: PlaygroupAssignment) {
  return {
    animal_gingr_id: assignment.animalGingrId,
    size_group: assignment.sizeGroup,
    has_private_play: assignment.hasPrivatePlay,
    has_evaluation: assignment.hasEvaluation,
    is_half_and_half: assignment.isHalfAndHalf,
    primary_display_playgroup: assignment.primaryDisplayPlaygroup,
    scheduling_playgroup: assignment.schedulingPlaygroup,
    playgroup_tags: assignment.playgroupTags,
    source_icon_titles: assignment.sourceIconTitles,
    source_icon_comments: assignment.sourceIconComments,
    half_and_half_note: assignment.halfAndHalfNote,
    unresolved_reason: assignment.unresolvedReason,
  };
}

async function fetchTvPlaygroupAssignments({
  supabase,
  subdomain,
  apiKey,
  locationId,
  animalIds,
}: {
  supabase: any;
  subdomain: string;
  apiKey: string;
  locationId: string;
  animalIds: string[];
}) {
  const loadAssignments = async () => fetchPlaygroupAssignments({
    supabase,
    locationId,
    animalIds,
    columns: DEFAULT_PLAYGROUP_ASSIGNMENT_COLUMNS,
  });

  let assignments = await loadAssignments();
  let iconsResult = { synced: 0, animals: 0 };

  if (assignments.length === 0) {
    iconsResult = animalIds.length > 0
      ? await upsertAnimalIconsFromGingr({
          supabase,
          locationId,
          gingrConfig: { subdomain, apiKey },
          animalIds,
        })
      : await syncAnimalIcons(supabase, subdomain, apiKey, locationId);

    assignments = await loadAssignments();
  }

  return {
    assignments: assignments.map(serializePlaygroupAssignment),
    icons_synced: iconsResult.synced,
    icon_animals_synced: iconsResult.animals,
  };
}

// ─── Mass Icon Pull — ALL animals in gingr_animals ───────────────────────
// Used for location initialization or backfill. Fetches icons for every
// animal in the database, not just checked-in dogs. Gingr's get_icons API
// accepts batches of animal IDs, so we chunk in groups of 200.
async function syncAllAnimalIcons(
  supabase: any,
  subdomain: string,
  apiKey: string,
  locationId: string
): Promise<{ synced: number; animals: number }> {
  const { data: allAnimals } = await supabase
    .from("gingr_animals")
    .select("gingr_id")
    .eq("location_id", locationId);

  const allIds = [...new Set(
    (allAnimals || []).map((a: any) => String(a.gingr_id)).filter(Boolean)
  )] as string[];

  if (allIds.length === 0) return { synced: 0, animals: 0 };

  let totalIcons = 0;
  let totalAnimals = 0;

  // Chunk into batches of 200 to avoid API limits
  for (let i = 0; i < allIds.length; i += 200) {
    const batch = allIds.slice(i, i + 200);
    const params = new URLSearchParams();
    params.append("key", apiKey);
    params.append("animal_ids", JSON.stringify(batch.map(Number)));
    params.append("owner_ids", "null");

    const url = `https://${subdomain}.gingrapp.com/api/v1/get_icons`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
      body: params.toString(),
    });
    if (!resp.ok) { console.error(`get_icons batch error: ${resp.status}`); continue; }
    const result = await resp.json();
    if (!result.success) { console.error(`get_icons batch failed`); continue; }

    const animalsData = result.data?.animals || {};
    const iconRows: any[] = [];
    const now = new Date().toISOString();

    for (const [animalId, animalEntry] of Object.entries(animalsData) as [string, any][]) {
      totalAnimals++;
      const icons = animalEntry?.icons || [];
      for (const icon of icons) {
        const iconTemplateId = String(icon.color_label_template_id || icon.id || "");
        const iconGroup = icon.name || null;
        const iconTitle = icon.title || null;
        iconRows.push({
          location_id: locationId,
          animal_gingr_id: animalId,
          icon_template_id: iconTemplateId,
          icon_identity_key: buildIconIdentityKey({
            iconTemplateId,
            iconGroup,
            iconTitle,
          }),
          icon_title: iconTitle,
          icon_group: iconGroup,
          icon_color: icon.color || null,
          icon_class: icon.class || null,
          icon_comment: icon.comment || null,
          synced_at: now,
          first_seen_at: now,
          last_seen_at: now,
        });
      }
    }

    if (iconRows.length > 0) {
      const deduped = new Map<string, any>();
      for (const row of iconRows) {
        deduped.set(`${row.location_id}|${row.animal_gingr_id}|${row.icon_identity_key}`, row);
      }
      for (let j = 0; j < [...deduped.values()].length; j += 500) {
        const chunk = [...deduped.values()].slice(j, j + 500);
        await supabase.from("gingr_animal_icons_live")
          .upsert(chunk, { onConflict: "location_id,animal_gingr_id,icon_identity_key" });
      }
      totalIcons += deduped.size;
    }

    console.log(`Icons mass pull batch ${Math.floor(i / 200) + 1}: ${iconRows.length} icons from ${Object.keys(animalsData).length} animals`);
  }

  console.log(`Icons mass pull complete: ${totalIcons} icons for ${totalAnimals} animals (from ${allIds.length} total)`);
  return { synced: totalIcons, animals: totalAnimals };
}

// ─── Sync Animal Photos to Supabase Storage ──────────────────────────────
// Downloads dog profile photos from Gingr's Google Cloud Storage CDN and
// uploads them to the `dog-profile-pics` Supabase Storage bucket.
// Only processes currently checked-in dogs (~50-80 at a time).
// Change detection: compares image_url to photo_synced_from — when Gingr
// updates a photo the URL changes (contains unique upload UUID).

async function syncAnimalPhotos(
  supabase: any,
  locationId: string
): Promise<{ synced: number; skipped: number; errors: number }> {
  // 1. Get checked-in animal IDs
  const { data: checkedIn } = await supabase
    .from("gingr_reservations")
    .select("animal_gingr_id")
    .eq("location_id", locationId)
    .not("check_in_date", "is", null)
    .is("check_out_date", null)
    .is("cancelled_date", null);

  const animalIds = [
    ...new Set(
      (checkedIn || [])
        .map((r: any) => r.animal_gingr_id)
        .filter((id: any) => id != null)
    ),
  ] as string[];

  if (animalIds.length === 0) return { synced: 0, skipped: 0, errors: 0 };

  // 2. Fetch ALL animals (with and without photos) for accurate logging
  const { data: allAnimals } = await supabase
    .from("gingr_animals")
    .select("gingr_id, image_url, local_photo_url, photo_synced_from")
    .eq("location_id", locationId)
    .in("gingr_id", animalIds);

  const animals = (allAnimals || []).filter((a: any) => a.image_url);
  const noPhotoCount = (allAnimals || []).length - animals.length;

  if (animals.length === 0) {
    console.log(`Photo sync: 0 to sync, ${noPhotoCount} have no photo in Gingr`);
    return { synced: 0, skipped: 0, errors: 0 };
  }

  // Filter to only dogs that need syncing (new photo or changed photo)
  const toSync = animals.filter(
    (a: any) => !a.local_photo_url || a.image_url !== a.photo_synced_from
  );

  if (toSync.length === 0) return { synced: 0, skipped: animals.length, errors: 0 };

  let synced = 0;
  let errors = 0;

  // 3. Process in batches of 10
  for (let i = 0; i < toSync.length; i += 10) {
    const batch = toSync.slice(i, i + 10);

    await Promise.all(
      batch.map(async (animal: any) => {
        try {
          const gingrImageUrl = animal.image_url;
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10000);
          let imageResp: Response;
          try {
            imageResp = await fetch(gingrImageUrl, { signal: controller.signal });
          } catch (e: any) {
            clearTimeout(timeout);
            console.warn(`Photo download timeout/error for animal ${animal.gingr_id}: ${e.message}`);
            errors++;
            return;
          }
          clearTimeout(timeout);
          if (!imageResp.ok) {
            console.warn(`Photo download failed for animal ${animal.gingr_id}: HTTP ${imageResp.status}`);
            errors++;
            return;
          }

          const imageBlob = await imageResp.blob();
          if (imageBlob.size > 5 * 1024 * 1024) {
            console.warn(`Photo too large for animal ${animal.gingr_id}: ${(imageBlob.size / 1024 / 1024).toFixed(1)}MB (max 5MB), skipping`);
            errors++;
            return;
          }
          const contentType = imageResp.headers.get("content-type") || "image/jpeg";
          const ext = contentType.includes("png")
            ? "png"
            : contentType.includes("webp")
            ? "webp"
            : "jpg";
          const storagePath = `${locationId}/${animal.gingr_id}.${ext}`;

          const { error: uploadError } = await supabase.storage
            .from("dog-profile-pics")
            .upload(storagePath, imageBlob, {
              contentType,
              upsert: true,
            });

          if (uploadError) {
            console.warn(`Photo upload failed for animal ${animal.gingr_id}: ${uploadError.message}`);
            errors++;
            return;
          }

          const {
            data: { publicUrl },
          } = supabase.storage
            .from("dog-profile-pics")
            .getPublicUrl(storagePath);

          const { error: updateError } = await supabase
            .from("gingr_animals")
            .update({
              local_photo_url: publicUrl,
              photo_synced_from: gingrImageUrl,
            })
            .eq("gingr_id", animal.gingr_id)
            .eq("location_id", locationId);

          if (updateError) {
            console.warn(`Photo record update failed for animal ${animal.gingr_id}: ${updateError.message}`);
            errors++;
            return;
          }

          synced++;
        } catch (err: any) {
          console.warn(`Photo sync error for animal ${animal.gingr_id}: ${err.message}`);
          errors++;
        }
      })
    );
  }

  console.log(`Photo sync: ${synced} downloaded, ${animals.length - toSync.length} already cached, ${errors} failed, ${noPhotoCount} no photo in Gingr`);
  return { synced, skipped: animals.length - toSync.length, errors };
}

async function fetchOperationalAnimalIds(
  supabase: any,
  locationId: string,
): Promise<string[]> {
  const today = dateStrET();
  const tomorrow = addDaysStr(today, 1);
  const dayAfterTomorrow = addDaysStr(today, 2);

  const { data: horizonReservations, error } = await supabase
    .from("gingr_reservations")
    .select("animal_gingr_id")
    .eq("location_id", locationId)
    .is("cancelled_date", null)
    .lt("start_date", `${dayAfterTomorrow}T00:00:00`)
    .gte("end_date", `${today}T00:00:00`);

  if (error) {
    throw new Error(`Operational animal scope query failed: ${error.message}`);
  }

  return [...new Set(
    (horizonReservations || [])
      .map((row: any) => String(row.animal_gingr_id || "").trim())
      .filter(Boolean),
  )];
}

async function replaceOperationalDetailRows(
  supabase: any,
  table: string,
  locationId: string,
  animalIds: string[],
  rows: any[],
) {
  if (animalIds.length > 0) {
    const { error: deleteError } = await supabase
      .from(table)
      .delete()
      .eq("location_id", locationId)
      .in("animal_gingr_id", animalIds);
    if (deleteError) {
      throw new Error(`${table} delete failed: ${deleteError.message}`);
    }
  }

  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error: insertError } = await supabase
      .from(table)
      .insert(chunk);
    if (insertError) {
      throw new Error(`${table} insert failed: ${insertError.message}`);
    }
  }
}

async function syncFeedingSchedules(
  supabase: any,
  subdomain: string,
  apiKey: string,
  locationId: string,
): Promise<{ synced: number; animals: number }> {
  const animalIds = await fetchOperationalAnimalIds(supabase, locationId);
  if (animalIds.length === 0) {
    return { synced: 0, animals: 0 };
  }

  const { rows, processedAnimals } = await fetchFeedingRowsForAnimals(
    locationId,
    animalIds,
    { subdomain, apiKey },
  );

  await replaceOperationalDetailRows(
    supabase,
    "gingr_feeding_schedules",
    locationId,
    animalIds,
    rows,
  );

  console.log(`Feeding sync: ${rows.length} rows for ${processedAnimals}/${animalIds.length} animals`);
  return { synced: rows.length, animals: processedAnimals };
}

async function syncMedications(
  supabase: any,
  subdomain: string,
  apiKey: string,
  locationId: string,
): Promise<{ synced: number; animals: number }> {
  const animalIds = await fetchOperationalAnimalIds(supabase, locationId);
  if (animalIds.length === 0) {
    return { synced: 0, animals: 0 };
  }

  const { rows, processedAnimals } = await fetchMedicationRowsForAnimals(
    locationId,
    animalIds,
    { subdomain, apiKey },
  );

  await replaceOperationalDetailRows(
    supabase,
    "gingr_medications",
    locationId,
    animalIds,
    rows,
  );

  console.log(`Medication sync: ${rows.length} rows for ${processedAnimals}/${animalIds.length} animals`);
  return { synced: rows.length, animals: processedAnimals };
}

// ─── Server-side room assignment via BOH API ─────────────────────────────
// The back_of_house API with full_day=true returns ALL currently-housed dogs
// (checking_in + checking_out lists) with their actual run_name (room).
// This is the ONLY Gingr API endpoint that provides room assignments.
// The reservations API does NOT include room data.

async function persistBohRoomAssignments(
  supabase: any,
  subdomain: string,
  apiKey: string,
  gingrLocationId: string,
  locationId: string,
  bohData?: any,
): Promise<{ assigned: number; bohDogs: number }> {
  // 1. Use the BOH data already fetched by the presence worker when available.
  //    This keeps the sync path to one BOH call per cycle while still allowing
  //    legacy full-sync callers to refresh assignments directly.
  const bohResult = bohData || await gingrFetch(
    subdomain,
    "back_of_house",
    apiKey,
    "GET",
    { location_id: gingrLocationId, full_day: "true", include_daycare: "true" },
  );

  // BOH response: { data: { checking_out: [...], checking_in: [...] } }
  const checkingOut = bohResult?.data?.checking_out || bohResult?.checking_out || [];
  const checkingIn = bohResult?.data?.checking_in || bohResult?.checking_in || [];
  const allBohDogs = [...checkingOut, ...checkingIn];

  if (allBohDogs.length === 0) {
    return { assigned: 0, bohDogs: 0 };
  }

  // 2. Build animal_id → run_name map from BOH
  const bohRoomMap: Record<string, { runName: string; areaName: string }> = {};
  for (const dog of allBohDogs) {
    const animalId = String(dog.animal_id || dog.id || "");
    if (animalId && dog.run_name) {
      bohRoomMap[animalId] = { runName: dog.run_name, areaName: dog.area_name || "" };
    }
  }

  const animalIds = Object.keys(bohRoomMap);
  if (animalIds.length === 0) {
    return { assigned: 0, bohDogs: allBohDogs.length };
  }

  // 3. Find ACTIVE reservations (checked in, not checked out, not cancelled)
  //    for these animals and update their room_assignment
  const { data: activeReservations } = await supabase
    .from("gingr_reservations")
    .select("gingr_id, animal_gingr_id, room_assignment")
    .eq("location_id", locationId)
    .not("check_in_date", "is", null)
    .is("check_out_date", null)
    .is("cancelled_date", null)
    .in("animal_gingr_id", animalIds);

  let updated = 0;
  for (const res of activeReservations || []) {
    const aid = String(res.animal_gingr_id);
    const boh = bohRoomMap[aid];
    if (boh?.runName && res.room_assignment !== boh.runName) {
      const { error } = await supabase
        .from("gingr_reservations")
        .update({ room_assignment: boh.runName })
        .eq("gingr_id", res.gingr_id)
        .eq("location_id", locationId);
      if (!error) updated++;
    }
  }

  console.log(`BOH room sync: ${allBohDogs.length} dogs in-house, ${animalIds.length} with rooms, ${updated} reservations updated`);

  // ── Occupancy-based room sync (catches mid-stay transfers missed by BOH) ──
  // After syncRunsAndOccupancy populates gingr_room_occupancy, use that as
  // ground truth for room assignments. BOH only shows checking_in/checking_out
  // dogs, but occupancy shows ALL dogs currently in rooms.
  try {
    const todayET = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    const { data: occupancy } = await supabase
      .from("gingr_room_occupancy")
      .select("run_name, animal_names")
      .eq("location_id", locationId)
      .eq("occupancy_date", todayET)
      .eq("occupied", true);

    if (occupancy && occupancy.length > 0) {
      // Build map: animal_name (lowercase) → run_name from occupancy
      const occupancyRoomMap: Record<string, string> = {};
      for (const occ of occupancy) {
        if (!occ.animal_names || !occ.run_name) continue;
        const entries = occ.animal_names.split("<br>").map((e: string) => e.trim()).filter(Boolean);
        for (const entry of entries) {
          // Format: "Callie (Amy Mullen)" — extract dog name
          const match = entry.match(/^(.+?)\s*\(/);
          const dogName = match ? match[1].trim() : entry.trim();
          if (dogName) {
            occupancyRoomMap[dogName.toLowerCase()] = occ.run_name;
          }
        }
      }

      // Find active reservations (checked in, not checked out, not cancelled)
      const { data: activeRes } = await supabase
        .from("gingr_reservations")
        .select("gingr_id, animal_gingr_id, animal_name, room_assignment")
        .eq("location_id", locationId)
        .not("check_in_date", "is", null)
        .is("check_out_date", null)
        .is("cancelled_date", null);

      let occupancyUpdated = 0;
      for (const res of activeRes || []) {
        const name = (res.animal_name || "").toLowerCase().trim();
        if (!name) continue;
        const occRoom = occupancyRoomMap[name];
        if (occRoom && res.room_assignment !== occRoom) {
          const { error } = await supabase
            .from("gingr_reservations")
            .update({ room_assignment: occRoom })
            .eq("gingr_id", res.gingr_id)
            .eq("location_id", locationId);
          if (!error) occupancyUpdated++;
        }
      }
      if (occupancyUpdated > 0) {
        console.log(`Occupancy-based room sync: ${occupancyUpdated} reservations updated from room occupancy data`);
      }
    }
  } catch (occErr: any) {
    console.error("Occupancy-based room sync error:", occErr.message);
  }

  return { assigned: updated, bohDogs: allBohDogs.length };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function getDateChunks(start: string, end: string, maxDays: number): [string, string][] {
  const chunks: [string, string][] = [];
  let current = new Date(start);
  const endDate = new Date(end);

  while (current < endDate) {
    const chunkEnd = new Date(current.getTime() + maxDays * 24 * 60 * 60 * 1000);
    const actualEnd = chunkEnd > endDate ? endDate : chunkEnd;
    chunks.push([
      current.toISOString().split("T")[0],
      actualEnd.toISOString().split("T")[0],
    ]);
    current = new Date(actualEnd.getTime() + 1 * 24 * 60 * 60 * 1000);
  }

  return chunks;
}

function enumerateDateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  let current = start;
  while (current <= end) {
    dates.push(current);
    current = addDaysStr(current, 1);
  }
  return dates;
}

function updateSyncState(
  supabase: any,
  locationId: string,
  entityType: string,
  data: Record<string, any>
) {
  return supabase.from("gingr_sync_state").upsert(
    {
      location_id: locationId,
      entity_type: entityType,
      ...data,
    },
    { onConflict: "location_id,entity_type" }
  );
}

// ─── Main handler ──────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    let { location_id, sync_type = "full", entities, test_credentials, animal_ids, location_slug, max_run_ms } = body;

    if (!location_id) {
      return new Response(JSON.stringify({ error: "location_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Initialize Supabase with service role for writes
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    location_id = await resolveLocationId(supabase, location_id, location_slug);

    // ── Test mode: just verify Gingr connection, no DB writes ──
    if (sync_type === "test") {
      const creds = test_credentials;
      if (!creds?.api_key || !creds?.subdomain) {
        return new Response(
          JSON.stringify({ success: false, error: "Provide test_credentials with api_key and subdomain." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      try {
        const testResult = await gingrFetch(creds.subdomain, "get_locations", creds.api_key);
        const locs = Array.isArray(testResult) ? testResult : testResult.data || [];
        return new Response(
          JSON.stringify({ success: true, locations: locs.length, location_names: locs.map((l: any) => l.label) }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err: any) {
        return new Response(
          JSON.stringify({ success: false, error: err.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Get Gingr config from lite_settings
    const { data: settingsRows } = await supabase
      .from("lite_settings")
      .select("setting_value")
      .eq("location_id", location_id)
      .eq("setting_key", "gingr_config")
      .limit(1);

    const gingrConfig = settingsRows?.[0]?.setting_value;
    if (!gingrConfig?.api_key || !gingrConfig?.subdomain) {
      return new Response(
        JSON.stringify({
          error: "Gingr not configured. Set api_key and subdomain in Settings → Gingr Integration.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { api_key, subdomain, gingr_location_id } = gingrConfig;

    // ── Checkout TV playgroup assignments ────────────────────────────────
    // Reads the canonical assignment view with the service client. If the
    // synced icon rows are empty or incomplete for the requested dogs, refresh
    // only those GINGR icon assignments, then read the canonical view again.
    if (sync_type === "playgroup-assignments") {
      const startTime = Date.now();
      const animalIds = normalizeAnimalIds(animal_ids);
      const result = await fetchTvPlaygroupAssignments({
        supabase,
        subdomain,
        apiKey: api_key,
        locationId: location_id,
        animalIds,
      });

      return new Response(
        JSON.stringify({
          success: true,
          sync_type: "playgroup-assignments",
          requested_animals: animalIds.length,
          assignments: result.assignments,
          icons_synced: result.icons_synced,
          icon_animals_synced: result.icon_animals_synced,
          duration_ms: Date.now() - startTime,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Presence-sync: canonical checked-in state + transition ledger ───────
    // This is the durable successor to separate dashboard/TV browser polling.
    // It keeps gingr_reservations and BOH cache compatible while writing the
    // canonical facility_presence_current/events tables in one server path.
    if (sync_type === "presence-worker") {
      const result = await runPresenceWorker({
        supabase,
        subdomain,
        apiKey: api_key,
        gingrLocationId: gingr_location_id || "1",
        locationId: location_id,
        maxRunMs: max_run_ms,
      });

      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (sync_type === "presence-sync") {
      const result = await syncFacilityPresence({
        supabase,
        subdomain,
        apiKey: api_key,
        gingrLocationId: gingr_location_id || "1",
        locationId: location_id,
        source: "gingr-sync:presence-sync",
      });

      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── BOH-DIFF: Ultra-lean server-side BOH transition detection ──────────
    // Single Gingr API call, diffs against boh_snapshot table, returns
    // arrivals/departures grouped by owner. Called every ~10s from the TV page.
    // Replaces direct browser→Gingr polling (which was unreliable due to
    // CORS, browser tab throttling, and missing timeouts).
    if (sync_type === "boh-diff") {
      const startTime = Date.now();

      // 1. Fetch BOH from Gingr (single server-side API call)
      let bohResult: any;
      try {
        bohResult = await gingrFetch(
          subdomain, "back_of_house", api_key, "GET",
          { location_id: gingr_location_id || "1", full_day: "true", include_daycare: "true" }
        );
      } catch (err: any) {
        return new Response(
          JSON.stringify({ success: false, error: "gingr_unavailable", arrivals: [], departures: [], dog_count: 0 }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const active = bohResult?.data?.checking_out || bohResult?.checking_out || [];

      // 2. Build current state map and hash
      const currentMap: Record<string, any> = {};
      const currentIds: string[] = [];
      for (const dog of active) {
        const id = String(dog.id);
        currentMap[id] = dog;
        currentIds.push(id);
      }
      currentIds.sort();
      const currentHash = currentIds.join(",");

      // 3. Read previous snapshot
      const { data: snap } = await supabase
        .from("boh_snapshot")
        .select("snapshot, snapshot_hash")
        .eq("location_id", location_id)
        .maybeSingle();

      const prevHash = snap?.snapshot_hash || "";
      const prevSnapshot: Record<string, any> = snap?.snapshot || {};

      // 4. Fast path: no change
      if (currentHash === prevHash) {
        await supabase
          .from("boh_snapshot")
          .upsert({ location_id, snapshot: currentMap, snapshot_hash: currentHash, dog_count: active.length, updated_at: new Date().toISOString() },
                   { onConflict: "location_id" });

        return new Response(
          JSON.stringify({ success: true, arrivals: [], departures: [], dog_count: active.length, changed: false, duration_ms: Date.now() - startTime }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 5. Diff: compute arrivals and departures
      const classifyType = (t: string) => {
        const s = (t || "").toLowerCase();
        if (s.includes("evaluation")) return "evaluation";
        if (s.includes("day boarding") && !s.includes("daycare")) return "dayboarding";
        if (s.includes("daycare")) return "daycare";
        if (s.includes("boarding")) return "boarding";
        return "boarding";
      };

      const mapDog = (dog: any) => ({
        id: Number(dog.id),
        animalGingrId: String(dog.animal_id || ""),
        animalName: (dog.a_first || "Unknown").trim(),
        ownerLastName: (dog.o_last || "").trim(),
        room: dog.run_name || "",
        resType: classifyType(dog.type),
      });

      const groupByOwner = (dogs: any[]) => {
        const byOwner: Record<string, any[]> = {};
        for (const d of dogs) {
          const key = d.ownerLastName || String(d.id);
          if (!byOwner[key]) byOwner[key] = [];
          byOwner[key].push(d);
        }
        return Object.values(byOwner).map(group => ({
          id: group.map((d: any) => d.id).join("+"),
          dogs: group,
          ownerLastName: group[0].ownerLastName,
        }));
      };

      // Skip diff on first poll (no previous snapshot)
      let arrivals: any[] = [];
      let departures: any[] = [];

      if (prevHash !== "") {
        // Arrivals: in current but not in prev
        for (const id of currentIds) {
          if (!prevSnapshot[id]) arrivals.push(mapDog(currentMap[id]));
        }
        // Departures: in prev but not in current
        for (const id of Object.keys(prevSnapshot)) {
          if (!currentMap[id]) departures.push(mapDog(prevSnapshot[id]));
        }
      }

      const groupedArrivals = groupByOwner(arrivals);
      const groupedDepartures = groupByOwner(departures);

      // 6. Update snapshot
      await supabase
        .from("boh_snapshot")
        .upsert({ location_id, snapshot: currentMap, snapshot_hash: currentHash, dog_count: active.length, updated_at: new Date().toISOString() },
                 { onConflict: "location_id" });

      return new Response(
        JSON.stringify({
          success: true,
          arrivals: groupedArrivals,
          departures: groupedDepartures,
          dog_count: active.length,
          changed: true,
          duration_ms: Date.now() - startTime,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Today-sync: refresh the current room day model without a full sync ──
    // This runs on the 5-minute cron cadence and must keep today's reservations
    // plus yesterday/today/tomorrow room occupancy fresh for downstream
    // room-cleaning, roll call, and room-based operational reports.
    if (sync_type === "today-sync") {
      const startTime = Date.now();
      const results: Record<string, any> = {};

      await updateSyncState(supabase, location_id, "reservations", {
        status: "syncing",
        last_sync_at: new Date().toISOString(),
      });

      try {
        const reservationStart = Date.now();
        results.reservations_today = await syncTodayReservations(
          supabase,
          subdomain,
          api_key,
          location_id,
        );
        await updateSyncState(supabase, location_id, "reservations", {
          status: "idle",
          last_sync_at: new Date().toISOString(),
          records_synced: results.reservations_today.synced || 0,
          sync_duration_ms: Date.now() - reservationStart,
          error_message: null,
        });
      } catch (reservationErr: any) {
        await updateSyncState(supabase, location_id, "reservations", {
          status: "error",
          last_sync_at: new Date().toISOString(),
          error_message: reservationErr.message,
        });
        throw reservationErr;
      }

      await updateSyncState(supabase, location_id, "runs_and_occupancy", {
        status: "syncing",
        last_sync_at: new Date().toISOString(),
      });

      try {
        const occupancyStart = Date.now();
        results.runs_and_occupancy = await syncRunsAndOccupancy(
          supabase,
          subdomain,
          api_key,
          gingr_location_id || "1",
          location_id,
        );
        await updateSyncState(supabase, location_id, "runs_and_occupancy", {
          status: "idle",
          last_sync_at: new Date().toISOString(),
          records_synced: results.runs_and_occupancy.occupancy || 0,
          sync_duration_ms: Date.now() - occupancyStart,
          error_message: null,
        });
      } catch (occupancyErr: any) {
        await updateSyncState(supabase, location_id, "runs_and_occupancy", {
          status: "error",
          last_sync_at: new Date().toISOString(),
          error_message: occupancyErr.message,
        });
        throw occupancyErr;
      }

      return new Response(
        JSON.stringify({
          success: true,
          sync_type: "today-sync",
          location_id,
          duration_ms: Date.now() - startTime,
          results,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── TV-007: Lightweight tv-poll mode ────────────────────────────────────
    // Only fetches checked_in: "true" from Gingr and reconciles checkouts.
    // Called every 60s from the TV page for near-real-time checkout detection.
    if (sync_type === "tv-poll") {
      const startTime = Date.now();
      let checkedOutCount = 0;

      // 0. Sync ALL of today's reservations (catches new bookings, walk-ins, same-day adds)
      let todayResResult = { synced: 0 };
      try {
        todayResResult = await syncTodayReservations(supabase, subdomain, api_key, location_id);
      } catch (todayErr: any) {
        console.error("Today reservations sync error (tv-poll):", todayErr.message);
      }

      // 1. Fetch currently checked-in from Gingr (single API call)
      const checkedInResult = await gingrFetch(subdomain, "reservations", api_key, "POST", {
        checked_in: "true",
      });
      const checkedInMap = checkedInResult.data || {};
      const checkedIn = Object.values(checkedInMap) as any[];

      // 2. Upsert currently checked-in (updates any changed fields)
      if (checkedIn.length > 0) {
        const rows = checkedIn.map((r: any) => mapReservationRow(r, location_id));
        for (let i = 0; i < rows.length; i += 500) {
          const chunk = rows.slice(i, i + 500);
          const { error } = await supabase
            .from("gingr_reservations")
            .upsert(chunk, { onConflict: "location_id,gingr_id" });
          if (error) console.error("tv-poll: failed to upsert checked-in:", error.message);
        }
      }

      // 3. Reconcile: mark dogs that Gingr no longer reports as checked out
      try {
        const { data: supaCheckedIn } = await supabase
          .from("gingr_reservations")
          .select("gingr_id")
          .eq("location_id", location_id)
          .not("check_in_date", "is", null)
          .is("check_out_date", null)
          .is("cancelled_date", null);

        const gingrCheckedInIds = new Set(
          checkedIn.map((r: any) => String(r.reservation_id))
        );
        const staleIds = (supaCheckedIn || [])
          .filter((r: any) => !gingrCheckedInIds.has(r.gingr_id))
          .map((r: any) => r.gingr_id);

        // Safety: skip if Gingr returned 0 but Supabase has 20+
        const isLikelyApiError =
          checkedIn.length === 0 && (supaCheckedIn || []).length > 20;

        if (staleIds.length > 0 && !isLikelyApiError) {
          const nowIso = new Date().toISOString();
          for (let i = 0; i < staleIds.length; i += 100) {
            const chunk = staleIds.slice(i, i + 100);
            const { error } = await supabase
              .from("gingr_reservations")
              .update({ check_out_date: nowIso, synced_at: nowIso })
              .eq("location_id", location_id)
              .in("gingr_id", chunk);
            if (error) console.error("tv-poll: failed to mark checkout:", error.message);
          }
          checkedOutCount = staleIds.length;
        }
      } catch (_) {
        // Non-fatal — reconciliation is best-effort
      }

      // Persist actual room assignments from BOH API
      let roomResult = { assigned: 0, bohDogs: 0 };
      try {
        roomResult = await persistBohRoomAssignments(supabase, subdomain, api_key, gingr_location_id || "1", location_id);
      } catch (roomErr: any) {
        console.error("BOH room sync error (tv-poll):", roomErr.message);
      }

      // Sync animal icons (for Checkout TV classification)
      let iconsResult = { synced: 0, animals: 0 };
      try {
        iconsResult = await syncAnimalIcons(supabase, subdomain, api_key, location_id);
      } catch (iconsErr: any) {
        console.error("Icons sync error (tv-poll):", iconsErr.message);
      }

      return new Response(
        JSON.stringify({
          success: true,
          sync_type: "tv-poll",
          today_reservations_synced: todayResResult.synced,
          checked_in_count: checkedIn.length,
          checked_out_count: checkedOutCount,
          rooms_assigned: roomResult.assigned,
          boh_dogs_in_house: roomResult.bohDogs,
          icons_synced: iconsResult.synced,
          duration_ms: Date.now() - startTime,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: Record<string, any> = {};
    const startTime = Date.now();

    // Determine which entities to sync
    // Full sync: all entities. Incremental: only fast entities that fit within
    // the edge function timeout (~150s). Reservations and owners/animals are too
    // heavy for incremental — they run only on full sync.
    const toSync =
      entities ||
      (sync_type === "full"
        ? ["reservation_types", "immunization_types", "owners", "animals", "reservations", "feeding_schedules", "medications", "invoices", "invoice_payments", "deposits", "runs_and_occupancy", "animal_icons", "animal_icons_all", "animal_photos"]
        : ["feeding_schedules", "medications", "invoices", "invoice_payments", "deposits", "animal_photos"]);

    for (const entity of toSync) {
      await updateSyncState(supabase, location_id, entity, {
        status: "syncing",
        last_sync_at: new Date().toISOString(),
      });

      try {
        switch (entity) {
          case "owners":
            results.owners = await syncOwners(supabase, subdomain, api_key, location_id);
            break;
          case "animals":
            results.animals = await syncAnimals(supabase, subdomain, api_key, location_id);
            break;
          case "reservations":
            results.reservations = await syncReservations(
              supabase,
              subdomain,
              api_key,
              location_id
            );
            break;
          case "reservation_types":
            results.reservation_types = await syncReservationTypes(
              supabase,
              subdomain,
              api_key,
              location_id
            );
            break;
          case "immunization_types":
            results.immunization_types = await syncImmunizationTypes(
              supabase,
              subdomain,
              api_key,
              location_id
            );
            break;
          case "invoices":
            results.invoices = await syncInvoices(
              supabase,
              subdomain,
              api_key,
              location_id,
              sync_type === "full"
            );
            break;
          case "feeding_schedules":
            results.feeding_schedules = await syncFeedingSchedules(
              supabase,
              subdomain,
              api_key,
              location_id
            );
            break;
          case "medications":
            results.medications = await syncMedications(
              supabase,
              subdomain,
              api_key,
              location_id
            );
            break;
          case "invoice_payments":
            results.invoice_payments = await syncInvoicePayments(
              supabase,
              subdomain,
              api_key,
              location_id
            );
            break;
          case "deposits":
            results.deposits = await syncDeposits(
              supabase,
              subdomain,
              api_key,
              location_id
            );
            break;
          case "runs_and_occupancy":
            results.runs_and_occupancy = await syncRunsAndOccupancy(
              supabase,
              subdomain,
              api_key,
              gingr_location_id || "1",
              location_id
            );
            break;
          case "animal_icons":
            results.animal_icons = await syncAnimalIcons(
              supabase,
              subdomain,
              api_key,
              location_id
            );
            break;
          case "animal_icons_all":
            results.animal_icons_all = await syncAllAnimalIcons(
              supabase,
              subdomain,
              api_key,
              location_id
            );
            break;
          case "animal_photos":
            results.animal_photos = await syncAnimalPhotos(
              supabase,
              location_id
            );
            break;
          case "backfill_room_occupancy": {
            // Backfill room occupancy for a date range (default: last 7 days)
            const now = nowET();
            const backfillStart = dateStrET(new Date(now.getTime() - 7 * 86400000));
            const backfillEnd = dateStrET(now);
            results.backfill_room_occupancy = await backfillRoomOccupancy(
              supabase,
              subdomain,
              api_key,
              gingr_location_id || "1",
              location_id,
              backfillStart,
              backfillEnd,
            );
            break;
          }
        }

        await updateSyncState(supabase, location_id, entity, {
          status: "idle",
          records_synced: results[entity]?.synced || 0,
          sync_duration_ms: Date.now() - startTime,
          error_message: null,
        });
      } catch (err: any) {
        await updateSyncState(supabase, location_id, entity, {
          status: "error",
          error_message: err.message,
        });
        results[entity] = { error: err.message };
      }
    }

    // Update full sync timestamp
    if (sync_type === "full") {
      for (const entity of toSync) {
        await updateSyncState(supabase, location_id, entity, {
          last_full_sync_at: new Date().toISOString(),
        });
      }
    }

    // ── Persist actual room assignments from BOH API after sync ─────────────
    try {
      const roomResult = await persistBohRoomAssignments(supabase, subdomain, api_key, gingr_location_id || "1", location_id);
      results["room_assignment"] = roomResult;
    } catch (roomErr: any) {
      console.error("BOH room sync error:", roomErr.message);
      results["room_assignment"] = { error: roomErr.message };
    }

    // ── Recompute dashboard metrics after sync ────────────────────────────
    // Recomputes today + yesterday (catches late checkouts) in pure Postgres.
    // Adds ~100-200ms — negligible compared to the sync itself.
    try {
      const etNow = nowET();
      await supabase.rpc('compute_dashboard_metrics', {
        p_location_id: location_id,
        p_date_from: dateStrET(new Date(etNow.getTime() - 7 * 86400000)),
        p_date_to: dateStrET(etNow),
      });
    } catch (metricsErr: any) {
      // Non-fatal — dashboard metrics recompute is best-effort
      console.error('Dashboard metrics recompute error:', metricsErr.message);
    }

    results["scheduling_matrix"] = {
      deferred: true,
      source: "cron_current_week_plus_future_fanout",
    };

    // ── Compute cash basis metrics from synced invoices + deposits ───────
    // Updates cash_collected_payments, cash_collected_deposits, cash_refunds,
    // cash_net_revenue on dashboard_metrics_daily for today and yesterday.
    try {
      await computeCashBasisMetrics(supabase, location_id, subdomain, api_key);
    } catch (cashErr: any) {
      // Non-fatal — cash basis metrics are best-effort
      console.error('Cash basis metrics error:', cashErr.message);
    }

    const totalDuration = Date.now() - startTime;

    return new Response(
      JSON.stringify({
        success: true,
        sync_type,
        location_id,
        duration_ms: totalDuration,
        results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

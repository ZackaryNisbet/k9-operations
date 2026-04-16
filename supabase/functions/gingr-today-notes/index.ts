import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { gingrFetchV1 } from "../_shared/gingr-operational-details.ts";
import { gingrWebGetJson, gingrWebLogin } from "../_shared/gingr-browser-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ET_TIMEZONE = "America/New_York";
const NOTE_FETCH_CONCURRENCY = 5;

type SubjectKind = "dog" | "owner";

interface GingrCredentials {
  subdomain: string;
  apiKey: string;
}

interface SubjectContext {
  kind: SubjectKind;
  gingrId: string;
  ownerGingrId: string;
  animalGingrId: string;
  name: string;
  dogName: string;
  ownerName: string;
  reservationIds: Set<string>;
  rawReservations: any[];
}

interface SubjectNotesResult {
  subject: SubjectContext;
  rows: any[];
  noteTypes: any[];
  error?: string;
}

function formatEtDate(date: Date) {
  const etDate = new Date(date.toLocaleString("en-US", { timeZone: ET_TIMEZONE }));
  return `${etDate.getFullYear()}-${String(etDate.getMonth() + 1).padStart(2, "0")}-${String(etDate.getDate()).padStart(2, "0")}`;
}

function nowEtDate() {
  return formatEtDate(new Date());
}

function addDaysToDateString(date: string, days: number): string {
  const parsed = new Date(`${date}T12:00:00`);
  parsed.setDate(parsed.getDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function normalizeReservationCollection(result: any): any[] {
  if (Array.isArray(result?.data)) return result.data;
  if (result?.data && typeof result.data === "object") return Object.values(result.data);
  if (Array.isArray(result)) return result;
  return [];
}

function normalizeNoteRows(result: any): any[] {
  if (Array.isArray(result?.data)) return result.data;
  if (result?.data && typeof result.data === "object") return Object.values(result.data);
  if (Array.isArray(result?.notes)) return result.notes;
  if (Array.isArray(result)) return result;
  return [];
}

function normalizeNoteTypes(result: any): any[] {
  if (Array.isArray(result?.note_types)) return result.note_types;
  if (Array.isArray(result?.data?.note_types)) return result.data.note_types;
  return [];
}

function normalizeText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value).trim();
  if (Array.isArray(value)) return value.map(normalizeText).filter(Boolean).join(" ");
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).map(normalizeText).filter(Boolean).join(" ");
  return "";
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized) return normalized;
  }
  return "";
}

function decodeHtmlEntities(value: string): string {
  const namedEntities: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: "\"",
  };

  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    const normalized = String(entity || "").toLowerCase();
    if (normalized.startsWith("#x")) {
      const codePoint = Number.parseInt(normalized.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    if (normalized.startsWith("#")) {
      const codePoint = Number.parseInt(normalized.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return namedEntities[normalized] ?? match;
  });
}

function cleanGingrNoteText(value: unknown): string {
  let text = normalizeText(value);
  if (!text) return "";

  text = text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|li|ul|ol|h[1-6]|blockquote|tr)\s*>/gi, "\n")
    .replace(/<\s*li\b[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, " ");

  text = decodeHtmlEntities(decodeHtmlEntities(text)).replace(/\u00a0/g, " ");

  return text
    .split("\n")
    .map((line) => line
      .replace(/[ \t]+/g, " ")
      .replace(/^\s*(?:>\s*)+/, "")
      .replace(/\s*(?:>\s*)+$/, "")
      .replace(/\s+>\s*(?=[A-Za-z0-9])/g, " ")
      .replace(/\s+>\s*(?=[,.;:!?)]|$)/g, "")
      .trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function bearerToken(req: Request): string {
  const header = req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

async function authenticateRequest(sb: any, req: Request): Promise<{ user: any | null; serviceRole: boolean } | Response> {
  const token = bearerToken(req);
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (serviceRoleKey && token === serviceRoleKey) {
    return { user: null, serviceRole: true };
  }

  if (!token || token.startsWith("sb_")) {
    return jsonResponse({ error: "Authentication is required." }, 401);
  }

  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) {
    return jsonResponse({ error: "Authentication is invalid or expired." }, 401);
  }

  return { user: data.user, serviceRole: false };
}

async function authorizeLocationAccess(sb: any, userId: string, locationId: string): Promise<Response | null> {
  const [profileResult, liteProfileResult, profileLocationsResult] = await Promise.all([
    sb.from("profiles").select("id, role, location_id").eq("id", userId).maybeSingle(),
    sb.from("lite_profiles").select("id, role, location_id, is_active").eq("user_id", userId).eq("is_active", true),
    sb.from("profile_locations").select("location_id").eq("profile_id", userId),
  ]);

  for (const result of [profileResult, liteProfileResult, profileLocationsResult]) {
    if (result?.error) throw result.error;
  }

  const rows = [
    profileResult.data,
    ...(Array.isArray(liteProfileResult.data) ? liteProfileResult.data : []),
  ].filter(Boolean);
  const fullAccessRoles = new Set(["owner", "role_owner", "developer", "enterprise_admin"]);
  if (rows.some((row: any) => fullAccessRoles.has(String(row?.role || "")))) return null;

  const locationIds = new Set<string>();
  for (const row of rows) {
    if (row?.location_id) locationIds.add(String(row.location_id));
  }
  for (const row of profileLocationsResult.data || []) {
    if (row?.location_id) locationIds.add(String(row.location_id));
  }

  if (locationIds.has(String(locationId))) return null;
  return jsonResponse({ error: "You do not have access to this location." }, 403);
}

function buildStableId(parts: string[]) {
  const payload = parts.join("|");
  const bytes = new TextEncoder().encode(payload);
  return crypto.subtle.digest("SHA-256", bytes).then((hash) => {
    const digest = Array.from(new Uint8Array(hash)).slice(0, 10).map((byte) => byte.toString(16).padStart(2, "0")).join("");
    return `gingr_note_${digest}`;
  });
}

function buildSummary(entries: any[]) {
  const ownerCount = entries.filter((entry) => entry.note_source === "owner_note").length;
  const dogCount = entries.filter((entry) => entry.note_source === "dog_note").length;
  return {
    total: entries.length,
    owner_notes: ownerCount,
    dog_notes: dogCount,
  };
}

function reservationIdFromReservation(reservation: any): string {
  const raw = reservation?.raw_data || {};
  return firstText(
    reservation?.reservation_id,
    reservation?.gingr_id,
    raw?.reservation_id,
    raw?.gingr_id,
    raw?.id,
    reservation?.id,
  );
}

function ownerIdFromReservation(reservation: any): string {
  const raw = reservation?.raw_data || {};
  return firstText(
    reservation?.owner?.id,
    reservation?.owner?.owner_id,
    reservation?.owner?.o_id,
    reservation?.owner_id,
    reservation?.owner_gingr_id,
    reservation?.o_id,
    raw?.owner?.id,
    raw?.owner?.owner_id,
    raw?.owner?.o_id,
    raw?.owner_id,
    raw?.owner_gingr_id,
    raw?.o_id,
  );
}

function animalIdFromReservation(reservation: any): string {
  const raw = reservation?.raw_data || {};
  return firstText(
    reservation?.animal?.id,
    reservation?.animal?.animal_id,
    reservation?.animal?.a_id,
    reservation?.animal_id,
    reservation?.animal_gingr_id,
    reservation?.a_id,
    raw?.animal?.id,
    raw?.animal?.animal_id,
    raw?.animal?.a_id,
    raw?.animal_id,
    raw?.animal_gingr_id,
    raw?.a_id,
  );
}

function ownerNameFromReservation(reservation: any): string {
  const raw = reservation?.raw_data || {};
  const firstName = firstText(
    reservation?.owner?.first_name,
    reservation?.owner_first_name,
    raw?.owner?.first_name,
    raw?.owner_first_name,
  );
  const lastName = firstText(
    reservation?.owner?.last_name,
    reservation?.owner_last_name,
    raw?.owner?.last_name,
    raw?.owner_last_name,
  );
  const joinedName = [firstName, lastName].filter(Boolean).join(" ");
  return firstText(
    reservation?.owner?.name,
    reservation?.owner_name,
    reservation?.client_name,
    raw?.owner?.name,
    raw?.owner_name,
    raw?.client_name,
    joinedName,
  );
}

function dogNameFromReservation(reservation: any): string {
  const raw = reservation?.raw_data || {};
  return firstText(
    reservation?.animal?.name,
    reservation?.animal?.animal_name,
    reservation?.animal_name,
    reservation?.dog_name,
    raw?.animal?.name,
    raw?.animal?.animal_name,
    raw?.animal_name,
    raw?.dog_name,
  );
}

function reservationTypeFromReservation(reservation: any): string {
  const raw = reservation?.raw_data || {};
  return firstText(
    reservation?.reservation_type,
    reservation?.reservation_type_name,
    reservation?.type,
    reservation?.type_name,
    raw?.reservation_type,
    raw?.reservation_type_name,
    raw?.type,
    raw?.type_name,
  );
}

function reservationRoomFromReservation(reservation: any): string {
  const raw = reservation?.raw_data || {};
  return firstText(
    reservation?.room_assignment,
    reservation?.room,
    reservation?.run,
    reservation?.run_name,
    reservation?.kennel,
    reservation?.area_name,
    raw?.room_assignment,
    raw?.room,
    raw?.run,
    raw?.run_name,
    raw?.kennel,
    raw?.area_name,
  );
}

function reservationStartDate(reservation: any): string {
  const raw = reservation?.raw_data || {};
  return dateOnlyFromValue(
    reservation?.check_in_date,
    reservation?.check_in_stamp,
    reservation?.start_date,
    reservation?.date_start,
    raw?.check_in_date,
    raw?.check_in_stamp,
    raw?.start_date,
    raw?.date_start,
  );
}

function reservationEndDate(reservation: any): string {
  const raw = reservation?.raw_data || {};
  return dateOnlyFromValue(
    reservation?.check_out_date,
    reservation?.check_out_stamp,
    reservation?.end_date,
    reservation?.date_end,
    raw?.check_out_date,
    raw?.check_out_stamp,
    raw?.end_date,
    raw?.date_end,
  );
}

function reservationCheckInTime(reservation: any): string {
  const raw = reservation?.raw_data || {};
  return timeFromValue(
    reservation?.check_in_time,
    reservation?.check_in_stamp,
    reservation?.start_time,
    raw?.check_in_time,
    raw?.check_in_stamp,
    raw?.start_time,
  );
}

function reservationCheckOutTime(reservation: any): string {
  const raw = reservation?.raw_data || {};
  return timeFromValue(
    reservation?.check_out_time,
    reservation?.check_out_stamp,
    reservation?.end_time,
    raw?.check_out_time,
    raw?.check_out_stamp,
    raw?.end_time,
  );
}

function isDateWithinInclusive(date: string, startDate: string, endDate: string): boolean {
  if (!date) return false;
  if (startDate && date < startDate) return false;
  if (endDate && date > endDate) return false;
  return true;
}

function reservationTouchesDate(reservation: any, date: string): boolean {
  const startDate = reservationStartDate(reservation);
  const endDate = reservationEndDate(reservation) || startDate;
  if (startDate || endDate) return isDateWithinInclusive(date, startDate, endDate);
  return true;
}

function isBoardingReservation(reservation: any, date: string): boolean {
  const type = reservationTypeFromReservation(reservation).toLowerCase();
  const startDate = reservationStartDate(reservation);
  const endDate = reservationEndDate(reservation);
  if (startDate && endDate && endDate > startDate) return true;
  if (type.includes("daycare") || type.includes("day care") || type.includes("evaluation") || type.includes("tour")) return false;
  if (type.includes("boarding") || type.includes("lodging") || type.includes("overnight") || type.includes("suite")) return true;
  return reservationTouchesDate(reservation, date);
}

function mergeReservations(...collections: any[][]): any[] {
  const merged = new Map<string, any>();
  let fallbackIndex = 0;

  for (const collection of collections) {
    for (const reservation of collection || []) {
      const reservationId = reservationIdFromReservation(reservation);
      const fallbackKey = [
        ownerIdFromReservation(reservation),
        animalIdFromReservation(reservation),
        firstText(reservation?.start_date, reservation?.date_start, reservation?.check_in_date),
        firstText(reservation?.end_date, reservation?.date_end, reservation?.check_out_date),
      ].filter(Boolean).join(":");
      const key = reservationId || fallbackKey || `reservation_${fallbackIndex++}`;
      if (!merged.has(key)) merged.set(key, reservation);
    }
  }

  return Array.from(merged.values());
}

function addSubjectContext(
  subjects: Map<string, SubjectContext>,
  kind: SubjectKind,
  gingrId: string,
  ownerGingrId: string,
  animalGingrId: string,
  name: string,
  dogName: string,
  ownerName: string,
  reservationId: string,
  reservation: any,
) {
  if (!gingrId) return;
  const key = `${kind}:${gingrId}`;
  const existing = subjects.get(key);

  if (existing) {
    const placeholderName = existing.kind === "dog" ? "Dog" : "Owner";
    if (reservationId) existing.reservationIds.add(reservationId);
    if ((!existing.name || existing.name === placeholderName) && name && name !== placeholderName) existing.name = name;
    if (!existing.dogName && dogName) existing.dogName = dogName;
    if (!existing.ownerName && ownerName) existing.ownerName = ownerName;
    if (!existing.ownerGingrId && ownerGingrId) existing.ownerGingrId = ownerGingrId;
    if (!existing.animalGingrId && animalGingrId) existing.animalGingrId = animalGingrId;
    existing.rawReservations.push(reservation);
    return;
  }

  subjects.set(key, {
    kind,
    gingrId,
    ownerGingrId,
    animalGingrId,
    name: name || (kind === "dog" ? "Dog" : "Owner"),
    dogName,
    ownerName,
    reservationIds: new Set(reservationId ? [reservationId] : []),
    rawReservations: [reservation],
  });
}

function buildSubjectContexts(reservations: any[]): SubjectContext[] {
  const subjects = new Map<string, SubjectContext>();

  for (const reservation of reservations) {
    const reservationId = reservationIdFromReservation(reservation);
    const ownerId = ownerIdFromReservation(reservation);
    const animalId = animalIdFromReservation(reservation);
    const ownerName = ownerNameFromReservation(reservation);
    const dogName = dogNameFromReservation(reservation);

    addSubjectContext(subjects, "dog", animalId, ownerId, animalId, dogName, dogName, ownerName, reservationId, reservation);
    addSubjectContext(subjects, "owner", ownerId, ownerId, animalId, ownerName, dogName, ownerName, reservationId, reservation);
  }

  return Array.from(subjects.values());
}

function dateFromGingrTimestamp(value: unknown): Date | null {
  const raw = normalizeText(value);
  if (!raw) return null;

  const numeric = Number(raw);
  const date = Number.isFinite(numeric)
    ? new Date(numeric > 1_000_000_000_000 ? numeric : numeric * 1000)
    : new Date(raw);

  return Number.isNaN(date.getTime()) ? null : date;
}

function dateOnlyFromValue(...values: unknown[]): string {
  const raw = firstText(...values);
  if (!raw) return "";
  const direct = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (direct) return direct[1];
  return noteDateOnlyEt(raw);
}

function timeFromValue(...values: unknown[]): string {
  const raw = firstText(...values);
  if (!raw) return "";
  const direct = raw.match(/\b(\d{1,2}:\d{2})(?::\d{2})?\b/);
  if (direct) return direct[1];
  const date = dateFromGingrTimestamp(raw);
  if (!date) return "";
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: ET_TIMEZONE,
  });
}

function noteDateOnlyEt(value: unknown): string {
  const date = dateFromGingrTimestamp(value);
  return date ? formatEtDate(date) : "";
}

function noteCreatedAtIso(value: unknown): string {
  const date = dateFromGingrTimestamp(value);
  return date ? date.toISOString() : "";
}

function buildNoteTypeLookup(noteTypes: any[]): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const noteType of noteTypes || []) {
    const id = firstText(noteType?.id, noteType?.note_type_id);
    const label = firstText(noteType?.type, noteType?.note_type, noteType?.name, noteType?.label);
    if (id && label) lookup.set(id, label);
  }
  return lookup;
}

function normalizeNoteTypeRows(noteTypes: any[], subjectKind: SubjectKind): any[] {
  return (noteTypes || []).map((noteType) => {
    const id = firstText(noteType?.id, noteType?.note_type_id);
    const label = firstText(noteType?.type, noteType?.note_type, noteType?.name, noteType?.label);
    if (!label && !id) return null;
    return {
      id: id || null,
      label: label || id,
      note_type: label || id,
      subject_kind: subjectKind,
      note_source: subjectKind === "owner" ? "owner_note" : "dog_note",
      is_owner_type: subjectKind === "owner",
      is_animal_type: subjectKind === "dog",
    };
  }).filter(Boolean);
}

function mergeNoteTypes(noteResults: SubjectNotesResult[], entries: any[]): any[] {
  const merged = new Map<string, any>();

  for (const result of noteResults || []) {
    for (const noteType of normalizeNoteTypeRows(result.noteTypes, result.subject.kind)) {
      const key = `${noteType.subject_kind}:${noteType.id || noteType.label}`;
      if (!merged.has(key)) merged.set(key, noteType);
    }
  }

  for (const entry of entries || []) {
    const label = firstText(entry?.note_type, entry?.note_title);
    if (!label) continue;
    const key = `${entry.subject_kind}:${entry.note_type_id || label}`;
    if (!merged.has(key)) {
      merged.set(key, {
        id: entry.note_type_id || null,
        label,
        note_type: label,
        subject_kind: entry.subject_kind,
        note_source: entry.note_source,
        is_owner_type: entry.subject_kind === "owner",
        is_animal_type: entry.subject_kind === "dog",
      });
    }
  }

  return Array.from(merged.values());
}

function gingrUrls(subdomain: string, ownerId: string, animalId: string, reservationId: string) {
  const baseUrl = `https://${subdomain}.gingrapp.com`;
  return {
    owner: ownerId ? `${baseUrl}/owners/view/id/${ownerId}` : "",
    animal: animalId ? `${baseUrl}/animals/view/id/${animalId}` : "",
    reservation: reservationId ? `${baseUrl}/reservations/edit/id/${reservationId}` : "",
  };
}

async function fetchSubjectNotes(
  credentials: GingrCredentials,
  cookies: string,
  subject: SubjectContext,
  gingrLocationId: string,
): Promise<SubjectNotesResult> {
  const path = subject.kind === "dog" ? "animals/get_notes" : "owners/get_notes";
  const baseParams = { id: subject.gingrId };

  try {
    const payload = await gingrWebGetJson(credentials.subdomain, cookies, path, {
      ...baseParams,
      location_id: gingrLocationId ? [gingrLocationId] : "0",
    });
    if (payload?.error) throw new Error(normalizeText(payload?.error) || `Gingr returned an error for ${path}.`);
    return {
      subject,
      rows: normalizeNoteRows(payload),
      noteTypes: normalizeNoteTypes(payload),
    };
  } catch (primaryError: any) {
    if (!gingrLocationId) {
      return { subject, rows: [], noteTypes: [], error: primaryError?.message || String(primaryError) };
    }

    try {
      const fallbackPayload = await gingrWebGetJson(credentials.subdomain, cookies, path, {
        ...baseParams,
        location_id: ["0"],
      });
      if (fallbackPayload?.error) throw new Error(normalizeText(fallbackPayload?.error) || `Gingr returned an error for ${path}.`);
      return {
        subject,
        rows: normalizeNoteRows(fallbackPayload),
        noteTypes: normalizeNoteTypes(fallbackPayload),
      };
    } catch (fallbackError: any) {
      return {
        subject,
        rows: [],
        noteTypes: [],
        error: `${primaryError?.message || String(primaryError)}; fallback: ${fallbackError?.message || String(fallbackError)}`,
      };
    }
  }
}

async function buildNoteEntryFromRow(
  locationId: string,
  date: string | null,
  subdomain: string,
  subject: SubjectContext,
  row: any,
  noteTypes: any[],
  source: string,
) {
  const noteText = cleanGingrNoteText(firstText(row?.note, row?.notes, row?.body, row?.text));
  const createdAtRaw = firstText(row?.created_at, row?.date_created, row?.created);
  const noteDate = noteDateOnlyEt(createdAtRaw);

  if (!noteText || !noteDate) return null;
  if (date && noteDate !== date) return null;

  const noteTypeLookup = buildNoteTypeLookup(noteTypes);
  const noteTypeId = firstText(row?.note_type_id, row?.type_id);
  const noteType = firstText(row?.note_type, row?.type, row?.type_name, noteTypeId ? noteTypeLookup.get(noteTypeId) : "");
  const createdAtIso = noteCreatedAtIso(createdAtRaw);
  const reservationIds = Array.from(subject.reservationIds).filter(Boolean);
  const primaryReservationId = reservationIds[0] || "";
  const urls = gingrUrls(subdomain, subject.ownerGingrId, subject.animalGingrId, primaryReservationId);

  return {
    id: await buildStableId([
      String(locationId),
      subject.kind,
      subject.gingrId,
      firstText(row?.id),
      createdAtRaw,
      noteTypeId,
      noteText,
    ]),
    note_source: subject.kind === "owner" ? "owner_note" : "dog_note",
    subject_kind: subject.kind,
    subject_gingr_id: subject.gingrId,
    owner_gingr_id: subject.ownerGingrId || null,
    animal_gingr_id: subject.animalGingrId || null,
    subject_name: subject.name || (subject.kind === "dog" ? "Dog" : "Owner"),
    note_text: noteText,
    note_title: noteType || (subject.kind === "dog" ? "Pet Notes" : "Owner Notes"),
    note_type_id: noteTypeId || null,
    note_type: noteType || null,
    note_date: noteDate,
    note_created_at: createdAtIso || null,
    note_created_at_unix: createdAtRaw || null,
    created_at: createdAtIso || null,
    created_by_gingr_id: firstText(row?.created_by) || null,
    created_by_name: firstText(row?.username, row?.created_by_name) || null,
    reservation_gingr_id: primaryReservationId,
    reservation_gingr_ids: reservationIds,
    dog_name: subject.dogName,
    owner_name: subject.ownerName,
    gingr_urls: urls,
    source,
    raw_data: {
      note: row,
      subject: {
        kind: subject.kind,
        gingr_id: subject.gingrId,
        owner_gingr_id: subject.ownerGingrId,
        animal_gingr_id: subject.animalGingrId,
        name: subject.name,
        dog_name: subject.dogName,
        owner_name: subject.ownerName,
        reservation_gingr_ids: reservationIds,
      },
    },
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(limit, 1), items.length);

  async function worker() {
    while (true) {
      const currentIndex = nextIndex++;
      if (currentIndex >= items.length) return;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

async function resolveLocationConfig(sb: any, requestedLocationId: string) {
  const loadConfig = (locationId: string) => sb
    .from("lite_settings")
    .select("setting_value")
    .eq("location_id", locationId)
    .eq("setting_key", "gingr_config")
    .maybeSingle();

  const direct = await loadConfig(requestedLocationId);
  if (direct.error) throw direct.error;
  if (direct.data?.setting_value) {
    return {
      canonicalLocationId: requestedLocationId,
      gingrConfig: direct.data.setting_value,
    };
  }

  let locationQuery = sb.from("locations").select("id, slug").limit(1);
  locationQuery = isUuid(requestedLocationId)
    ? locationQuery.eq("id", requestedLocationId)
    : locationQuery.eq("slug", requestedLocationId);
  const locationResult = await locationQuery.maybeSingle();
  if (locationResult.error) throw locationResult.error;

  const canonicalLocationId = locationResult.data?.id || requestedLocationId;
  if (canonicalLocationId === requestedLocationId) {
    return {
      canonicalLocationId,
      gingrConfig: {},
    };
  }

  const resolved = await loadConfig(canonicalLocationId);
  if (resolved.error) throw resolved.error;
  return {
    canonicalLocationId,
    gingrConfig: resolved.data?.setting_value || {},
  };
}

function buildReservationSummary(locationId: string, subdomain: string, reservation: any, date: string) {
  const reservationId = reservationIdFromReservation(reservation);
  const ownerId = ownerIdFromReservation(reservation);
  const animalId = animalIdFromReservation(reservation);
  const dogName = dogNameFromReservation(reservation);
  const ownerName = ownerNameFromReservation(reservation);
  const startDate = reservationStartDate(reservation);
  const endDate = reservationEndDate(reservation);
  const urls = gingrUrls(subdomain, ownerId, animalId, reservationId);

  return {
    id: reservationId || `${animalId || ownerId || "reservation"}_${startDate || date}`,
    location_id: locationId,
    reservation_gingr_id: reservationId,
    owner_gingr_id: ownerId || null,
    animal_gingr_id: animalId || null,
    dog_name: dogName,
    owner_name: ownerName,
    subject_name: dogName || ownerName || "Reservation",
    room: reservationRoomFromReservation(reservation),
    reservation_type: reservationTypeFromReservation(reservation),
    check_in_date: startDate,
    check_in_time: reservationCheckInTime(reservation),
    check_out_date: endDate,
    check_out_time: reservationCheckOutTime(reservation),
    is_checkout_today: Boolean(endDate && endDate === date),
    gingr_urls: urls,
  };
}

function noteBelongsToReservation(note: any, reservation: any): boolean {
  const ownerId = ownerIdFromReservation(reservation);
  const animalId = animalIdFromReservation(reservation);
  if (note.subject_kind === "dog" && animalId && String(note.animal_gingr_id || note.subject_gingr_id) === String(animalId)) return true;
  if (note.subject_kind === "owner" && ownerId && String(note.owner_gingr_id || note.subject_gingr_id) === String(ownerId)) return true;
  return false;
}

function buildReservationGroups(locationId: string, subdomain: string, reservations: any[], allEntries: any[], date: string) {
  const boardingReservations = mergeReservations(reservations)
    .filter((reservation) => reservationTouchesDate(reservation, date))
    .filter((reservation) => isBoardingReservation(reservation, date));

  const groups = boardingReservations.map((reservation) => {
    const summary = buildReservationSummary(locationId, subdomain, reservation, date);
    const stayStart = summary.check_in_date || date;
    const stayEnd = summary.check_out_date || date;
    const notes = (allEntries || [])
      .filter((entry) => noteBelongsToReservation(entry, reservation))
      .filter((entry) => isDateWithinInclusive(entry.note_date, stayStart, stayEnd || date))
      .sort((left, right) => String(right.note_created_at || "").localeCompare(String(left.note_created_at || "")));
    return { ...summary, notes, note_count: notes.length };
  });

  const groupsWithNotes = groups
    .filter((group) => group.note_count > 0)
    .sort((left, right) => {
      if (left.is_checkout_today !== right.is_checkout_today) return left.is_checkout_today ? -1 : 1;
      const checkoutComparison = String(left.check_out_date || "").localeCompare(String(right.check_out_date || ""));
      if (checkoutComparison !== 0) return checkoutComparison;
      return String(left.dog_name || "").localeCompare(String(right.dog_name || ""));
    });

  return {
    groups: groupsWithNotes,
    summary: {
      total_reservations: groups.length,
      reservations_with_notes: groupsWithNotes.length,
      reservations_without_notes: Math.max(0, groups.length - groupsWithNotes.length),
      checkout_today_count: groups.filter((group) => group.is_checkout_today).length,
      checkout_today_with_notes: groupsWithNotes.filter((group) => group.is_checkout_today).length,
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { location_id, date = nowEtDate() } = await req.json().catch(() => ({}));
    if (!location_id) {
      return new Response(JSON.stringify({ error: "location_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authResult = await authenticateRequest(sb, req);
    if (authResult instanceof Response) return authResult;

    const requestedLocationId = String(location_id);
    const { canonicalLocationId, gingrConfig } = await resolveLocationConfig(sb, requestedLocationId);
    if (!authResult.serviceRole) {
      const accessError = await authorizeLocationAccess(sb, authResult.user!.id, canonicalLocationId);
      if (accessError) return accessError;
    }

    if (!gingrConfig?.api_key || !gingrConfig?.subdomain) {
      return new Response(JSON.stringify({ error: "Gingr is not configured for this location." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const credentials = {
      subdomain: String(gingrConfig.subdomain),
      apiKey: String(gingrConfig.api_key),
    };
    const gingrLocationId = firstText(gingrConfig.gingr_location_id, "1");
    const isToday = date === nowEtDate();
    const contextStartDate = addDaysToDateString(date, -45);
    const contextEndDate = addDaysToDateString(date, 45);
    const selectedDayStart = `${date}T00:00:00`;
    const selectedDayEndExclusive = `${addDaysToDateString(date, 1)}T00:00:00`;

    const [dateRangeReservationResult, contextReservationResult, checkedInReservationResult] = await Promise.all([
      gingrFetchV1(
        credentials,
        "reservations",
        "POST",
        { start_date: date, end_date: date },
      ),
      gingrFetchV1(
        credentials,
        "reservations",
        "POST",
        { start_date: contextStartDate, end_date: contextEndDate },
      ),
      isToday
        ? gingrFetchV1(
          credentials,
          "reservations",
          "POST",
          { checked_in: "true" },
        )
        : Promise.resolve(null),
    ]);

    const dateRangeReservations = normalizeReservationCollection(dateRangeReservationResult);
    const contextReservations = normalizeReservationCollection(contextReservationResult);
    const checkedInReservations = normalizeReservationCollection(checkedInReservationResult);
    const liveReservations = mergeReservations(dateRangeReservations, contextReservations, checkedInReservations)
      .filter((reservation) => reservationTouchesDate(reservation, date));

    const { data: cachedReservations, error: cachedReservationError } = await sb
      .from("gingr_reservations")
      .select("gingr_id, owner_gingr_id, animal_gingr_id, owner_first_name, owner_last_name, animal_name, reservation_type_id, reservation_type_name, room_assignment, start_date, end_date, check_in_date, check_out_date, raw_data")
      .eq("location_id", canonicalLocationId)
      .or([
        `and(start_date.lt.${selectedDayEndExclusive},end_date.gte.${selectedDayStart})`,
        `and(check_in_date.gte.${selectedDayStart},check_in_date.lt.${selectedDayEndExclusive})`,
        `and(check_out_date.gte.${selectedDayStart},check_out_date.lt.${selectedDayEndExclusive})`,
      ].join(","));

    if (cachedReservationError) throw cachedReservationError;

    const activeReservationPool = mergeReservations(liveReservations, cachedReservations || [])
      .filter((reservation) => reservationTouchesDate(reservation, date));
    const subjectContexts = buildSubjectContexts(activeReservationPool);
    const cookies = subjectContexts.length > 0 ? await gingrWebLogin(credentials.subdomain, credentials.apiKey) : "";
    const noteResults = cookies
      ? await mapWithConcurrency(
        subjectContexts,
        NOTE_FETCH_CONCURRENCY,
        (subject) => fetchSubjectNotes(credentials, cookies, subject, gingrLocationId),
      )
      : [];

    const dailyNoteEntries: any[] = [];
    const allSubjectNoteEntries: any[] = [];
    const noteFetchErrors: any[] = [];
    let rawNoteCount = 0;

    for (const result of noteResults) {
      if (result.error) {
        noteFetchErrors.push({
          subject_kind: result.subject.kind,
          subject_gingr_id: result.subject.gingrId,
          subject_name: result.subject.name,
          error: result.error,
        });
        continue;
      }

      rawNoteCount += result.rows.length;
      for (const row of result.rows) {
        const entry = await buildNoteEntryFromRow(
          canonicalLocationId,
          null,
          credentials.subdomain,
          result.subject,
          row,
          result.noteTypes,
          "gingr_browser_employee_notes",
        );
        if (entry) {
          allSubjectNoteEntries.push(entry);
          if (entry.note_date === date) dailyNoteEntries.push(entry);
        }
      }
    }

    if (subjectContexts.length > 0 && noteResults.length > 0 && noteFetchErrors.length === noteResults.length) {
      throw new Error(`Failed to fetch Gingr notes for all ${noteResults.length} subjects. First error: ${noteFetchErrors[0]?.error || "unknown error"}`);
    }

    const uniqueEntries = Array.from(new Map(dailyNoteEntries.map((entry) => [entry.id, entry])).values())
      .sort((left, right) => {
        const createdComparison = String(right.note_created_at || "").localeCompare(String(left.note_created_at || ""));
        if (createdComparison !== 0) return createdComparison;
        return String(left.subject_name || "").localeCompare(String(right.subject_name || ""));
      });
    const uniqueAllSubjectEntries = Array.from(new Map(allSubjectNoteEntries.map((entry) => [entry.id, entry])).values());
    const reservationGroupResult = buildReservationGroups(canonicalLocationId, credentials.subdomain, activeReservationPool, uniqueAllSubjectEntries, date);
    const noteTypes = mergeNoteTypes(noteResults as SubjectNotesResult[], uniqueEntries);
    const payload = {
      refreshed_at: new Date().toISOString(),
      location_id: canonicalLocationId,
      requested_location_id: requestedLocationId,
      date,
      summary: buildSummary(uniqueEntries),
      note_types: noteTypes,
      reservation_groups: reservationGroupResult.groups,
      reservation_group_summary: reservationGroupResult.summary,
      diagnostics: {
        source: "gingr_browser_employee_notes",
        context_start_date: contextStartDate,
        context_end_date: contextEndDate,
        date_range_reservation_count: dateRangeReservations.length,
        context_reservation_count: contextReservations.length,
        checked_in_reservation_count: checkedInReservations.length,
        live_reservation_count: liveReservations.length,
        cached_reservation_count: (cachedReservations || []).length,
        active_reservation_count: activeReservationPool.length,
        subject_count: subjectContexts.length,
        dog_subject_count: subjectContexts.filter((subject) => subject.kind === "dog").length,
        owner_subject_count: subjectContexts.filter((subject) => subject.kind === "owner").length,
        raw_note_count: rawNoteCount,
        matched_note_count: uniqueEntries.length,
        note_fetch_error_count: noteFetchErrors.length,
        note_fetch_errors: noteFetchErrors.slice(0, 10),
      },
      entries: uniqueEntries,
    };

    const { error: upsertError } = await sb.from("lite_daily_ops").upsert({
      id: `ops_gingr_notes_${canonicalLocationId}_${date}`,
      location_id: canonicalLocationId,
      type: "report",
      type_sub: "gingr_notes",
      date,
      locked: false,
      items: {},
      computed_items: payload,
    }, { onConflict: "id" });

    if (upsertError) throw upsertError;

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("gingr-today-notes error:", error);
    return new Response(JSON.stringify({ error: error.message || "Failed to sync Gingr notes" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

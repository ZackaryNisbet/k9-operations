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
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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
    existing.rawReservations.push(reservation);
    return;
  }

  subjects.set(key, {
    kind,
    gingrId,
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

    addSubjectContext(subjects, "dog", animalId, dogName, dogName, ownerName, reservationId, reservation);
    addSubjectContext(subjects, "owner", ownerId, ownerName, dogName, ownerName, reservationId, reservation);
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
  date: string,
  subject: SubjectContext,
  row: any,
  noteTypes: any[],
  source: string,
) {
  const noteText = cleanGingrNoteText(firstText(row?.note, row?.notes, row?.body, row?.text));
  const createdAtRaw = firstText(row?.created_at, row?.date_created, row?.created);
  const noteDate = noteDateOnlyEt(createdAtRaw);

  if (!noteText || noteDate !== date) return null;

  const noteTypeLookup = buildNoteTypeLookup(noteTypes);
  const noteTypeId = firstText(row?.note_type_id, row?.type_id);
  const noteType = firstText(row?.note_type, row?.type, row?.type_name, noteTypeId ? noteTypeLookup.get(noteTypeId) : "");
  const createdAtIso = noteCreatedAtIso(createdAtRaw);
  const reservationIds = Array.from(subject.reservationIds).filter(Boolean);

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
    subject_name: subject.name || (subject.kind === "dog" ? "Dog" : "Owner"),
    note_text: noteText,
    note_title: noteType || (subject.kind === "dog" ? "Dog Note" : "Owner Note"),
    note_type_id: noteTypeId || null,
    note_type: noteType || null,
    note_date: noteDate,
    note_created_at: createdAtIso || null,
    note_created_at_unix: createdAtRaw || null,
    created_at: createdAtIso || null,
    created_by_gingr_id: firstText(row?.created_by) || null,
    created_by_name: firstText(row?.username, row?.created_by_name) || null,
    reservation_gingr_id: reservationIds[0] || "",
    reservation_gingr_ids: reservationIds,
    dog_name: subject.dogName,
    owner_name: subject.ownerName,
    source,
    raw_data: {
      note: row,
      subject: {
        kind: subject.kind,
        gingr_id: subject.gingrId,
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

    const requestedLocationId = String(location_id);
    const { canonicalLocationId, gingrConfig } = await resolveLocationConfig(sb, requestedLocationId);
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

    const [dateRangeReservationResult, checkedInReservationResult] = await Promise.all([
      gingrFetchV1(
        credentials,
        "reservations",
        "POST",
        { start_date: date, end_date: date },
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
    const checkedInReservations = normalizeReservationCollection(checkedInReservationResult);
    const liveReservations = mergeReservations(dateRangeReservations, checkedInReservations);

    const { data: cachedReservations, error: cachedReservationError } = await sb
      .from("gingr_reservations")
      .select("gingr_id, owner_gingr_id, animal_gingr_id, owner_first_name, owner_last_name, animal_name, start_date, end_date, check_in_date, check_out_date, raw_data")
      .eq("location_id", canonicalLocationId)
      .or(`and(start_date.lte.${date},end_date.gte.${date}),check_in_date.eq.${date},check_out_date.eq.${date}`);

    if (cachedReservationError) throw cachedReservationError;

    const subjectContexts = buildSubjectContexts([...liveReservations, ...(cachedReservations || [])]);
    const cookies = subjectContexts.length > 0 ? await gingrWebLogin(credentials.subdomain, credentials.apiKey) : "";
    const noteResults = cookies
      ? await mapWithConcurrency(
        subjectContexts,
        NOTE_FETCH_CONCURRENCY,
        (subject) => fetchSubjectNotes(credentials, cookies, subject, gingrLocationId),
      )
      : [];

    const noteEntries: any[] = [];
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
          date,
          result.subject,
          row,
          result.noteTypes,
          "gingr_browser_employee_notes",
        );
        if (entry) noteEntries.push(entry);
      }
    }

    if (subjectContexts.length > 0 && noteResults.length > 0 && noteFetchErrors.length === noteResults.length) {
      throw new Error(`Failed to fetch Gingr notes for all ${noteResults.length} subjects. First error: ${noteFetchErrors[0]?.error || "unknown error"}`);
    }

    const uniqueEntries = Array.from(new Map(noteEntries.map((entry) => [entry.id, entry])).values())
      .sort((left, right) => {
        const createdComparison = String(right.note_created_at || "").localeCompare(String(left.note_created_at || ""));
        if (createdComparison !== 0) return createdComparison;
        return String(left.subject_name || "").localeCompare(String(right.subject_name || ""));
      });
    const payload = {
      refreshed_at: new Date().toISOString(),
      location_id: canonicalLocationId,
      requested_location_id: requestedLocationId,
      summary: buildSummary(uniqueEntries),
      diagnostics: {
        source: "gingr_browser_employee_notes",
        date_range_reservation_count: dateRangeReservations.length,
        checked_in_reservation_count: checkedInReservations.length,
        live_reservation_count: liveReservations.length,
        cached_reservation_count: (cachedReservations || []).length,
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

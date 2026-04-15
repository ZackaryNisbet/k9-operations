// ============================================================================
// Ops Compute Edge Function — K9 Operations Lite
// Fetches live Gingr data and computes all daily ops checklist items server-side.
// Upserts into lite_daily_ops.computed_items — NEVER touches the items column.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildManualBathStatusContext,
  buildSuggestedBathStatusContext,
  calculateNights,
  extractBathLikeServices,
  getBathSchedulingForDate,
  isBoardingReservation,
} from "../_shared/bathing-logic.ts";
import {
  fetchLocationIconMappings,
  resolveBathDisplayFromIconRows,
  type GingrAnimalIconRow,
  type GingrIconMappingRow,
} from "../_shared/gingr-icon-mappings.ts";
import { loadRollCallSessionRow } from "../_shared/roll-call-logic.ts";
import {
  buildPlaygroupAssignmentMap,
  fetchPlaygroupAssignments,
  getCanonicalPlaygroupTags,
  getOperationalPlaygroupKey,
} from "../_shared/playgroup-assignments.ts";
import { buildRoomCleaningPayload } from "../_shared/room-cleaning.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Module-level playgroup map — populated in serve handler before reports run
let _globalPlaygroupMap: Record<string, string> = {};
let _globalGingrIconMappings: GingrIconMappingRow[] = [];

// Get size category from Gingr playgroup icons ONLY — no weight fallback
function getSizeCategory(animalGingrId: string, _weight: number | null): string | null {
  const pg = _globalPlaygroupMap[animalGingrId];
  if (pg === 'large') return 'LG';
  if (pg === 'small') return 'SM';
  if (pg === 'private_play') return 'PP';
  if (pg === 'evaluation') return 'EVAL';
  return null;
}

// ─── Constants ─────────────────────────────────────────────────────────────
// Gingr credentials are now loaded dynamically per location from k9_gingr_credentials

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// ─── Default checklist templates (from src/shared/theme.js) ────────────────

const DEF_OPENING_TEMPLATE = [
  { id: "o1", label: "Check security cameras", time: "06:00" },
  { id: "o2", label: "Unlock front doors", time: "06:00" },
  { id: "o3", label: "Turn on all lights", time: "06:15" },
  { id: "o4", label: "Check HVAC systems", time: "06:15" },
  { id: "o5", label: "Review overnight camera footage", time: "06:30" },
  {
    id: "o6",
    label: "Check on all boarding dogs - water, food, bedding",
    time: "06:30",
  },
  { id: "o7", label: "Prepare daycare play areas", time: "06:45" },
  {
    id: "o8",
    label: "Review today's reservations and schedule",
    time: "07:00",
  },
  { id: "o9", label: "Prepare check-in packets", time: "07:00" },
  { id: "o10", label: "Open register / POS", time: "07:00" },
];

const DEF_FE_TEMPLATE = [
  {
    id: "fe1",
    label: "Wipe down front desk and lobby surfaces",
    time: "08:00",
  },
  { id: "fe2", label: "Restock retail display", time: "08:30" },
  { id: "fe3", label: "Check bathroom supplies", time: "09:00" },
  { id: "fe4", label: "Process morning check-ins", time: "09:00" },
  { id: "fe5", label: "Confirm afternoon appointments", time: "10:00" },
  { id: "fe6", label: "Process package sales and payments", time: "11:00" },
  { id: "fe7", label: "Lunch coverage handoff", time: "12:00" },
  { id: "fe8", label: "Wednesday: Update social media", dayOfWeek: 3 },
  { id: "fe9", label: "Friday: Print weekend schedules", dayOfWeek: 5 },
];

const DEF_BE_TEMPLATE = [
  { id: "be1", label: "Morning feeding - breakfast", time: "07:00" },
  { id: "be2", label: "Administer morning medications", time: "07:30" },
  { id: "be3", label: "Move daycare dogs to play areas", time: "08:00" },
  { id: "be4", label: "First private play sessions", time: "09:00" },
  { id: "be5", label: "Mid-morning enrichment activities", time: "10:00" },
  { id: "be6", label: "Noon feeding", time: "12:00" },
  { id: "be7", label: "Afternoon medications", time: "12:30" },
  { id: "be8", label: "Afternoon private play sessions", time: "14:00" },
  { id: "be9", label: "Evening feeding - dinner", time: "17:00" },
  { id: "be10", label: "Final medications check", time: "17:30" },
];

const DEF_CLOSING_TEMPLATE = [
  { id: "ct1", label: "Complete all pending check-outs" },
  { id: "ct2", label: "Run end-of-day financial report" },
  { id: "ct3", label: "Ensure all dogs have fresh water" },
  { id: "ct4", label: "Final room inspection - all dogs settled" },
  { id: "ct5", label: "Clean and sanitize all play areas" },
  { id: "ct6", label: "Restock supplies for tomorrow" },
  { id: "ct7", label: "Lock all medication cabinets" },
  { id: "ct8", label: "Set up overnight camera monitoring" },
  { id: "ct9", label: "Process any pending payments" },
  { id: "ct10", label: "Lock appropriate exterior doors" },
  { id: "ct11", label: "Set alarm and lock front doors" },
];

// ─── Gingr API helper (matches gingr-sync pattern) ────────────────────────

async function gingrFetch(
  subdomain: string,
  apiKey: string,
  endpoint: string,
  method: "GET" | "POST" = "GET",
  body?: Record<string, string>,
): Promise<any> {
  const baseUrl = `https://${subdomain}.gingrapp.com/api/v1/${endpoint}`;

  let resp: Response;
  if (method === "POST") {
    const params = new URLSearchParams();
    params.append("key", apiKey);
    if (body) {
      for (const [k, v] of Object.entries(body)) {
        params.append(k, v);
      }
    }
    resp = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
      },
      body: params.toString(),
    });
  } else {
    const sep = baseUrl.includes("?") ? "&" : "?";
    const params = new URLSearchParams({ key: apiKey });
    if (body) {
      for (const [k, v] of Object.entries(body)) {
        params.append(k, v);
      }
    }
    resp = await fetch(`${baseUrl}${sep}${params.toString()}`);
  }

  if (!resp.ok) {
    throw new Error(`Gingr API error ${resp.status}: ${await resp.text()}`);
  }
  return resp.json();
}

// ─── Gingr Web Session Auth (for service-level notes) ─────────────────────

const GINGR_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Extract individual Set-Cookie headers from a response.
 * Uses getSetCookie() in Deno, with fallback for other runtimes.
 */
function extractSetCookies(resp: Response): string[] {
  if (typeof resp.headers.getSetCookie === "function") {
    return resp.headers.getSetCookie();
  }
  const raw = resp.headers.get("set-cookie") || "";
  return raw ? raw.split(/,\s*(?=[a-zA-Z_]+=)/) : [];
}

/**
 * Find a named cookie value from an array of Set-Cookie header strings.
 */
function parseCookieValue(cookieHeaders: string[], name: string): string {
  for (const h of cookieHeaders) {
    const match = h.match(new RegExp(`${name}=([^;]+)`));
    if (match) return match[1];
  }
  return "";
}

/**
 * Authenticate to Gingr's web interface using the API key as both
 * username and password. Returns the cookie string for authenticated requests.
 */
async function gingrWebLogin(subdomain: string, apiKey: string): Promise<string> {
  const baseUrl = `https://${subdomain}.gingrapp.com`;

  // Step 1: GET /auth/login to get CSRF token and session cookie
  const loginPageResp = await fetch(`${baseUrl}/auth/login`, { redirect: "manual", headers: { "User-Agent": GINGR_UA } });
  const step1Cookies = extractSetCookies(loginPageResp);
  const loginHtml = await loginPageResp.text();

  const sessionVal = parseCookieValue(step1Cookies, "gingr_ci_session");
  const csrfCookieVal = parseCookieValue(step1Cookies, "gingr_csrf_cookie_name");
  const csrfMatch = loginHtml.match(/name="gingr_csrf_token"\s+value="([^"]+)"/);
  const csrfToken = csrfMatch?.[1] || "";

  if (!csrfToken || !sessionVal) {
    throw new Error("Failed to extract CSRF token or session cookie from Gingr login page");
  }

  // Step 2: POST /auth/login with API key as both identity and password
  const cookieHeader = [`gingr_ci_session=${sessionVal}`, csrfCookieVal ? `gingr_csrf_cookie_name=${csrfCookieVal}` : ""].filter(Boolean).join("; ");
  const loginResp = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cookie": cookieHeader,
      "User-Agent": GINGR_UA,
    },
    body: `identity=${encodeURIComponent(apiKey)}&password=${encodeURIComponent(apiKey)}&gingr_csrf_token=${encodeURIComponent(csrfToken)}`,
    redirect: "manual",
  });

  const step2Cookies = extractSetCookies(loginResp);

  // Use the LAST gingr_ci_session cookie (CodeIgniter sends an empty one first, then the authenticated one)
  let authSessionVal = "";
  for (const h of step2Cookies) {
    const m = h.match(/gingr_ci_session=([^;]+)/);
    if (m) authSessionVal = m[1];
  }
  const authCsrfVal = parseCookieValue(step2Cookies, "gingr_csrf_cookie_name");

  const parts: string[] = [];
  if (authSessionVal || sessionVal) parts.push(`gingr_ci_session=${authSessionVal || sessionVal}`);
  if (authCsrfVal || csrfCookieVal) parts.push(`gingr_csrf_cookie_name=${authCsrfVal || csrfCookieVal}`);
  parts.push(`gingr_subdomain=${subdomain}`);

  return parts.join("; ");
}

/**
 * Fetch service-level notes from Gingr web interface for a given service ID.
 * Parses the `var services = [...]` JS variable from the HTML response.
 */
async function fetchServiceNotes(subdomain: string, cookies: string, serviceId: string): Promise<string | null> {
  try {
    const resp = await fetch(`https://${subdomain}.gingrapp.com/services/edit/id/${serviceId}`, {
      headers: { "Cookie": cookies, "User-Agent": GINGR_UA },
      redirect: "manual",
    });
    if (resp.status === 302 || resp.status === 301) {
      return null;
    }
    const html = await resp.text();
    const match = html.match(/var services\s*=\s*(\[.*?\]);/s);
    if (match) {
      const services = JSON.parse(match[1]);
      return services[0]?.notes || null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch service notes for multiple service IDs in parallel with concurrency limit.
 */
async function fetchAllServiceNotes(
  subdomain: string,
  cookies: string,
  serviceIds: Array<{ index: number; serviceId: string }>,
  concurrency: number = 5,
): Promise<Record<number, string | null>> {
  const results: Record<number, string | null> = {};
  const queue = [...serviceIds];

  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      results[item.index] = await fetchServiceNotes(subdomain, cookies, item.serviceId);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Fetch lodging transfer report from Gingr web interface.
 * Scrapes /reports/run_transfer?date=MM/DD/YYYY for transfer data.
 * Returns array of { animalName, ownerName, fromRoom, toRoom }.
 */
async function fetchLodgingTransferReport(
  subdomain: string,
  cookies: string,
  targetDate: string, // YYYY-MM-DD
): Promise<Array<{ animalName: string; ownerName: string; fromRoom: string; toRoom: string }>> {
  try {
    // Convert YYYY-MM-DD to MM/DD/YYYY
    const [y, m, d] = targetDate.split("-");
    const dateParam = `${m}/${d}/${y}`;
    const url = `https://${subdomain}.gingrapp.com/reports/run_transfer?date=${dateParam}`;
    const resp = await fetch(url, {
      headers: { "Cookie": cookies, "User-Agent": GINGR_UA },
      redirect: "manual",
    });
    if (resp.status === 302 || resp.status === 301) {
      console.error("Lodging transfer report: redirected (auth expired)");
      return [];
    }
    const html = await resp.text();

    // Parse the HTML table rows for transfer data
    // The report table has rows with: Animal Name, Owner, From Room, To Room, Date/Time
    const transfers: Array<{ animalName: string; ownerName: string; fromRoom: string; toRoom: string }> = [];

    // Match table rows (Gingr uses standard HTML tables for reports)
    // Each <tr> in the report body contains <td> cells
    const rowRegex = /<tr[^>]*class="[^"]*data[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    while ((rowMatch = rowRegex.exec(html)) !== null) {
      const cells: string[] = [];
      const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      let cellMatch;
      while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
        cells.push(cellMatch[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim());
      }
      if (cells.length >= 4) {
        transfers.push({
          animalName: cells[0] || "",
          ownerName: cells[1] || "",
          fromRoom: cells[2] || "",
          toRoom: cells[3] || "",
        });
      }
    }

    // Fallback: try matching any table rows if the class-based match found nothing
    if (transfers.length === 0) {
      const allRowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      const rows: string[][] = [];
      let arMatch;
      while ((arMatch = allRowRegex.exec(html)) !== null) {
        const cells: string[] = [];
        const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
        let cMatch;
        while ((cMatch = cellRegex.exec(arMatch[1])) !== null) {
          cells.push(cMatch[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim());
        }
        if (cells.length >= 4) rows.push(cells);
      }
      // Skip header row if present, take data rows
      for (const cells of rows) {
        // Skip header rows (contain "Animal", "From", "To" etc.)
        if (cells[0].toLowerCase().includes("animal") || cells[0].toLowerCase().includes("pet")) continue;
        if (!cells[0] || !cells[2] || !cells[3]) continue;
        transfers.push({
          animalName: cells[0],
          ownerName: cells[1] || "",
          fromRoom: cells[2],
          toRoom: cells[3],
        });
      }
    }

    console.log(`Lodging transfer report for ${targetDate}: ${transfers.length} transfers found`);
    return transfers;
  } catch (err) {
    console.error("Lodging transfer report fetch error:", err);
    return [];
  }
}

// ─── Date helpers ──────────────────────────────────────────────────────────

// Edge functions run in UTC. All date-sensitive operations must use ET.
function nowET(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
}

function todayStr(): string {
  const d = nowET();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dateToStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getDayOfWeek(dateStr: string): number {
  return new Date(dateStr + "T12:00:00").getDay();
}

/** Get Monday of the week containing dateStr (ISO week starts Monday). */
function getWeekMonday(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? 6 : day - 1; // days since Monday
  d.setDate(d.getDate() - diff);
  return dateToStr(d);
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return dateToStr(d);
}

// ─── Upsert helper ────────────────────────────────────────────────────────

async function upsertComputedItems(
  supabase: any,
  id: string,
  locationId: string,
  type: string,
  typeSub: string,
  date: string,
  computedItems: any,
): Promise<void> {
  const now = new Date().toISOString();

  // Upsert computed_items only — never touch the items column.
  // Primary key is (id) so conflict target is just "id".
  const { error } = await supabase
    .from("lite_daily_ops")
    .upsert(
      {
        id,
        location_id: locationId,
        type,
        type_sub: typeSub,
        date,
        computed_items: computedItems,
        computed_at: now,
      },
      { onConflict: "id", ignoreDuplicates: false },
    );

  if (error) {
    console.error(`Upsert error for ${id}:`, error.message);
    throw new Error(`Upsert failed for ${id}: ${error.message}`);
  }
}

// ─── Template loader ──────────────────────────────────────────────────────

async function loadTemplate(
  supabase: any,
  locationId: string,
  templateType: string,
  fallback: any[],
): Promise<any[]> {
  const { data } = await supabase
    .from("lite_checklist_templates")
    .select("items")
    .eq("location_id", locationId)
    .eq("template_type", templateType)
    .limit(1);

  if (data && data.length > 0 && Array.isArray(data[0].items)) {
    return data[0].items;
  }
  return fallback;
}

// ─── 1. Room Cleaning ─────────────────────────────────────────────────────

async function computeRoomCleaning(supabase: any, bohData: any, locationId: string, today: string): Promise<any> {
  const previousDate = new Date(`${today}T12:00:00`);
  previousDate.setDate(previousDate.getDate() - 1);
  const nextDate = new Date(`${today}T12:00:00`);
  nextDate.setDate(nextDate.getDate() + 1);
  const previousDateKey = previousDate.toISOString().slice(0, 10);
  const nextDateKey = nextDate.toISOString().slice(0, 10);
  const [{ data: gingrRuns }, { data: roomOccupancy }, { data: reservationRows }] =
    await Promise.all([
      supabase
        .from("gingr_runs")
        .select("gingr_run_id, run_name, area_name, run_type")
        .eq("location_id", locationId),
      supabase
        .from("gingr_room_occupancy")
        .select("gingr_run_id, run_name, area_name, occupancy_date, animal_names, occupied, end_date")
        .eq("location_id", locationId)
        .in("occupancy_date", [previousDateKey, today, nextDateKey]),
      supabase
        .from("gingr_reservations")
        .select(
          "gingr_id, animal_gingr_id, animal_name, owner_first_name, owner_last_name, reservation_type_name, start_date, end_date, check_in_date, check_out_date, cancelled_date, raw_data, room_assignment",
        )
        .eq("location_id", locationId)
        .is("cancelled_date", null)
        .lte("start_date", `${today}T23:59:59`)
        .gte("end_date", `${today}T00:00:00`),
    ]);

  let runs = (gingrRuns || []).map((run: any) => ({
    gingr_run_id: run.gingr_run_id,
    run_name: run.run_name,
    area_name: run.area_name,
    run_type: run.run_type,
  }));

  if (runs.length === 0) {
    const { data: roomNamesSetting } = await supabase
      .from("lite_settings")
      .select("setting_value")
      .eq("location_id", locationId)
      .eq("setting_key", "room_names")
      .maybeSingle();

    const roomNamesConfig: Record<string, string[]> = roomNamesSetting?.setting_value || {};
    runs = Object.entries(roomNamesConfig).flatMap(([roomType, roomList]) =>
      Array.isArray(roomList)
        ? roomList.map((roomName) => ({
          gingr_run_id: null,
          run_name: roomName,
          area_name: roomType,
          run_type: roomType,
        }))
        : []
    );
  }

  const checkingOut = bohData?.data?.checking_out || [];
  const checkingIn = bohData?.data?.checking_in || [];
  const allAnimalIds = [
    ...new Set(
      [
        ...(reservationRows || []).map((row: any) => String(row.animal_gingr_id || "")).filter(Boolean),
        ...[...checkingOut, ...checkingIn].map((dog: any) => String(dog.animal_id || dog.id || "")).filter(Boolean),
      ],
    ),
  ];

  const animalMetaMap: Record<string, { weight: number | null; photoUrl: string | null }> = {};
  if (allAnimalIds.length > 0) {
    const { data: animals } = await supabase
      .from("gingr_animals")
      .select("gingr_id, weight, image_url")
      .in("gingr_id", allAnimalIds);

    for (const animal of animals || []) {
      const parsedWeight = animal.weight == null ? null : parseFloat(String(animal.weight));
      animalMetaMap[String(animal.gingr_id)] = {
        weight: Number.isFinite(parsedWeight) ? parsedWeight : null,
        photoUrl: animal.image_url || null,
      };
    }
  }

  return buildRoomCleaningPayload({
    date: today,
    runs,
    occupancyRows: roomOccupancy || [],
    bohDogs: [...checkingOut, ...checkingIn],
    reservations: (reservationRows || []).map((row: any) => {
      const animalId = String(row.animal_gingr_id || "");
      const meta = animalMetaMap[animalId] || { weight: null, photoUrl: null };
      return {
        reservation_id: String(row.gingr_id || ""),
        animal_id: animalId,
        animal_name: row.animal_name || "",
        owner_first_name: row.owner_first_name || "",
        owner_last_name: row.owner_last_name || "",
        reservation_type_name: row.reservation_type_name || "",
        start_date: row.start_date,
        end_date: row.end_date,
        check_in_date: row.check_in_date,
        check_out_date: row.check_out_date,
        cancelled_date: row.cancelled_date,
        raw_data: row.raw_data || null,
        room_assignment: row.room_assignment || null,
        photo_url: meta.photoUrl,
        dog_weight: meta.weight,
      };
    }),
  });
}

// ─── 2. Private Play ──────────────────────────────────────────────────────

interface PPDog {
  gingrReservationId: string;
  animalId: string;
  animalName: string;
  ownerName: string;
  reservationType: string;
  requiredSessions: number;
  source: string;
  isCheckedIn: boolean;
  startDate: string;
  startTime: string;
  roomLabel: string;
  weight: number | null;
  sizeCategory: string | null;
  animalGingrId: string;
  breed: string;
}

async function computePrivatePlay(
  supabase: any,
  locationId: string,
  targetDate: string,
  reservations: Record<string, any>,
  weightMap: Record<string, number | null>,
  breedMap: Record<string, string>,
): Promise<any> {
  const dogs: PPDog[] = [];
  const seenAnimalIds = new Set<string>();
  const seenReservationIds = new Set<string>();

  for (const [reservationKey, res] of Object.entries(reservations)) {
    const gingrReservationId = String(
      res.gingrReservationId || res.gingr_id || reservationKey || "",
    ).trim();
    const animalId = String(res.animal?.id || "");
    const animalGingrId = String(res.animalGingrId || res.animal?.id || "");
    const animalName = res.animal?.name || "";
    const ownerFirst = res.owner?.first_name || "";
    const ownerLast = res.owner?.last_name || "";
    const ownerName = `${ownerFirst} ${ownerLast}`.trim();
    const resType = res.reservation_type?.type || "";

    // Day boarding dogs get PP
    const isDayBoarding = resType.toLowerCase().startsWith("day boarding");
    const hasCanonicalPrivatePlay = _globalPlaygroupMap[animalGingrId] === "private_play";

    // Legacy fallback: keep service-name matching only when no canonical icon mapping exists yet.
    const services = res.services || [];
    const hasPPService = services.some((s: any) =>
      (s.name || s.service_name || "").toLowerCase().includes("private play"),
    );
    const hasPP = hasCanonicalPrivatePlay || hasPPService;

    if ((isDayBoarding || hasPP) && animalId && !seenAnimalIds.has(animalId)) {
      seenAnimalIds.add(animalId);
      if (gingrReservationId) seenReservationIds.add(gingrReservationId);
      // Support both Gingr API format and DB-mapped format
      const isCheckedIn = (res.checkInDate != null) || (res.check_in_date != null);
      const startDate = res.startDate || res.start_date || "";
      const startTime = formatTimeHuman(startDate);
      const roomLabel = res.roomLabel || res.room?.name || "";
      const weight = weightMap[animalGingrId] ?? null;
      const sizeCategory = getSizeCategory(animalGingrId, weight);
      const breed = breedMap[animalGingrId] || res.breed || res.animal?.breed || "";

      dogs.push({
        gingrReservationId,
        animalId,
        animalName,
        ownerName,
        reservationType: resType,
        requiredSessions: 3,
        source: isDayBoarding
          ? "day_boarding"
          : hasCanonicalPrivatePlay
            ? "private_play_icon"
            : "private_play_service",
        isCheckedIn,
        startDate,
        startTime,
        roomLabel,
        weight,
        sizeCategory,
        animalGingrId,
        breed,
      });
    }
  }

  const { data: manualOverrideRows } = await supabase
    .from("ops_private_play_manual_overrides")
    .select("gingr_reservation_id, animal_gingr_id, room_label_override")
    .eq("location_id", locationId)
    .eq("override_date", targetDate)
    .is("removed_at", null);

  for (const override of (manualOverrideRows || [])) {
    const gingrReservationId = String(override.gingr_reservation_id || "").trim();
    if (!gingrReservationId || seenReservationIds.has(gingrReservationId)) continue;

    const reservation = reservations[gingrReservationId];
    if (!reservation) continue;

    const animalId = String(reservation.animal?.id || "").trim();
    const animalGingrId = String(
      override.animal_gingr_id || reservation.animalGingrId || reservation.animal?.id || "",
    ).trim();
    if (!animalId || seenAnimalIds.has(animalId)) continue;

    const ownerFirst = reservation.owner?.first_name || "";
    const ownerLast = reservation.owner?.last_name || "";
    const ownerName = `${ownerFirst} ${ownerLast}`.trim();
    const startDate = reservation.startDate || reservation.start_date || "";
    const startTime = formatTimeHuman(startDate);
    const roomLabel = String(override.room_label_override || "").trim()
      || reservation.roomLabel
      || reservation.room?.name
      || "";
    const weight = weightMap[animalGingrId] ?? null;
    const sizeCategory = getSizeCategory(animalGingrId, weight);
    const breed = breedMap[animalGingrId] || reservation.breed || reservation.animal?.breed || "";

    seenAnimalIds.add(animalId);
    seenReservationIds.add(gingrReservationId);
    dogs.push({
      gingrReservationId,
      animalId,
      animalName: reservation.animal?.name || "",
      ownerName,
      reservationType: reservation.reservation_type?.type || "",
      requiredSessions: 3,
      source: "manual_override",
      isCheckedIn: (reservation.checkInDate != null) || (reservation.check_in_date != null),
      startDate,
      startTime,
      roomLabel,
      weight,
      sizeCategory,
      animalGingrId,
      breed,
    });
  }

  // Sort by name
  dogs.sort((a, b) => a.animalName.localeCompare(b.animalName));

  return {
    dogs,
    summary: {
      totalDogs: dogs.length,
      requiredSessions: dogs.length * 3,
    },
  };
}

// ─── 3-6. Static checklists (opening, FE, BE, closing) ───────────────────

function filterByDayOfWeek(items: any[], today: string): any[] {
  const dow = getDayOfWeek(today);
  return items.filter((item) => {
    // If dayOfWeek is null/undefined, always show
    if (item.dayOfWeek === null || item.dayOfWeek === undefined) return true;
    return item.dayOfWeek === dow;
  });
}

// ─── 7. Weekly Maintenance ────────────────────────────────────────────────

async function computeWeeklyMaintenance(
  supabase: any,
  locationId: string,
  today: string,
): Promise<any> {
  // Load weekly maintenance template
  const template = await loadTemplate(
    supabase,
    locationId,
    "weekly_maintenance",
    [],
  );

  if (template.length === 0) {
    return { tasks: [], weekGrid: {}, summary: { todayTotal: 0, carryoverCount: 0 } };
  }

  const todayDow = getDayOfWeek(today); // 0=Sun
  const monday = getWeekMonday(today);

  // Build week grid: for each day Mon–Sun, which tasks are scheduled
  const weekGrid: Record<string, string[]> = {};
  for (let i = 0; i < 7; i++) {
    const dayDate = addDays(monday, i);
    const dayDow = getDayOfWeek(dayDate);
    const scheduled = template
      .filter(
        (t: any) =>
          t.active !== false &&
          Array.isArray(t.scheduledDays) &&
          t.scheduledDays.includes(dayDow),
      )
      .map((t: any) => t.id);
    weekGrid[dayDate] = scheduled;
  }

  // Today's scheduled tasks
  const todayScheduledIds = new Set(
    template
      .filter(
        (t: any) =>
          t.active !== false &&
          Array.isArray(t.scheduledDays) &&
          t.scheduledDays.includes(todayDow),
      )
      .map((t: any) => t.id),
  );

  const todayTasks: any[] = template
    .filter((t: any) => todayScheduledIds.has(t.id))
    .map((t: any) => ({
      id: t.id,
      label: t.label,
      supplies: t.supplies || "",
      isCarryover: false,
    }));

  // Carryover logic: check each day from Monday through yesterday
  const carryoverTasks: any[] = [];
  const carryoverSeen = new Set<string>();

  // Get days from Monday to yesterday
  const daysToCheck: string[] = [];
  let d = monday;
  while (d < today) {
    daysToCheck.push(d);
    d = addDays(d, 1);
  }

  // Batch fetch all prior days' ops entries for this week
  const priorIds = daysToCheck.map(
    (dd) => `ops_weekly_maintenance_${dd}`,
  );

  let priorOps: any[] = [];
  if (priorIds.length > 0) {
    const { data } = await supabase
      .from("lite_daily_ops")
      .select("id, items")
      .eq("location_id", locationId)
      .in("id", priorIds);
    priorOps = data || [];
  }

  const priorOpsMap = new Map<string, any>();
  for (const op of priorOps) {
    priorOpsMap.set(op.id, op);
  }

  for (const checkDate of daysToCheck) {
    const checkDow = getDayOfWeek(checkDate);
    const scheduledThatDay = template.filter(
      (t: any) =>
        t.active !== false &&
        Array.isArray(t.scheduledDays) &&
        t.scheduledDays.includes(checkDow),
    );

    if (scheduledThatDay.length === 0) continue;

    // Look up if items were completed
    const opsId = `ops_weekly_maintenance_${checkDate}`;
    const opsEntry = priorOpsMap.get(opsId);
    const completedItems = opsEntry?.items || {};

    for (const task of scheduledThatDay) {
      // Skip if already carried over
      if (carryoverSeen.has(task.id)) continue;

      // CRITICAL DEDUP: If this task is also scheduled for today, do NOT carry over
      if (todayScheduledIds.has(task.id)) continue;

      // Check completion — items is typically { [taskId]: { done: true, ... } }
      const itemEntry = completedItems[task.id];
      const isCompleted =
        itemEntry?.done === true || itemEntry?.completed === true;

      if (!isCompleted) {
        carryoverSeen.add(task.id);
        carryoverTasks.push({
          id: task.id,
          label: task.label,
          supplies: task.supplies || "",
          isCarryover: true,
          fromDay: DAY_NAMES[checkDow],
        });
      }
    }
  }

  const allTasks = [...todayTasks, ...carryoverTasks];

  return {
    tasks: allTasks,
    weekGrid,
    summary: {
      todayTotal: allTasks.length,
      carryoverCount: carryoverTasks.length,
    },
  };
}

// ─── 8. Bathing Report ────────────────────────────────────────────────────

// Known bath type add-ons from reservation services
const BATH_TYPE_ADDONS = new Set([
  "Premium", "Medicated", "Whitening", "Shampoo From Home",
  "Hypoallergenic - NO SPRAY", "Hypoallergenic - WITH SPRAY",
]);
// Known bath modifier add-ons (instructions, not a type)
const BATH_MODIFIER_ADDONS = new Set([
  "NO DRYER", "NO CRATE DRYER", "NO VELOCITY DRYER", "TOWEL DRY ONLY", "*See account notes*",
]);

function extractBathTypeFromName(svcName: string): string | null {
  if (!svcName) return null;
  const l = svcName.toLowerCase();
  if (l.includes("premium")) return "Premium";
  if (l.includes("medicated")) return "Medicated";
  if (l.includes("whitening")) return "Whitening";
  if (l.includes("shampoo from home")) return "Shampoo From Home";
  if (l.includes("fresh n clean") || l.includes("fresh & clean")) return "Fresh N Clean";
  if (l.includes("water rinse")) return "Water Rinse";
  if (l.includes("hypo") && l.includes("no spray")) return "Hypoallergenic - NO SPRAY";
  if (l.includes("hypo") && l.includes("with spray")) return "Hypoallergenic - WITH SPRAY";
  if (l.includes("hypo")) return "Hypoallergenic";
  return null;
}

function parseBathAddonsFromServices(svcs: any[]): { addonType: string | null; modifiers: string[] } {
  let addonType: string | null = null;
  const modifiers: string[] = [];
  for (const svc of svcs) {
    const n = typeof svc === "string" ? svc : svc?.name || "";
    if (!n) continue;
    if (BATH_TYPE_ADDONS.has(n)) { if (!addonType) addonType = n; }
    else if (BATH_MODIFIER_ADDONS.has(n)) { modifiers.push(n); }
    else {
      // Case-insensitive fallback
      for (const t of BATH_TYPE_ADDONS) { if (n.toLowerCase() === t.toLowerCase()) { if (!addonType) addonType = t; break; } }
      for (const m of BATH_MODIFIER_ADDONS) { if (n.toLowerCase() === m.toLowerCase()) { modifiers.push(m); break; } }
    }
  }
  return { addonType, modifiers };
}

function formatTimeHuman(isoStr: string): string {
  if (!isoStr) return "—";
  try {
    // Parse local time directly from ISO string to avoid UTC conversion
    // e.g., "2026-03-22T15:00:00-04:00" → extract "15:00" (3 PM local)
    const tPart = isoStr.split("T")[1];
    if (!tPart) return "—";
    const [hStr, mStr] = tPart.split(":");
    const h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    if (isNaN(h) || isNaN(m)) return "—";
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
  } catch { return "—"; }
}

function classifyReservationCategory(typeName: string): string {
  if (!typeName) return "other";
  const t = typeName.toLowerCase();
  if (t.includes("evaluation") || t.includes("eval") || t.includes("first stay")) return "evaluation";
  if (t.includes("day boarding") || t === "day boarding") return "day_boarding";
  if (t.includes("daycare") || t.includes("day care")) return "daycare";
  if (t.includes("boarding")) return "boarding";
  return "other";
}

async function computeBathingReport(supabase: any, locationId: string, today: string, gingrSubdomain?: string, gingrApiKey?: string): Promise<any> {
  // Fetch all reservations with bath services for today:
  //   1) Checked-in and not yet checked out (boarding dogs in-house)
  //   2) Checked out today (departures)
  //   3) NOT yet checked in but starting today (daycare, day-boarding, evaluation — may not be checked in yet)
  const resSelect = "gingr_id, animal_gingr_id, animal_name, owner_first_name, owner_last_name, reservation_type_name, start_date, end_date, check_in_date, check_out_date, raw_data, room_assignment, services, notes_reservation, notes_animal, notes_owner";
  const [{ data: activeRes }, { data: coRes }, { data: pendingRes }] = await Promise.all([
    // 1) Checked in, not checked out, not cancelled, date range includes today
    supabase.from("gingr_reservations").select(resSelect)
      .eq("location_id", locationId)
      .not("check_in_date", "is", null).is("check_out_date", null).is("cancelled_date", null)
      .lte("start_date", `${today}T23:59:59`).gte("end_date", `${today}T00:00:00`),
    // 2) Checked out today
    supabase.from("gingr_reservations").select(resSelect)
      .eq("location_id", locationId)
      .not("check_out_date", "is", null).is("cancelled_date", null)
      .gte("check_out_date", today + "T00:00:00").lt("check_out_date", addDays(today, 1) + "T00:00:00"),
    // 3) Not yet checked in, starting today, not cancelled (catches daycare/day-boarding/evaluation)
    supabase.from("gingr_reservations").select(resSelect)
      .eq("location_id", locationId)
      .is("check_in_date", null).is("check_out_date", null).is("cancelled_date", null)
      .gte("start_date", `${today}T00:00:00`).lt("start_date", addDays(today, 1) + "T00:00:00"),
  ]);
  // Deduplicate by gingr_id in case a reservation matches multiple queries
  const seen = new Set<string>();
  const allRes: any[] = [];
  for (const r of [...(activeRes || []), ...(coRes || []), ...(pendingRes || [])]) {
    const id = String(r.gingr_id);
    if (!seen.has(id)) { seen.add(id); allRes.push(r); }
  }

  // Filter to dogs with bath scheduled today. If a mandatory bath exists on
  // another day of the stay, surface it as Suggested instead of inflating the
  // scheduled-today parity set.
  const bathDogs: any[] = [];
  const manualDogs: any[] = [];
  const suggestedDogs: any[] = [];
  const animalIds: string[] = [];
  for (const r of allRes) {
    const rd = r.raw_data || {};
    const rawSvcs = rd.services || [];
    const topSvcs = Array.isArray(r.services) ? r.services : [];
    const bathServices = extractBathLikeServices(rawSvcs, topSvcs);
    const { scheduledToday, scheduledOtherDay, hasBathOrGroom } = getBathSchedulingForDate(bathServices, today);
    if (!hasBathOrGroom) continue;

    // Prefer raw_data dates when present because they preserve the original local day.
    const startDate = rd.start_date || r.start_date || "";
    const endDate = rd.end_date || r.end_date || "";
    const resType = rd.reservation_type || {};
    const resTypeName = resType.type || r.reservation_type_name || "";
    const isDepartingToday = endDate.includes(today);
    const nights = calculateNights(startDate, endDate);

    if (!scheduledToday) {
      if (isDepartingToday && isBoardingReservation(resTypeName) && nights >= 2) {
        const animalGingrId = String(r.animal_gingr_id || rd.animal?.id || "").trim();
        if (animalGingrId) animalIds.push(animalGingrId);

        suggestedDogs.push({
          animalGingrId,
          gingrReservationId: String(r.gingr_id || ""),
          bathServiceId: scheduledOtherDay?.id || "",
          animalName: r.animal_name || rd.animal?.name || "Unknown",
          ownerName: [r.owner_first_name || rd.owner?.first_name || "", r.owner_last_name || rd.owner?.last_name || ""].filter(Boolean).join(" "),
          breed: rd.animal?.breed || "",
          roomLabel: r.room_assignment || rd.run?.name || "",
          suiteType: resTypeName,
          reservationType: resTypeName,
          reservationCategory: classifyReservationCategory(resTypeName),
          addonType: null,
          bathServiceName: scheduledOtherDay?.name || "",
          bathModifiers: [],
          reservationNotes: "",
          scheduledAt: scheduledOtherDay?.scheduledAt || "",
          scheduledTime: scheduledOtherDay?.scheduledAt ? formatTimeHuman(scheduledOtherDay.scheduledAt) : "—",
          departureTime: formatTimeHuman(endDate),
          departureTimeRaw: endDate,
          startDate,
          endDate,
          isCheckedOut: !!r.check_out_date,
          isDone: false,
          status: "suggested" as string,
          statusContext: buildSuggestedBathStatusContext(today, scheduledOtherDay),
        });
      }
      continue;
    }

    const animalGingrId = String(r.animal_gingr_id || rd.animal?.id || "").trim();
    if (animalGingrId) animalIds.push(animalGingrId);

    // Use whichever services array has data for addon parsing
    const svcsForAddons = rawSvcs.length > 0 ? rawSvcs : topSvcs;
    const { addonType, modifiers } = parseBathAddonsFromServices(svcsForAddons);
    const roomLabel = r.room_assignment || rd.run?.name || "";

    // Combine reservation + animal + owner notes (strip HTML tags for readability)
    const notesParts = [r.notes_reservation, r.notes_animal, r.notes_owner]
      .filter(Boolean)
      .map((n: string) => n.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const reservationNotes = notesParts.join(" | ");

    bathDogs.push({
      animalGingrId,
      gingrReservationId: String(r.gingr_id || ""),
      bathServiceId: scheduledToday.id || "",
      animalName: r.animal_name || rd.animal?.name || "Unknown",
      ownerName: [r.owner_first_name || rd.owner?.first_name || "", r.owner_last_name || rd.owner?.last_name || ""].filter(Boolean).join(" "),
      breed: rd.animal?.breed || "",
      roomLabel,
      suiteType: resTypeName,
      reservationType: resTypeName,
      reservationCategory: classifyReservationCategory(resTypeName),
      addonType,
      bathServiceName: scheduledToday.name || "",
      bathModifiers: modifiers,
      reservationNotes,
      scheduledAt: scheduledToday.scheduledAt,
      scheduledTime: formatTimeHuman(scheduledToday.scheduledAt),
      departureTime: formatTimeHuman(endDate),
      departureTimeRaw: endDate,
      startDate,
      endDate,
      isCheckedOut: !!r.check_out_date,
      isDone: !!scheduledToday.completedAt,
      status: "scheduled" as string,
    });
  }

  // ─── Fresh N' Clean auto-detection ─────────────────────────────────────
  // Dogs boarding exactly 1 night, departing today, with no bath service
  const bathDogResIds = new Set([...bathDogs, ...suggestedDogs].map(d => d.gingrReservationId));
  for (const r of allRes) {
    const resId = String(r.gingr_id || "");
    if (bathDogResIds.has(resId)) continue; // already has a bath

    // Must be a boarding reservation
    const resTypeName = (r.reservation_type_name || "").toLowerCase();
    if (!resTypeName.includes("boarding")) continue;

    // Must be departing on the target date
    // Prefer raw_data.end_date (has timezone) over DB column (UTC)
    const rd2 = r.raw_data || {};
    const endDate = rd2.end_date || r.end_date || "";
    if (!endDate.includes(today)) continue;

    // Must be exactly 1 night: start_date's date is 1 day before end_date's date
    const startDate = r.start_date || "";
    const startDay = startDate.split("T")[0];
    const endDay = endDate.split("T")[0];
    if (!startDay || !endDay) continue;
    const expectedStart = addDays(endDay, -1);
    if (startDay !== expectedStart) continue;

    // Confirm no bath service anywhere on the reservation
    const rd = r.raw_data || {};
    const rawSvcs = rd.services || [];
    const topSvcs = Array.isArray(r.services) ? r.services : [];
    const allSvcs = [...rawSvcs, ...topSvcs];
    const hasBath = allSvcs.some((s: any) => {
      const n = typeof s === "string" ? s : s?.name || "";
      return n.toLowerCase().includes("bath");
    });
    if (hasBath) continue;

    const animalGingrId = String(r.animal_gingr_id || rd.animal?.id || "").trim();
    if (animalGingrId) animalIds.push(animalGingrId);

    const resType = rd.reservation_type || {};
    const roomLabel = r.room_assignment || rd.run?.name || "";
    const notesParts = [r.notes_reservation, r.notes_animal, r.notes_owner]
      .filter(Boolean)
      .map((n: string) => n.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const reservationNotes = notesParts.join(" | ");

    const fncResTypeName = resType.type || r.reservation_type_name || "";
    bathDogs.push({
      animalGingrId,
      gingrReservationId: resId,
      bathServiceId: "",
      animalName: r.animal_name || rd.animal?.name || "Unknown",
      ownerName: [r.owner_first_name || rd.owner?.first_name || "", r.owner_last_name || rd.owner?.last_name || ""].filter(Boolean).join(" "),
      breed: rd.animal?.breed || "",
      roomLabel,
      suiteType: fncResTypeName,
      reservationType: fncResTypeName,
      reservationCategory: classifyReservationCategory(fncResTypeName),
      addonType: "",
      bathServiceName: "",
      bathModifiers: [],
      reservationNotes,
      scheduledAt: endDate,
      scheduledTime: formatTimeHuman(endDate),
      departureTime: formatTimeHuman(endDate),
      departureTimeRaw: endDate,
      startDate: r.start_date || "",
      endDate: r.end_date || "",
      isCheckedOut: !!r.check_out_date,
      isDone: false,
      isFreshNClean: true,
      status: "scheduled" as string,
    });
  }

  // Fetch bath icons, play icons, and weights for all dogs
  // iconMap stores ALL bath icons per dog (not just the first) to support multiple bath types
  let iconMap: Record<string, GingrAnimalIconRow[]> = {};
  let playIconMap: Record<string, string> = {}; // animal_id → play type (e.g. "Private Play")
  let weightMap: Record<string, number | null> = {};
  if (animalIds.length > 0) {
    const [{ data: icons }, playAssignments, { data: animals }] = await Promise.all([
      supabase
        .from("gingr_animal_icons_live")
        .select("animal_gingr_id, icon_title, icon_comment, icon_template_id, icon_identity_key, icon_group, icon_color, icon_class")
        .eq("location_id", locationId)
        .eq("icon_group", "Bath")
        .in("animal_gingr_id", animalIds),
      fetchPlaygroupAssignments({
        supabase,
        locationId,
        animalIds,
        columns: "animal_gingr_id, has_private_play",
      }),
      supabase
        .from("gingr_animals")
        .select("gingr_id, weight")
        .in("gingr_id", animalIds),
    ]);
    (icons || []).forEach((r: any) => {
      const id = r.animal_gingr_id;
      if (!iconMap[id]) iconMap[id] = [];
      iconMap[id].push({
        animal_gingr_id: r.animal_gingr_id,
        icon_title: r.icon_title || "",
        icon_comment: r.icon_comment || "",
        icon_template_id: r.icon_template_id || "",
        icon_identity_key: r.icon_identity_key || "",
        icon_group: r.icon_group || "",
        icon_color: r.icon_color || "",
        icon_class: r.icon_class || "",
      });
    });
    (playAssignments || []).forEach((assignment: any) => {
      if (assignment?.hasPrivatePlay) {
        playIconMap[assignment.animalGingrId] = "private_play";
      }
    });
    (animals || []).forEach((a: any) => {
      const w = a.weight ? parseFloat(a.weight) : null;
      weightMap[a.gingr_id] = (w && !isNaN(w)) ? w : null;
    });
  }

  // Fetch service-level notes from Gingr web interface (not available via API)
  let serviceNotesMap: Record<number, string | null> = {};
  if (gingrSubdomain && gingrApiKey && bathDogs.some(d => d.bathServiceId)) {
    try {
      const webCookies = await gingrWebLogin(gingrSubdomain, gingrApiKey);
      const toFetch = bathDogs
        .map((d, i) => d.bathServiceId ? { index: i, serviceId: d.bathServiceId } : null)
        .filter((x): x is { index: number; serviceId: string } => x !== null);
      if (toFetch.length > 0) {
        serviceNotesMap = await fetchAllServiceNotes(gingrSubdomain, webCookies, toFetch, 5);
      }
    } catch (err) {
      console.error("Gingr web login/service notes error:", err);
      // Non-fatal: continue without service notes
    }
  }

  // ─── Suggested baths: boarding dogs staying 2+ nights with no bath ─────
  const scheduledResIds = new Set([...bathDogs, ...suggestedDogs].map(d => d.gingrReservationId));
  for (const r of allRes) {
    const resId = String(r.gingr_id || "");
    if (scheduledResIds.has(resId)) continue;

    const rtName = (r.reservation_type_name || "").toLowerCase();
    if (!rtName.includes("boarding")) continue;
    if (rtName.includes("day boarding")) continue;
    if (!r.check_in_date) continue;
    // Do NOT skip checked-out dogs — a dog that left without a bath is a missed bath

    const startDay = (r.start_date || "").split("T")[0];
    const endDay = (r.end_date || "").split("T")[0];
    if (!startDay || !endDay) continue;
    const startMs = new Date(startDay + "T12:00:00").getTime();
    const endMs = new Date(endDay + "T12:00:00").getTime();
    const nights = Math.round((endMs - startMs) / (24 * 60 * 60 * 1000));
    if (nights < 2) continue;

    // Must be departing on the target date (end_date equals today)
    if (endDay !== today) continue;

    const rd = r.raw_data || {};
    const rawSvcs = rd.services || [];
    const topSvcs = Array.isArray(r.services) ? r.services : [];
    const allSvcs = [...rawSvcs, ...topSvcs];
    const hasBathOrGroom = allSvcs.some((s: any) => {
      const n = typeof s === "string" ? s : s?.name || "";
      return n.toLowerCase().includes("bath") || n.toLowerCase().includes("groom");
    });
    if (hasBathOrGroom) continue;

    const animalGingrId = String(r.animal_gingr_id || rd.animal?.id || "").trim();
    if (animalGingrId) animalIds.push(animalGingrId);

    const resType = rd.reservation_type || {};
    const roomLabel = r.room_assignment || rd.run?.name || "";
    const fullResTypeName = resType.type || r.reservation_type_name || "";

    suggestedDogs.push({
      animalGingrId,
      gingrReservationId: resId,
      bathServiceId: "",
      animalName: r.animal_name || rd.animal?.name || "Unknown",
      ownerName: [r.owner_first_name || rd.owner?.first_name || "", r.owner_last_name || rd.owner?.last_name || ""].filter(Boolean).join(" "),
      breed: rd.animal?.breed || "",
      roomLabel,
      suiteType: fullResTypeName,
      reservationType: fullResTypeName,
      reservationCategory: classifyReservationCategory(fullResTypeName),
      addonType: null,
      bathServiceName: "",
      bathModifiers: [],
      reservationNotes: "",
      scheduledAt: "",
      scheduledTime: "—",
      departureTime: formatTimeHuman(r.end_date || ""),
      departureTimeRaw: r.end_date || "",
      startDate: r.start_date || "",
      endDate: r.end_date || "",
      isCheckedOut: false,
      isDone: false,
      status: "suggested" as string,
      statusContext: buildSuggestedBathStatusContext(today, null),
    });
  }

  // ─── Manual overrides: staff-added baths outside Gingr ─────────────────
  const existingBathResIds = new Set([...bathDogs, ...suggestedDogs].map((d) => d.gingrReservationId));
  const reservationById = new Map(allRes.map((r) => [String(r.gingr_id || ""), r]));
  const { data: manualOverrideRows } = await supabase
    .from("ops_bathing_manual_overrides")
    .select("gingr_reservation_id, animal_gingr_id, bath_type, bath_modifiers, note, added_by_name")
    .eq("location_id", locationId)
    .eq("override_date", today)
    .is("removed_at", null);

  for (const override of (manualOverrideRows || [])) {
    const resId = String(override.gingr_reservation_id || "");
    if (!resId || existingBathResIds.has(resId)) continue;

    const r = reservationById.get(resId);
    if (!r) continue;

    const rd = r.raw_data || {};
    const startDate = rd.start_date || r.start_date || "";
    const endDate = rd.end_date || r.end_date || "";
    const resType = rd.reservation_type || {};
    const resTypeName = resType.type || r.reservation_type_name || "";
    const roomLabel = r.room_assignment || rd.run?.name || "";
    const notesParts = [r.notes_reservation, r.notes_animal, r.notes_owner]
      .filter(Boolean)
      .map((n: string) => n.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const reservationNotes = notesParts.join(" | ");
    const animalGingrId = String(override.animal_gingr_id || r.animal_gingr_id || rd.animal?.id || "").trim();
    const manualBathType = extractBathTypeFromName(String(override.bath_type || "")) || String(override.bath_type || "Standard");
    const manualBathModifiers = Array.isArray(override.bath_modifiers) ? override.bath_modifiers.filter(Boolean) : [];

    if (animalGingrId) animalIds.push(animalGingrId);

    manualDogs.push({
      animalGingrId,
      gingrReservationId: resId,
      bathServiceId: "",
      animalName: r.animal_name || rd.animal?.name || "Unknown",
      ownerName: [r.owner_first_name || rd.owner?.first_name || "", r.owner_last_name || rd.owner?.last_name || ""].filter(Boolean).join(" "),
      breed: rd.animal?.breed || "",
      roomLabel,
      suiteType: resTypeName,
      reservationType: resTypeName,
      reservationCategory: classifyReservationCategory(resTypeName),
      addonType: manualBathType,
      bathServiceName: manualBathType,
      bathModifiers: manualBathModifiers,
      reservationNotes,
      manualNote: String(override.note || "").trim(),
      scheduledAt: "",
      scheduledTime: "Manual",
      departureTime: formatTimeHuman(endDate),
      departureTimeRaw: endDate,
      startDate,
      endDate,
      isCheckedOut: !!r.check_out_date,
      isDone: false,
      isFreshNClean: manualBathType === "Fresh N Clean",
      status: "manual" as string,
      statusContext: buildManualBathStatusContext(override.added_by_name, override.note),
    });
  }

  // ─── Room occupancy: sibling/roommate grouping ─────────────────────────
  const { data: roomOcc } = await supabase
    .from("gingr_room_occupancy")
    .select("run_name, animal_names")
    .eq("location_id", locationId)
    .eq("occupancy_date", today)
    .eq("occupied", true);

  const roomByDogName: Record<string, { runName: string; ownerName: string; allOccupants: Array<{ name: string; owner: string }> }> = {};
  for (const row of (roomOcc || [])) {
    if (!row.animal_names || !row.run_name) continue;
    const entries = (row.animal_names as string).split("<br>").map((e: string) => e.trim()).filter(Boolean);
    const occupants: Array<{ name: string; owner: string }> = [];
    for (const entry of entries) {
      const parenGroups: string[] = [];
      const parenRe = /\(([^)]+)\)/g;
      let m;
      while ((m = parenRe.exec(entry)) !== null) parenGroups.push(m[1].trim());
      let dogName: string;
      let ownerName = "";
      if (parenGroups.length >= 1) {
        ownerName = parenGroups[parenGroups.length - 1];
        const lastIdx = entry.lastIndexOf(`(${ownerName})`);
        dogName = entry.substring(0, lastIdx).trim();
      } else {
        dogName = entry.trim();
      }
      if (dogName) occupants.push({ name: dogName, owner: ownerName });
    }
    for (const occ of occupants) {
      roomByDogName[occ.name.toLowerCase()] = { runName: row.run_name, ownerName: occ.owner, allOccupants: occupants };
    }
  }

  // ─── Avg checkout time from cache ──────────────────────────────────────
  const allDogEntries = [...bathDogs, ...manualDogs, ...suggestedDogs];
  const uniqueAnimalIds = [...new Set(allDogEntries.map(d => d.animalGingrId).filter(Boolean))];
  let checkoutCache: Record<string, { avg_checkout_time: string; sample_count: number }> = {};
  if (uniqueAnimalIds.length > 0) {
    const { data: cached } = await supabase
      .from("animal_checkout_averages")
      .select("animal_id, avg_checkout_time, sample_count")
      .in("animal_id", uniqueAnimalIds);
    for (const row of (cached || [])) {
      if (row.avg_checkout_time) {
        checkoutCache[row.animal_id] = { avg_checkout_time: row.avg_checkout_time, sample_count: row.sample_count || 0 };
      }
    }
  }

  // Resolve bath type: Fresh N' Clean for auto-detected, else icons → add-on → service name → Standard
  // Collect ALL bath icons per dog (e.g. "Hypo - NO Spray" AND "NO DRYER")
  function buildDogOutput(d: any, idx: number): any {
    const icons = iconMap[d.animalGingrId] || [];
    const iconComments = icons.map((i: any) => i.icon_comment).filter(Boolean);
    const normalizedBath = resolveBathDisplayFromIconRows({
      iconRows: icons,
      mappings: _globalGingrIconMappings,
      addonType: d.addonType,
      serviceName: d.bathServiceName,
      rawModifiers: d.bathModifiers,
      defaultType: d.isFreshNClean ? "Fresh N Clean" : "Standard",
    });

    const weight = weightMap[d.animalGingrId] ?? null;
    const sizeCategory = getSizeCategory(d.animalGingrId, weight);
    const hasPrivatePlay = !!playIconMap[d.animalGingrId];

    // Room/sibling/roommate grouping
    const roomInfo = roomByDogName[d.animalName.toLowerCase()];
    const roomName = roomInfo?.runName || d.roomLabel || "";
    let roommates: string[] = [];
    let siblingGroup = "";
    if (roomInfo && roomInfo.allOccupants.length > 1) {
      siblingGroup = roomInfo.runName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      const myOwner = roomInfo.ownerName;
      for (const occ of roomInfo.allOccupants) {
        if (occ.name.toLowerCase() === d.animalName.toLowerCase()) continue;
        const label = occ.owner === myOwner ? `${occ.name} (sibling)` : `${occ.name} (${occ.owner})`;
        roommates.push(label);
      }
    }

    const avgCheckoutTime = checkoutCache[d.animalGingrId]?.avg_checkout_time || null;

    return {
      animalGingrId: d.animalGingrId,
      gingrReservationId: d.gingrReservationId,
      animalName: d.animalName,
      ownerName: d.ownerName,
      breed: d.breed,
      roomLabel: roomName || d.roomLabel,
      suiteType: d.suiteType,
      bathType: normalizedBath.bathType,
      bathIcons: normalizedBath.bathIcons,
      bathModifiers: normalizedBath.bathModifiers,
      bathNotes: iconComments.join(" | "),
      reservationNotes: d.reservationNotes || "",
      serviceNotes: d.status === "manual"
        ? (d.manualNote || "")
        : (d.isFreshNClean || d.status === "suggested") ? "" : (serviceNotesMap[idx] || ""),
      weight,
      sizeCategory,
      hasPrivatePlay,
      scheduledAt: d.scheduledAt,
      scheduledTime: d.scheduledTime,
      departureTime: d.departureTime,
      departureTimeRaw: d.departureTimeRaw,
      isCheckedOut: d.isCheckedOut,
      isDone: d.isDone,
      isFreshNClean: !!d.isFreshNClean,
      status: d.status || "scheduled",
      statusContext: d.statusContext || null,
      reservationType: d.reservationType || d.suiteType,
      reservationCategory: d.reservationCategory || classifyReservationCategory(d.suiteType),
      roomName,
      roommates,
      siblingGroup,
      avgCheckoutTime,
      reservationDates: { start: (d.startDate || "").split("T")[0], end: (d.endDate || "").split("T")[0] },
    };
  }

  const scheduledOut = bathDogs.map((d, i) => buildDogOutput(d, i));
  const manualOut = manualDogs.map((d, i) => buildDogOutput(d, bathDogs.length + i));
  const suggestedOut = suggestedDogs.map((d, i) => buildDogOutput(d, bathDogs.length + manualDogs.length + i));
  const dogs = [...scheduledOut, ...manualOut, ...suggestedOut];

  const statusOrder: Record<string, number> = { scheduled: 0, manual: 1, suggested: 2 };

  dogs.sort((a: any, b: any) => {
    if (a.status !== b.status) return (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99);
    if (a.siblingGroup && a.siblingGroup === b.siblingGroup) return a.animalName.localeCompare(b.animalName);
    if (a.status === "scheduled") return (a.scheduledAt || "").localeCompare(b.scheduledAt || "");
    if (a.status === "manual") return a.animalName.localeCompare(b.animalName);
    return a.animalName.localeCompare(b.animalName);
  });

  // Re-sort to group siblings/roommates together
  const grouped: any[] = [];
  const used = new Set<number>();
  for (let i = 0; i < dogs.length; i++) {
    if (used.has(i)) continue;
    grouped.push(dogs[i]);
    used.add(i);
    if (dogs[i].siblingGroup) {
      for (let j = i + 1; j < dogs.length; j++) {
        if (!used.has(j) && dogs[j].siblingGroup === dogs[i].siblingGroup) {
          grouped.push(dogs[j]);
          used.add(j);
        }
      }
    }
  }

  // Fetch bath completions from lite_settings (written by Bathing Report page)
  const completionKey = `ops_bathing_${today}`;
  const { data: completionRows } = await supabase
    .from("lite_settings")
    .select("setting_value")
    .eq("location_id", locationId)
    .eq("setting_key", completionKey)
    .limit(1);
  const completions: Record<string, { by: string; at: string }> = (completionRows && completionRows.length > 0 && completionRows[0].setting_value) ? completionRows[0].setting_value : {};

  // Merge completion status into each dog
  for (const dog of grouped) {
    const resId = `g${dog.gingrReservationId}`;
    const completedInfo = completions[resId] || null;
    if (completedInfo) {
      dog.isDone = true;
      (dog as any).completedBy = completedInfo.by || "";
      (dog as any).completedAt = completedInfo.at || "";
    }
  }

  // Build summary with category counts
  const scheduledCount = grouped.filter((d: any) => d.status === "scheduled").length;
  const manualCount = grouped.filter((d: any) => d.status === "manual").length;
  const suggestedCount = grouped.filter((d: any) => d.status === "suggested").length;
  const byCategory: Record<string, number> = {
    boarding: 0,
    daycare: 0,
    day_boarding: 0,
    evaluation: 0,
    suggested: suggestedCount,
    manual: manualCount,
  };
  for (const d of grouped) {
    if (d.status === "scheduled" && d.reservationCategory && byCategory[d.reservationCategory] !== undefined) {
      byCategory[d.reservationCategory]++;
    } else if (d.status === "scheduled" && d.reservationCategory) {
      byCategory[d.reservationCategory] = (byCategory[d.reservationCategory] || 0) + 1;
    }
  }

  const totalCount = grouped.length;
  const completedCount = grouped.filter((d: any) => d.isDone).length;

  return {
    dogs: grouped,
    summary: {
      total: totalCount,
      scheduled: scheduledCount,
      manual: manualCount,
      suggested: suggestedCount,
      byCategory,
    },
    completions,
    totalCount,
    completedCount,
  };
}

// ─── 8b. Belongings Report (for departing dogs — prep the night before) ──

async function fetchBelongingsForReservations(
  gingrSubdomain: string,
  gingrApiKey: string,
  reservationGingrIds: string[],
  concurrency: number = 5,
): Promise<Record<string, { belongings: string; healthNotes: string; checkedInBy: string }>> {
  const results: Record<string, { belongings: string; healthNotes: string; checkedInBy: string }> = {};
  const queue = [...reservationGingrIds];

  async function worker() {
    while (queue.length > 0) {
      const resId = queue.shift();
      if (!resId) break;
      try {
        const url = `https://${gingrSubdomain}.gingrapp.com/api/v1/existing_reservation_estimate?key=${gingrApiKey}&id=${resId}`;
        const resp = await fetch(url);
        if (!resp.ok) { results[resId] = { belongings: "", healthNotes: "", checkedInBy: "" }; continue; }
        const json = await resp.json();
        const resData = json?.data?.reservations?.[0]?.reservation;
        results[resId] = {
          belongings: resData?.answer_1 || "",
          healthNotes: resData?.answer_2 || "",
          checkedInBy: resData?.answer_3 || "",
        };
      } catch {
        results[resId] = { belongings: "", healthNotes: "", checkedInBy: "" };
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function computeBelongingsReport(
  supabase: any,
  locationId: string,
  targetDate: string,
  gingrSubdomain?: string,
  gingrApiKey?: string,
): Promise<any> {
  // Query dogs departing on the target date: boarding dogs with end_date on targetDate
  const resSelect = "gingr_id, animal_gingr_id, animal_name, owner_gingr_id, owner_first_name, owner_last_name, reservation_type_name, start_date, end_date, check_in_date, check_out_date, cancelled_date, raw_data, room_assignment, services";
  const nextDay = addDays(targetDate, 1);

  const { data: departingRes } = await supabase
    .from("gingr_reservations")
    .select(resSelect)
    .eq("location_id", locationId)
    .not("check_in_date", "is", null)  // actually checked in
    .is("check_out_date", null)         // hasn't left yet
    .is("cancelled_date", null)         // not cancelled
    .gte("end_date", `${targetDate}T00:00:00`)
    .lt("end_date", `${nextDay}T00:00:00`);

  // Filter to boarding reservations (multi-day stay)
  const boardingDogs: any[] = [];
  for (const r of (departingRes || [])) {
    const resTypeName = (r.reservation_type_name || "").toLowerCase();
    if (!resTypeName.includes("boarding")) continue;

    // Must be multi-day: start_date's date < end_date's date
    const startDay = (r.start_date || "").split("T")[0];
    const endDay = (r.end_date || "").split("T")[0];
    if (!startDay || !endDay || startDay >= endDay) continue;

    boardingDogs.push(r);
  }

  if (boardingDogs.length === 0) {
    return { dogs: [], totalCount: 0, completedCount: 0 };
  }

  // Fetch weight/breed/photo for all departing dogs
  const animalIds = boardingDogs.map(r => String(r.animal_gingr_id || r.raw_data?.animal?.id || "").trim()).filter(Boolean);
  const ownerIds = boardingDogs.map(r => String(r.owner_gingr_id || r.raw_data?.owner?.id || "").trim()).filter(Boolean);
  let weightMap: Record<string, number | null> = {};
  let breedMap: Record<string, string> = {};
  let photoMap: Record<string, string> = {};
  let playIconMap: Record<string, string[]> = {};
  let ownerMap: Record<string, { firstName: string; lastName: string; phone: string; email: string }> = {};
  let emergencyContactMap: Record<string, { name: string; phone: string }> = {};

  if (animalIds.length > 0) {
    const [{ data: animals }, playAssignments] = await Promise.all([
      supabase
        .from("gingr_animals")
        .select("gingr_id, weight, breed_name, image_url")
        .in("gingr_id", animalIds),
      fetchPlaygroupAssignments({
        supabase,
        locationId,
        animalIds,
        columns: "animal_gingr_id, playgroup_tags, is_half_and_half",
      }),
    ]);
    for (const a of (animals || [])) {
      const w = a.weight ? parseFloat(a.weight) : null;
      weightMap[a.gingr_id] = (w && !isNaN(w)) ? w : null;
      breedMap[a.gingr_id] = a.breed_name || "";
      if (a.image_url) photoMap[a.gingr_id] = a.image_url;
    }
    for (const assignment of (playAssignments || [])) {
      playIconMap[assignment.animalGingrId] = getCanonicalPlaygroupTags(assignment, { includeHalfAndHalf: true });
    }
  }

  // Fetch owner details (full name + phone) from gingr_owners
  if (ownerIds.length > 0) {
    const { data: owners } = await supabase
      .from("gingr_owners")
      .select("gingr_id, first_name, last_name, cell_phone, home_phone, email, emergency_contact_name, emergency_contact_phone")
      .eq("location_id", locationId)
      .in("gingr_id", ownerIds);
    for (const o of (owners || [])) {
      ownerMap[o.gingr_id] = {
        firstName: o.first_name || "",
        lastName: o.last_name || "",
        phone: o.cell_phone || o.home_phone || "",
        email: o.email || "",
      };
      if (o.emergency_contact_name || o.emergency_contact_phone) {
        emergencyContactMap[o.gingr_id] = {
          name: o.emergency_contact_name || "",
          phone: o.emergency_contact_phone || "",
        };
      }
    }
  }

  // Fetch belongings from Gingr API (only if API key available)
  let belongingsMap: Record<string, { belongings: string; healthNotes: string; checkedInBy: string }> = {};
  if (gingrSubdomain && gingrApiKey) {
    const resIds = boardingDogs.map(r => String(r.gingr_id));
    try {
      belongingsMap = await fetchBelongingsForReservations(gingrSubdomain, gingrApiKey, resIds, 5);
    } catch (err) {
      console.error("Belongings fetch error:", err);
    }
  }

  // Helper to format date range as "Apr 6 – Apr 9"
  function fmtDateRange(start: string, end: string): string {
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const s = new Date(start + "T12:00:00");
    const e = new Date(end + "T12:00:00");
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return "";
    return `${months[s.getMonth()]} ${s.getDate()} – ${months[e.getMonth()]} ${e.getDate()}`;
  }

  // Build report
  const dogs = boardingDogs.map(r => {
    const rd = r.raw_data || {};
    const animalGingrId = String(r.animal_gingr_id || rd.animal?.id || "").trim();
    const ownerGingrId = String(r.owner_gingr_id || rd.owner?.id || "").trim();
    const reservationGingrId = String(r.gingr_id || "");
    const roomLabel = r.room_assignment || rd.run?.name || "";
    const weight = weightMap[animalGingrId] ?? null;
    const sizeCategory = getSizeCategory(animalGingrId, weight);
    const breed = breedMap[animalGingrId] || rd.animal?.breed || "";

    const belongingsData = belongingsMap[reservationGingrId] || { belongings: "", healthNotes: "", checkedInBy: "" };
    const ownerData = ownerMap[ownerGingrId];
    const ownerFullName = ownerData
      ? `${ownerData.firstName} ${ownerData.lastName}`.trim()
      : [r.owner_first_name || rd.owner?.first_name || "", r.owner_last_name || rd.owner?.last_name || ""].filter(Boolean).join(" ");
    const ownerPhone = ownerData?.phone || rd.owner?.cell_phone || rd.owner?.home_phone || "";
    const ownerEmail = ownerData?.email || rd.owner?.email || "";
    const ec = emergencyContactMap[ownerGingrId];

    const startDay = ((r.raw_data?.start_date || r.start_date || "").split("T")[0]) || "";
    const endDay = ((r.raw_data?.end_date || r.end_date || "").split("T")[0]) || "";

    return {
      animalName: r.animal_name || rd.animal?.name || "Unknown",
      animalGingrId,
      ownerName: ownerFullName,
      ownerFullName,
      ownerGingrId,
      ownerPhone,
      ownerEmail,
      emergencyContactName: ec?.name || "",
      emergencyContactPhone: ec?.phone || "",
      profilePhotoUrl: photoMap[animalGingrId] || "",
      playGroupIcons: playIconMap[animalGingrId] || [],
      breed,
      roomLabel,
      weight,
      sizeCategory,
      reservationType: r.reservation_type_name || rd.reservation_type?.type || "",
      dateRange: fmtDateRange(startDay, endDay),
      checkInDate: ((r.raw_data?.check_in_date || r.check_in_date || r.raw_data?.start_date || r.start_date || "").split("T")[0]) || "",
      checkInTime: formatTimeHuman(r.raw_data?.check_in_date || r.check_in_date || r.raw_data?.start_date || r.start_date || ""),
      checkOutDate: endDay,
      checkOutTime: formatTimeHuman(r.raw_data?.end_date || r.end_date || ""),
      belongings: belongingsData.belongings,
      healthNotes: belongingsData.healthNotes,
      checkedInBy: belongingsData.checkedInBy,
      reservationGingrId,
    };
  });

  // Sort by room label
  dogs.sort((a, b) => (a.roomLabel || "").localeCompare(b.roomLabel || "", undefined, { numeric: true }));

  // Fetch completions from lite_settings
  const completionKey = `ops_belongings_completions_${targetDate}`;
  const { data: completionRows } = await supabase
    .from("lite_settings")
    .select("setting_value")
    .eq("location_id", locationId)
    .eq("setting_key", completionKey)
    .limit(1);
  const completions: Record<string, any> = (completionRows && completionRows.length > 0 && completionRows[0].setting_value) ? completionRows[0].setting_value : {};

  const totalCount = dogs.length;
  const completedCount = Object.values(completions).filter((c: any) => c && c.status === "complete").length;

  return { dogs, completions, totalCount, completedCount };
}

// ─── 8c. Collars Report (next-day collar preparation) ─────────────────────

async function computeCollarsReport(
  supabase: any,
  locationId: string,
  targetDate: string,
): Promise<any> {
  // Query all reservations starting on the target date (not cancelled)
  const resSelect = "gingr_id, animal_gingr_id, animal_name, owner_first_name, owner_last_name, reservation_type_name, start_date, end_date, check_in_date, check_out_date, cancelled_date, raw_data, room_assignment, services";
  const nextDay = addDays(targetDate, 1);

  const { data: targetRes } = await supabase
    .from("gingr_reservations")
    .select(resSelect)
    .eq("location_id", locationId)
    .is("cancelled_date", null)
    .gte("start_date", `${targetDate}T00:00:00`)
    .lt("start_date", `${nextDay}T00:00:00`);

  const allRes = targetRes || [];
  if (allRes.length === 0) {
    return { dogs: [], summary: { total: 0, pink: 0, red: 0, green: 0, blue: 0, yellow: 0, unclassified: 0, halfAndHalf: 0 }, completions: {}, totalCount: 0, completedCount: 0 };
  }

  // Categorize reservations by type
  const categorized: Array<{ res: any; category: string }> = [];
  for (const r of allRes) {
    const typeName = (r.reservation_type_name || "").toLowerCase();
    let category = "";
    if (typeName.includes("evaluation")) {
      category = "evaluation";
    } else if (typeName.includes("day boarding")) {
      category = "dayboarding";
    } else if (typeName.includes("daycare") || typeName.includes("day care")) {
      category = "daycare";
    } else if (typeName.includes("boarding")) {
      category = "boarding";
    }
    if (category) {
      categorized.push({ res: r, category });
    }
  }

  if (categorized.length === 0) {
    return { dogs: [], summary: { total: 0, pink: 0, red: 0, green: 0, blue: 0, yellow: 0, unclassified: 0, halfAndHalf: 0 }, completions: {}, totalCount: 0, completedCount: 0 };
  }

  // Gather all animal IDs for canonical playgroup + breed lookup
  const animalIds = categorized.map(c => String(c.res.animal_gingr_id || c.res.raw_data?.animal?.id || "").trim()).filter(Boolean);
  const uniqueAnimalIds = [...new Set(animalIds)];

  // Fetch canonical assignments + breeds in parallel
  const [playgroupAssignments, animalsResult] = await Promise.all([
    uniqueAnimalIds.length > 0
      ? fetchPlaygroupAssignments({
          supabase,
          locationId,
          animalIds: uniqueAnimalIds,
          columns: [
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
          ].join(", "),
        })
      : Promise.resolve([]),
    uniqueAnimalIds.length > 0
      ? supabase.from("gingr_animals")
          .select("gingr_id, weight, breed_name")
          .in("gingr_id", uniqueAnimalIds)
      : Promise.resolve({ data: [] }),
  ]);

  const playgroupMap = buildPlaygroupAssignmentMap(playgroupAssignments || []);

  // Build weight/breed maps
  const weightMap: Record<string, number | null> = {};
  const breedMap: Record<string, string> = {};
  for (const a of (animalsResult.data || [])) {
    const w = a.weight ? parseFloat(a.weight) : null;
    weightMap[a.gingr_id] = (w && !isNaN(w)) ? w : null;
    breedMap[a.gingr_id] = a.breed_name || "";
  }

  // Classify each dog into collar color
  const dogs: any[] = [];
  const seen = new Set<string>();

  for (const { res: r, category } of categorized) {
    const rd = r.raw_data || {};
    const animalGingrId = String(r.animal_gingr_id || rd.animal?.id || "").trim();
    const reservationGingrId = String(r.gingr_id || "");

    // Deduplicate by animal + category (same dog can have multiple reservations)
    const dedupeKey = `${animalGingrId}_${category}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const assignment = playgroupMap.get(animalGingrId) || null;
    const iconTitles = assignment?.sourceIconTitles || [];
    const iconComments = assignment?.sourceIconComments || [];
    const playGroupTitle = iconTitles.find((title) => /playgroup/i.test(title) && !/private/i.test(title)) || "";
    const privatePlayTitle = iconTitles.find((title) => /private/i.test(title) && /play/i.test(title)) || "";
    const privatePlayComment = assignment?.halfAndHalfNote || iconComments.find(Boolean) || "";
    const weight = weightMap[animalGingrId] ?? null;
    const sizeCategory = getSizeCategory(animalGingrId, weight);
    const breed = breedMap[animalGingrId] || rd.animal?.breed || "";
    const roomLabel = r.room_assignment || rd.run?.name || "";
    const operationalPlaygroup = getOperationalPlaygroupKey(assignment);
    const hasPrivatePlay = !!assignment?.hasPrivatePlay;
    const playgroupTags = getCanonicalPlaygroupTags(assignment, { includeHalfAndHalf: true });

    let collarColor = "";
    let isHalfAndHalf = !!assignment?.isHalfAndHalf;

    if (category === "daycare") {
      collarColor = "pink";
    } else if (category === "dayboarding") {
      collarColor = "red";
    } else if (category === "evaluation") {
      collarColor = "yellow";
    } else if (category === "boarding") {
      if (operationalPlaygroup === "private_play") {
        collarColor = "red";
      } else if (operationalPlaygroup === "large" || sizeCategory === "LG") {
        collarColor = "green";
      } else if (operationalPlaygroup === "small" || sizeCategory === "SM") {
        collarColor = "blue";
      } else if (operationalPlaygroup === "evaluation") {
        collarColor = "yellow";
      } else {
        collarColor = "unclassified";
      }
    }

    if (!collarColor) continue;

    dogs.push({
      animalName: r.animal_name || rd.animal?.name || "Unknown",
      animalGingrId,
      ownerName: [r.owner_first_name || rd.owner?.first_name || "", r.owner_last_name || rd.owner?.last_name || ""].filter(Boolean).join(" "),
      breed,
      weight,
      sizeCategory,
      collarColor,
      reservationType: r.reservation_type_name || "",
      roomLabel,
      startDate: ((r.raw_data?.start_date || r.start_date || "").split("T")[0]) || "",
      startTime: formatTimeHuman(r.raw_data?.start_date || r.start_date || ""),
      endDate: ((r.raw_data?.end_date || r.end_date || "").split("T")[0]) || "",
      endTime: formatTimeHuman(r.raw_data?.end_date || r.end_date || ""),
      hasPrivatePlay,
      isHalfAndHalf,
      reservationGingrId,
      playGroupTitle,
      playGroupComment: iconComments.find(Boolean) || "",
      privatePlayTitle: hasPrivatePlay ? privatePlayTitle : "",
      privatePlayComment: hasPrivatePlay ? privatePlayComment : "",
      primaryDisplayPlaygroup: assignment?.primaryDisplayPlaygroup || null,
      playgroupTags,
      sourceIconTitles: iconTitles,
      sourceIconComments: iconComments,
      halfAndHalfNote: assignment?.halfAndHalfNote || null,
      unresolvedReason: assignment?.unresolvedReason || null,
    });
  }

  // Sort by collar color group, then by animal name
  const colorOrder: Record<string, number> = { pink: 0, red: 1, green: 2, blue: 3, yellow: 4, unclassified: 5 };
  dogs.sort((a, b) => {
    const ca = colorOrder[a.collarColor] ?? 5;
    const cb = colorOrder[b.collarColor] ?? 5;
    if (ca !== cb) return ca - cb;
    return (a.animalName || "").localeCompare(b.animalName || "");
  });

  // Build summary counts
  const summary = { total: dogs.length, pink: 0, red: 0, green: 0, blue: 0, yellow: 0, unclassified: 0, halfAndHalf: 0 };
  for (const d of dogs) {
    if (d.collarColor === "pink") summary.pink++;
    else if (d.collarColor === "red") summary.red++;
    else if (d.collarColor === "green") summary.green++;
    else if (d.collarColor === "blue") summary.blue++;
    else if (d.collarColor === "yellow") summary.yellow++;
    else if (d.collarColor === "unclassified") summary.unclassified++;
    if (d.isHalfAndHalf) summary.halfAndHalf++;
  }

  // Fetch completions from lite_settings
  const completionKey = `ops_collars_completions_${targetDate}`;
  const { data: completionRows } = await supabase
    .from("lite_settings")
    .select("setting_value")
    .eq("location_id", locationId)
    .eq("setting_key", completionKey)
    .limit(1);
  const completions: Record<string, any> = (completionRows && completionRows.length > 0 && completionRows[0].setting_value) ? completionRows[0].setting_value : {};

  const totalCount = dogs.length;
  const completedCount = Object.values(completions).filter((c: any) => c && c.status === "complete").length;

  return { dogs, summary, completions, totalCount, completedCount };
}

// ─── 8d. Lodging Transfers (room changes detected from occupancy data) ────

const ROOM_TYPE_MAP: Record<string, string> = {
  "luxury": "Luxury Suite",
  "executive": "Executive Room",
  "double": "Double Compartment",
  "single": "Single Compartment",
};

function classifyRoomType(roomName: string): string {
  const lower = (roomName || "").toLowerCase();
  if (lower.includes("luxury")) return "Luxury Suite";
  if (lower.includes("executive")) return "Executive Room";
  if (lower.includes("double")) return "Double Compartment";
  if (lower.includes("single")) return "Single Compartment";
  return "";
}

async function computeLodgingTransfers(
  supabase: any,
  locationId: string,
  targetDate: string,
  gingrSubdomain?: string,
  gingrApiKey?: string,
): Promise<any> {
  const transfers: any[] = [];

  // ── Primary: Fetch from Gingr's dedicated Lodging Transfer Report ──
  // This is the source of truth — it catches within-day transfers that
  // occupancy comparison misses, and doesn't depend on room sync being current.
  let webTransfers: Array<{ animalName: string; ownerName: string; fromRoom: string; toRoom: string }> = [];
  if (gingrSubdomain && gingrApiKey) {
    try {
      const webCookies = await gingrWebLogin(gingrSubdomain, gingrApiKey);
      webTransfers = await fetchLodgingTransferReport(gingrSubdomain, webCookies, targetDate);
    } catch (err) {
      console.error("Lodging transfer web report error:", err);
    }
  }

  // Build weight/breed lookup for matched animals
  const { data: activeRes } = await supabase
    .from("gingr_reservations")
    .select("gingr_id, animal_gingr_id, animal_name, owner_first_name, owner_last_name, reservation_type_name, room_assignment, raw_data")
    .eq("location_id", locationId)
    .not("check_in_date", "is", null)
    .is("check_out_date", null)
    .is("cancelled_date", null);

  const resMap: Record<string, any> = {};
  for (const r of activeRes || []) {
    resMap[(r.animal_name || "").toLowerCase().trim()] = r;
  }

  const animalIds = (activeRes || []).map((r: any) => String(r.animal_gingr_id || "")).filter(Boolean);
  const uniqueAnimalIds = [...new Set(animalIds)];
  let weightMap: Record<string, number | null> = {};
  let breedMap: Record<string, string> = {};
  if (uniqueAnimalIds.length > 0) {
    const { data: animals } = await supabase
      .from("gingr_animals")
      .select("gingr_id, weight, breed_name")
      .in("gingr_id", uniqueAnimalIds);
    for (const a of animals || []) {
      const w = a.weight ? parseFloat(a.weight) : null;
      weightMap[a.gingr_id] = (w && !isNaN(w)) ? w : null;
      breedMap[a.gingr_id] = a.breed_name || "";
    }
  }

  if (webTransfers.length > 0) {
    // Use web report transfers as the authoritative source
    for (const wt of webTransfers) {
      const previousRoom = wt.fromRoom;
      const currentRoom = wt.toRoom;
      const prevType = classifyRoomType(previousRoom);
      const currType = classifyRoomType(currentRoom);
      const roomTypeChanged = prevType !== currType && prevType !== "" && currType !== "";

      // Try to match to a reservation for extra metadata
      // The web report may have animal names like "Meg" or "Oslo Teddy (Ozzy)"
      const nameKey = (wt.animalName || "").toLowerCase().trim().split(/\s*\(/)[0].trim();
      const res = resMap[nameKey] || resMap[wt.animalName.toLowerCase().trim()];
      const animalGingrId = res ? String(res.animal_gingr_id || "") : "";
      const weight = animalGingrId ? (weightMap[animalGingrId] ?? null) : null;
      const sizeCategory = animalGingrId ? getSizeCategory(animalGingrId, weight) : null;
      const breed = animalGingrId ? (breedMap[animalGingrId] || res?.raw_data?.animal?.breed || "") : "";
      const ownerName = wt.ownerName || (res ? [res.owner_first_name || "", res.owner_last_name || ""].filter(Boolean).join(" ") : "");

      const actionItems: string[] = [
        `Move belongings from ${previousRoom} to ${currentRoom}`,
        `Clean/disinfect old room (${previousRoom})`,
        `Set up new room (${currentRoom})`,
      ];
      if (roomTypeChanged) {
        actionItems.splice(1, 0, `Update collar — was ${prevType}, now ${currType}`);
      }

      transfers.push({
        animalName: wt.animalName || "Unknown",
        animalGingrId,
        ownerName,
        breed,
        weight,
        sizeCategory,
        previousRoom,
        currentRoom,
        transferDate: targetDate,
        reservationType: res?.reservation_type_name || "",
        reservationGingrId: res ? String(res.gingr_id || "") : "",
        roomTypeChanged,
        previousRoomType: prevType,
        currentRoomType: currType,
        actionItems,
      });
    }
  } else {
    // ── Fallback: Day-over-day occupancy comparison ──
    // Compare gingr_room_occupancy between targetDate - 1 and targetDate.
    // Animals present on both days whose run_name changed are transfers.
    const prevDate = addDays(targetDate, -1);

    const [{ data: prevOcc }, { data: currOcc }] = await Promise.all([
      supabase
        .from("gingr_room_occupancy")
        .select("run_name, animal_names, gingr_run_id")
        .eq("location_id", locationId)
        .eq("occupancy_date", prevDate)
        .eq("occupied", true),
      supabase
        .from("gingr_room_occupancy")
        .select("run_name, animal_names, gingr_run_id")
        .eq("location_id", locationId)
        .eq("occupancy_date", targetDate)
        .eq("occupied", true),
    ]);

    // Parse animal_names into { animalName -> { runName, ownerName } }
    function parseOccupancyRows(rows: any[]): Record<string, { runName: string; ownerName: string }> {
      const map: Record<string, { runName: string; ownerName: string }> = {};
      for (const row of rows || []) {
        if (!row.animal_names || !row.run_name) continue;
        const entries = (row.animal_names as string).split("<br>").map((e: string) => e.trim()).filter(Boolean);
        for (const entry of entries) {
          // Handle names like "Oslo Teddy (Ozzy) (Samantha  Schramak)"
          // Owner name is the LAST parenthesized group
          const parenGroups: string[] = [];
          const parenRe = /\(([^)]+)\)/g;
          let m;
          while ((m = parenRe.exec(entry)) !== null) {
            parenGroups.push(m[1].trim());
          }
          let dogName: string;
          let ownerName = "";
          if (parenGroups.length >= 1) {
            ownerName = parenGroups[parenGroups.length - 1];
            const lastParenIdx = entry.lastIndexOf(`(${ownerName})`);
            dogName = entry.substring(0, lastParenIdx).trim();
          } else {
            dogName = entry.trim();
          }
          if (dogName) {
            map[dogName.toLowerCase()] = { runName: row.run_name, ownerName };
          }
        }
      }
      return map;
    }

    const prevMap = parseOccupancyRows(prevOcc);
    const currMap = parseOccupancyRows(currOcc);

    for (const [nameKey, curr] of Object.entries(currMap)) {
      const prev = prevMap[nameKey];
      if (!prev) continue; // new arrival, not a transfer
      if (prev.runName === curr.runName) continue; // same room

      const previousRoom = prev.runName;
      const currentRoom = curr.runName;
      const prevType = classifyRoomType(previousRoom);
      const currType = classifyRoomType(currentRoom);
      const roomTypeChanged = prevType !== currType && prevType !== "" && currType !== "";

      // Try to enrich with reservation data
      const res = resMap[nameKey] || resMap[nameKey.split(/\s*\(/)[0].trim()];
      const animalGingrId = res ? String(res.animal_gingr_id || "") : "";
      const weight = animalGingrId ? (weightMap[animalGingrId] ?? null) : null;
      const sizeCategory = animalGingrId ? getSizeCategory(animalGingrId, weight) : null;
      const breed = animalGingrId ? (breedMap[animalGingrId] || res?.raw_data?.animal?.breed || "") : "";
      const ownerName = res ? [res.owner_first_name || "", res.owner_last_name || ""].filter(Boolean).join(" ") : (curr.ownerName || prev.ownerName || "");

      // Reconstruct display name from current occupancy data
      let displayName = nameKey;
      for (const row of currOcc || []) {
        if (!row.animal_names) continue;
        const entries = (row.animal_names as string).split("<br>").map((e: string) => e.trim()).filter(Boolean);
        for (const entry of entries) {
          if (entry.toLowerCase().startsWith(nameKey)) {
            const parenGroups: string[] = [];
            const parenRe = /\(([^)]+)\)/g;
            let m2;
            while ((m2 = parenRe.exec(entry)) !== null) {
              parenGroups.push(m2[1].trim());
            }
            if (parenGroups.length >= 1) {
              const ownerParen = parenGroups[parenGroups.length - 1];
              const lastIdx = entry.lastIndexOf(`(${ownerParen})`);
              displayName = entry.substring(0, lastIdx).trim();
            } else {
              displayName = entry.trim();
            }
            break;
          }
        }
        if (displayName !== nameKey) break;
      }

      const actionItems: string[] = [
        `Move belongings from ${previousRoom} to ${currentRoom}`,
        `Clean/disinfect old room (${previousRoom})`,
        `Set up new room (${currentRoom})`,
      ];
      if (roomTypeChanged) {
        actionItems.splice(1, 0, `Update collar — was ${prevType}, now ${currType}`);
      }

      transfers.push({
        animalName: displayName || "Unknown",
        animalGingrId,
        ownerName,
        breed,
        weight,
        sizeCategory,
        previousRoom,
        currentRoom,
        transferDate: targetDate,
        reservationType: res?.reservation_type_name || "",
        reservationGingrId: res ? String(res.gingr_id || "") : "",
        roomTypeChanged,
        previousRoomType: prevType,
        currentRoomType: currType,
        actionItems,
      });
    }
  }

  // Sort by animal name
  transfers.sort((a: any, b: any) => (a.animalName || "").localeCompare(b.animalName || ""));

  // Fetch completions from lite_settings
  const completionKey = `ops_lodging_transfer_completions_${targetDate}`;
  const { data: completionRows } = await supabase
    .from("lite_settings")
    .select("setting_value")
    .eq("location_id", locationId)
    .eq("setting_key", completionKey)
    .limit(1);
  const completions: Record<string, any> = (completionRows && completionRows.length > 0 && completionRows[0].setting_value) ? completionRows[0].setting_value : {};

  const totalCount = transfers.length;
  const completedCount = Object.values(completions).filter((c: any) => c && c.status === "complete").length;

  return {
    transfers,
    summary: { total: transfers.length, roomTypeChanged: transfers.filter((t: any) => t.roomTypeChanged).length },
    completions,
    totalCount,
    completedCount,
  };
}

// ─── 9. Service Reports (pamper, enrichment, etc.) ────────────────────────

interface ServiceDog {
  animalId: string;
  animalName: string;
  ownerName: string;
  roomLabel: string;
  reservationType: string;
  services: string[];
}

function normalizeAddonStatus(value: any): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
}

function isOperationalAddonStatus(value: any): boolean {
  const normalized = normalizeAddonStatus(value);
  if (!normalized) return true;
  return ["scheduled", "confirmed", "checked-in", "completed"].includes(normalized);
}

function computeServiceReport(
  reservations: Record<string, any>,
  filterKeyword: string,
): any {
  const dogs: ServiceDog[] = [];
  const seen = new Set<string>();

  for (const res of Object.values(reservations)) {
    const services = res.services || [];
    const matched = services.filter((s: any) =>
      isOperationalAddonStatus(
        s?.status || s?.service_status || s?.reservation_status || s?.booking_status,
      ) &&
      (s.name || s.service_name || "")
        .toLowerCase()
        .includes(filterKeyword.toLowerCase()),
    );
    const reservationType = res.reservation_type?.type || res.reservationType || "";
    const isLuxurySuite = filterKeyword.toLowerCase() === "pamper" &&
      reservationType.toLowerCase().includes("luxury suite");

    if (matched.length === 0 && !isLuxurySuite) continue;

    const animalId = String(res.animal?.id || "");
    if (!animalId || seen.has(animalId)) continue;
    seen.add(animalId);

    const ownerFirst = res.owner?.first_name || "";
    const ownerLast = res.owner?.last_name || "";

    dogs.push({
      animalId,
      animalName: res.animal?.name || "",
      ownerName: `${ownerFirst} ${ownerLast}`.trim(),
      roomLabel: res.roomLabel || res.room?.name || "",
      reservationType,
      services: matched.length > 0
        ? matched.map((s: any) => s.name || s.service_name || filterKeyword)
        : ["Luxury Suite"],
    });
  }

  dogs.sort((a, b) => a.animalName.localeCompare(b.animalName));

  return { dogs };
}

/**
 * Enhanced enrichment report that includes:
 * 1. ALL dogs with enrichment scheduled for today (boarding + daycare + pending)
 * 2. "Suggested" enrichments: dogs checked in who have enrichment on their reservation
 *    but not specifically scheduled for today
 */
function computeEnrichmentReport(
  liveReservations: Record<string, any>,
  dbReservations: Record<string, any>,
  targetDate: string,
): any {
  const scheduled: ServiceDog[] = [];
  const suggested: Array<ServiceDog & { reason: string }> = [];
  const seen = new Set<string>();

  // Merge live + DB reservations, preferring live data
  const merged: Record<string, any> = { ...dbReservations };
  for (const [id, res] of Object.entries(liveReservations)) {
    merged[id] = res;
  }

  for (const res of Object.values(merged)) {
    const services = res.services || [];
    const animalId = String(res.animal?.id || res.animalGingrId || "");
    if (!animalId || seen.has(animalId)) continue;

    const enrichmentServices = services.filter((s: any) =>
      isOperationalAddonStatus(
        s?.status || s?.service_status || s?.reservation_status || s?.booking_status,
      ) &&
      (s.name || s.service_name || "")
        .toLowerCase()
        .includes("enrichment"),
    );

    if (enrichmentServices.length === 0) continue;
    seen.add(animalId);

    const ownerFirst = res.owner?.first_name || "";
    const ownerLast = res.owner?.last_name || "";

    // Check if any enrichment is scheduled for the target date
    const scheduledForToday = enrichmentServices.some((s: any) => {
      const schedAt = s.scheduled_at || s.scheduled_date || "";
      return schedAt.includes(targetDate);
    });

    const resType = res.reservation_type?.type || "";
    const svcNames = enrichmentServices.map(
      (s: any) => s.name || s.service_name || "enrichment",
    );

    const dog: ServiceDog & { status?: string; reservationType?: string; summary?: string } = {
      animalId,
      animalName: res.animal?.name || "",
      ownerName: `${ownerFirst} ${ownerLast}`.trim(),
      roomLabel: res.roomLabel || res.room?.name || "",
      services: svcNames,
      status: scheduledForToday ? "scheduled" : "suggested",
      reservationType: resType,
      summary: svcNames.join(", "),
    };

    if (scheduledForToday) {
      scheduled.push(dog);
    } else {
      // Has enrichment on reservation but not specifically scheduled for today — suggest it
      const serviceDates = enrichmentServices.map((s: any) => s.scheduled_at || s.scheduled_date || "unknown").join(", ");
      suggested.push({
        ...dog,
        reason: `Enrichment on reservation (scheduled: ${serviceDates}) but not specifically for ${targetDate}`,
      });
    }
  }

  scheduled.sort((a, b) => a.animalName.localeCompare(b.animalName));
  suggested.sort((a, b) => a.animalName.localeCompare(b.animalName));

  return {
    dogs: [...scheduled, ...suggested.map(s => ({ ...s, isSuggested: true }))],
    scheduled,
    suggested,
    scheduledCount: scheduled.length,
    suggestedCount: suggested.length,
  };
}

// ─── Fetch DB reservations for a target date (for service reports) ─────────

async function fetchReservationsForDate(
  supabase: any,
  locationId: string,
  targetDate: string,
): Promise<Record<string, any>> {
  const nextDay = addDays(targetDate, 1);
  const resSelect = "gingr_id, animal_gingr_id, animal_name, owner_first_name, owner_last_name, reservation_type_name, start_date, end_date, check_in_date, check_out_date, cancelled_date, raw_data, services, room_assignment";

  const [{ data: activeRes }, { data: pendingRes }] = await Promise.all([
    // Dogs checked in whose stay spans the target date
    supabase.from("gingr_reservations").select(resSelect)
      .eq("location_id", locationId)
      .not("check_in_date", "is", null).is("check_out_date", null).is("cancelled_date", null)
      .lte("start_date", `${targetDate}T23:59:59`).gte("end_date", `${targetDate}T00:00:00`),
    // Dogs with reservations starting on the target date (not yet checked in)
    supabase.from("gingr_reservations").select(resSelect)
      .eq("location_id", locationId)
      .is("check_in_date", null).is("check_out_date", null).is("cancelled_date", null)
      .gte("start_date", `${targetDate}T00:00:00`).lt("start_date", nextDay + "T00:00:00"),
  ]);

  // Deduplicate and convert to the format expected by computeServiceReport / computePrivatePlay
  const seen = new Set<string>();
  const result: Record<string, any> = {};
  for (const r of [...(activeRes || []), ...(pendingRes || [])]) {
    const id = String(r.gingr_id);
    if (seen.has(id)) continue;
    seen.add(id);
    const rd = r.raw_data || {};
    result[id] = {
      animal: {
        id: r.animal_gingr_id || rd.animal?.id || "",
        name: r.animal_name || rd.animal?.name || "",
      },
      owner: {
        first_name: r.owner_first_name || rd.owner?.first_name || "",
        last_name: r.owner_last_name || rd.owner?.last_name || "",
      },
      reservation_type: rd.reservation_type || { type: r.reservation_type_name || "" },
      services: Array.isArray(r.services) ? r.services : (rd.services || []),
      animalGingrId: String(r.animal_gingr_id || rd.animal?.id || ""),
      checkInDate: r.check_in_date || null,
      startDate: r.start_date || "",
      roomLabel: r.room_assignment || rd.room?.name || "",
      breed: rd.animal?.breed || "",
    };
  }
  return result;
}

// ─── Main handler ──────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    let locationId: string | null = null;
    let dateOverride: string | null = null;

    // Parse body if present
    try {
      const body = await req.json();
      if (body.location_id) locationId = body.location_id;
      if (body.date) dateOverride = body.date;
    } catch {
      // No body or invalid JSON
    }

    if (!locationId) {
      return new Response(
        JSON.stringify({ error: "location_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const today = dateOverride || todayStr();
    const startTime = Date.now();

    // Initialize Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ─── Load Gingr credentials for this location ─────────────────────
    // Primary: lite_settings gingr_config (same as gingr-sync)
    // Fallback: k9_gingr_credentials table
    const { data: settingsRows } = await supabase
      .from("lite_settings")
      .select("setting_value")
      .eq("location_id", locationId)
      .eq("setting_key", "gingr_config")
      .limit(1);

    const gingrConfig = settingsRows?.[0]?.setting_value;
    let gingrSubdomain: string;
    let gingrApiKey: string;
    let gingrLocationId: string;

    if (gingrConfig?.api_key && gingrConfig?.subdomain) {
      gingrSubdomain = gingrConfig.subdomain;
      gingrApiKey = gingrConfig.api_key;
      gingrLocationId = gingrConfig.gingr_location_id || "1";
    } else {
      // Fallback to k9_gingr_credentials
      const { data: creds } = await supabase
        .from("k9_gingr_credentials")
        .select("gingr_subdomain, gingr_api_key, gingr_location_id")
        .eq("location_id", locationId)
        .maybeSingle();

      if (!creds) {
        return new Response(
          JSON.stringify({ error: "No Gingr credentials found for location", location_id: locationId }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      gingrSubdomain = creds.gingr_subdomain;
      gingrApiKey = creds.gingr_api_key;
      gingrLocationId = creds.gingr_location_id || "1";
    }

    // ─── Fetch canonical playgroup assignments from Gingr Play icons ────────
    const liveAssignments = await fetchPlaygroupAssignments({
      supabase,
      locationId,
      columns: "animal_gingr_id, primary_display_playgroup, scheduling_playgroup, has_evaluation",
    });
    _globalGingrIconMappings = await fetchLocationIconMappings({ supabase, locationId });

    _globalPlaygroupMap = {};
    for (const assignment of liveAssignments || []) {
      const operational = getOperationalPlaygroupKey(assignment);
      if (operational) {
        _globalPlaygroupMap[assignment.animalGingrId] = operational;
      }
    }

    // ─── Fetch Gingr data in parallel ──────────────────────────────────
    const [bohResult, resResult] = await Promise.all([
      gingrFetch(
        gingrSubdomain,
        gingrApiKey,
        `back_of_house?location_id=${gingrLocationId}&full_day=true&include_daycare=true`,
        "GET",
      ),
      gingrFetch(gingrSubdomain, gingrApiKey, "reservations", "POST", { checked_in: "true" }),
    ]);

    const reservations: Record<string, any> = resResult.data || {};

    // ─── Load templates from DB (with fallbacks) in parallel ───────────
    const [openingTemplate, feTemplate, beTemplate, closingTemplate] =
      await Promise.all([
        loadTemplate(supabase, locationId, "opening", DEF_OPENING_TEMPLATE),
        loadTemplate(supabase, locationId, "fe_checklist", DEF_FE_TEMPLATE),
        loadTemplate(supabase, locationId, "be_checklist", DEF_BE_TEMPLATE),
        loadTemplate(supabase, locationId, "closing", DEF_CLOSING_TEMPLATE),
      ]);

    // ─── Compute all checklist items ───────────────────────────────────

    // 1. Room Cleaning
    const roomCleaning = await computeRoomCleaning(supabase, bohResult, locationId, today);

    // 2. Private Play — fetch weight/breed for PP dogs
    const ppAnimalIds = Object.values(reservations).map((r: any) => String(r.animal?.id || "")).filter(Boolean);
    let ppWeightMap: Record<string, number | null> = {};
    let ppBreedMap: Record<string, string> = {};
    if (ppAnimalIds.length > 0) {
      const { data: ppAnimals } = await supabase
        .from("gingr_animals")
        .select("gingr_id, weight, breed_name")
        .in("gingr_id", ppAnimalIds);
      for (const a of ppAnimals || []) {
        const w = a.weight ? parseFloat(a.weight) : null;
        ppWeightMap[a.gingr_id] = (w && !isNaN(w)) ? w : null;
        ppBreedMap[a.gingr_id] = a.breed_name || "";
      }
    }
    const privatePlay = await computePrivatePlay(
      supabase,
      locationId,
      today,
      reservations,
      ppWeightMap,
      ppBreedMap,
    );

    // 3. Opening Checklist
    const openingItems = filterByDayOfWeek(openingTemplate, today);

    // 4. Front-End Checklist
    const feItems = filterByDayOfWeek(feTemplate, today);

    // 5. Back-End Checklist
    const beItems = filterByDayOfWeek(beTemplate, today);

    // 6. Closing Checklist
    const closingItems = filterByDayOfWeek(closingTemplate, today);

    // 7. Weekly Maintenance
    const weeklyMaintenance = await computeWeeklyMaintenance(
      supabase,
      locationId,
      today,
    );

    // 8. Bathing Report (server-side bath type resolution)
    const bathingReport = await computeBathingReport(supabase, locationId, today, gingrSubdomain, gingrApiKey);

    // 9. Service Reports
    const pamperReport = computeServiceReport(reservations, "pamper");

    // 9b. Enrichment: Merge live Gingr data with DB reservations to include daycare + pending dogs
    const dbReservationsToday = await fetchReservationsForDate(supabase, locationId, today);
    const enrichmentReport = computeEnrichmentReport(reservations, dbReservationsToday, today);

    // 9c. Snapshot enrichment data so past-date lookups can find daycare dogs that checked out
    if (enrichmentReport.dogs && enrichmentReport.dogs.length > 0) {
      const snapRows = enrichmentReport.dogs.map((d: any) => ({
        location_id: locationId,
        report_date: today,
        animal_id: d.animalId || "",
        animal_name: d.animalName || "",
        owner_name: d.ownerName || "",
        services: d.services || [],
        reservation_type: d.reservationType || "",
        status: d.isSuggested ? "suggested" : "scheduled",
        scheduled_date: today,
        snapshot_at: new Date().toISOString(),
      })).filter((r: any) => r.animal_id);
      if (snapRows.length > 0) {
        await supabase.from("enrichment_snapshots").upsert(snapRows, {
          onConflict: "location_id,report_date,animal_id",
          ignoreDuplicates: false,
        });
      }
    }

    // 10. Belongings Report (departing dogs — fetch belongings from Gingr API)
    const belongingsReport = await computeBelongingsReport(supabase, locationId, today, gingrSubdomain, gingrApiKey);

    // 11. Collars Report (next-day collar preparation)
    const collarsReport = await computeCollarsReport(supabase, locationId, today);

    // 12. Lodging Transfers (from Gingr transfer report — day-of only, not in future loop)
    const lodgingTransfers = await computeLodgingTransfers(supabase, locationId, today, gingrSubdomain, gingrApiKey);

    // ─── Compute FUTURE days (today + 1 through today + 7) ─────────────
    // Skip Gingr web auth (service notes) for future days — only today gets those.
    const futureReports: Array<{
      date: string;
      bathing: any;
      privatePlay: any;
      pamper: any;
      enrichment: any;
      belongings: any;
      collars: any;
    }> = [];

    for (let offset = 1; offset <= 14; offset++) {
      const futureDate = addDays(today, offset);

      // Bathing: pull service notes for the next 3 days, skip for days 4-14
      const bathingFuture = offset <= 3
        ? await computeBathingReport(supabase, locationId, futureDate, gingrSubdomain, gingrApiKey)
        : await computeBathingReport(supabase, locationId, futureDate);

      // Belongings: fetch Gingr API data for next 3 days, DB-only for days 4-14
      const belongingsFuture = offset <= 3
        ? await computeBelongingsReport(supabase, locationId, futureDate, gingrSubdomain, gingrApiKey)
        : await computeBelongingsReport(supabase, locationId, futureDate);

      // Fetch DB reservations covering this future date
      const reservationsFuture = await fetchReservationsForDate(supabase, locationId, futureDate);

      // Fetch weight/breed for future PP dogs
      const futureAnimalIds = Object.values(reservationsFuture).map((r: any) => String(r.animalGingrId || r.animal?.id || "")).filter(Boolean);
      let futureWeightMap: Record<string, number | null> = {};
      let futureBreedMap: Record<string, string> = {};
      if (futureAnimalIds.length > 0) {
        const { data: futureAnimals } = await supabase
          .from("gingr_animals")
          .select("gingr_id, weight, breed_name")
          .in("gingr_id", futureAnimalIds);
        for (const a of futureAnimals || []) {
          const w = a.weight ? parseFloat(a.weight) : null;
          futureWeightMap[a.gingr_id] = (w && !isNaN(w)) ? w : null;
          futureBreedMap[a.gingr_id] = a.breed_name || "";
        }
      }
      const privatePlayFuture = await computePrivatePlay(
        supabase,
        locationId,
        futureDate,
        reservationsFuture,
        futureWeightMap,
        futureBreedMap,
      );
      const pamperFuture = computeServiceReport(reservationsFuture, "pamper");
      const enrichmentFuture = computeEnrichmentReport(reservationsFuture, reservationsFuture, futureDate);

      // Collars: DB-only for all future days
      const collarsFuture = await computeCollarsReport(supabase, locationId, futureDate);

      futureReports.push({
        date: futureDate,
        bathing: bathingFuture,
        privatePlay: privatePlayFuture,
        pamper: pamperFuture,
        enrichment: enrichmentFuture,
        belongings: belongingsFuture,
        collars: collarsFuture,
      });
    }

    // ─── Upsert all computed items ─────────────────────────────────────

    const upserts = [
      upsertComputedItems(
        supabase,
        `ops_room_cleaning_${today}`,
        locationId,
        "room_cleaning",
        "room_cleaning",
        today,
        roomCleaning,
      ),
      upsertComputedItems(
        supabase,
        `ops_pp_${today}`,
        locationId,
        "pp",
        "pp",
        today,
        privatePlay,
      ),
      upsertComputedItems(
        supabase,
        `ops_opening_${today}`,
        locationId,
        "checklist",
        "opening",
        today,
        openingItems,
      ),
      upsertComputedItems(
        supabase,
        `ops_fe_checklist_${today}`,
        locationId,
        "checklist",
        "fe_checklist",
        today,
        feItems,
      ),
      upsertComputedItems(
        supabase,
        `ops_be_checklist_${today}`,
        locationId,
        "checklist",
        "be_checklist",
        today,
        beItems,
      ),
      upsertComputedItems(
        supabase,
        `ops_closing_${today}`,
        locationId,
        "checklist",
        "closing",
        today,
        closingItems,
      ),
      upsertComputedItems(
        supabase,
        `ops_weekly_maintenance_${today}`,
        locationId,
        "weekly_maintenance",
        "weekly_maintenance",
        today,
        weeklyMaintenance,
      ),
      upsertComputedItems(
        supabase,
        `ops_bathing_${today}`,
        locationId,
        "bathing",
        "bathing",
        today,
        bathingReport,
      ),
      upsertComputedItems(
        supabase,
        `ops_pamper_${today}`,
        locationId,
        "pamper",
        "pamper",
        today,
        pamperReport,
      ),
      upsertComputedItems(
        supabase,
        `ops_svc_${today}`,
        locationId,
        "svc",
        "svc",
        today,
        enrichmentReport,
      ),
      upsertComputedItems(
        supabase,
        `ops_belongings_${today}`,
        locationId,
        "belongings",
        "belongings",
        today,
        belongingsReport,
      ),
      upsertComputedItems(
        supabase,
        `ops_collars_${today}`,
        locationId,
        "collars",
        "collars",
        today,
        collarsReport,
      ),
      upsertComputedItems(
        supabase,
        `ops_lodging_transfer_${today}`,
        locationId,
        "lodging_transfer",
        "lodging_transfer",
        today,
        lodgingTransfers,
      ),
      loadRollCallSessionRow(
        supabase,
        locationId,
        today,
        "opening",
        { createIfMissing: true },
      ),
      loadRollCallSessionRow(
        supabase,
        locationId,
        today,
        "closing",
        { createIfMissing: true },
      ),
      // ─── Future days upserts (14 days) ────────────────────────────
      ...futureReports.flatMap(fr => [
        upsertComputedItems(supabase, `ops_bathing_${fr.date}`, locationId, "bathing", "bathing", fr.date, fr.bathing),
        upsertComputedItems(supabase, `ops_pp_${fr.date}`, locationId, "pp", "pp", fr.date, fr.privatePlay),
        upsertComputedItems(supabase, `ops_pamper_${fr.date}`, locationId, "pamper", "pamper", fr.date, fr.pamper),
        upsertComputedItems(supabase, `ops_svc_${fr.date}`, locationId, "svc", "svc", fr.date, fr.enrichment),
        upsertComputedItems(supabase, `ops_belongings_${fr.date}`, locationId, "belongings", "belongings", fr.date, fr.belongings),
        upsertComputedItems(supabase, `ops_collars_${fr.date}`, locationId, "collars", "collars", fr.date, fr.collars),
      ]),
    ];

    const results = await Promise.allSettled(upserts);

    const errors = results
      .filter((r) => r.status === "rejected")
      .map((r) => (r as PromiseRejectedResult).reason?.message || "unknown");

    const duration = Date.now() - startTime;

    return new Response(
      JSON.stringify({
        success: errors.length === 0,
        date: today,
        location_id: locationId,
        duration_ms: duration,
        computed: {
          room_cleaning: roomCleaning.summary,
          private_play: privatePlay.summary,
          opening: { items: openingItems.length },
          fe_checklist: { items: feItems.length },
          be_checklist: { items: beItems.length },
          closing: { items: closingItems.length },
          weekly_maintenance: weeklyMaintenance.summary,
          bathing: { dogs: bathingReport.dogs.length },
          pamper: { dogs: pamperReport.dogs.length },
          enrichment: { dogs: enrichmentReport.dogs.length },
          belongings: { dogs: belongingsReport.dogs.length },
          collars: { dogs: collarsReport.dogs.length, summary: collarsReport.summary },
          lodging_transfers: { transfers: lodgingTransfers.transfers.length, summary: lodgingTransfers.summary },
        },
        computed_future: futureReports.map(fr => ({
          date: fr.date,
          bathing: { dogs: fr.bathing.dogs.length },
          private_play: fr.privatePlay.summary,
          pamper: { dogs: fr.pamper.dogs.length },
          enrichment: { dogs: fr.enrichment.dogs.length },
          belongings: { dogs: fr.belongings.dogs.length },
          collars: { dogs: fr.collars.dogs.length, summary: fr.collars.summary },
        })),
        errors: errors.length > 0 ? errors : undefined,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err: any) {
    console.error("ops-compute error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

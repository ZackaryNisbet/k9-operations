// ============================================================================
// Ops Compute Edge Function — K9 Operations Lite
// Fetches live Gingr data and computes all daily ops checklist items server-side.
// Upserts into lite_daily_ops.computed_items — NEVER touches the items column.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

// ─── Room type parsing ────────────────────────────────────────────────────

function parseRoomType(resType: string): string {
  // "Boarding | Double Compartment (All Inclusive)" → "Double Compartment"
  // "Boarding | Luxury Suite" → "Luxury Suite"
  const pipe = resType.indexOf("|");
  if (pipe === -1) return resType.trim();
  let after = resType.slice(pipe + 1).trim();
  // Strip parenthetical
  const paren = after.indexOf("(");
  if (paren !== -1) after = after.slice(0, paren).trim();
  return after;
}

// ─── 1. Room Cleaning ─────────────────────────────────────────────────────

interface DogDetail {
  name: string;
  ownerLastName: string;
  weight: number | null;
  suggestedBowlSize: string | null;
  setupReason: string | null;
  needsSetup: boolean;
}

interface RoomEntry {
  room: string;
  roomType: string;
  areaName: string;
  dogName: string;
  dogNames: string[];
  ownerLastName: string;
  reservationType: string;
  checkIn: string;
  checkOut: string;
  dayNumber: number;
  totalNights: number;
  cleaningType: string;
  needsDisinfect: boolean;
  needsRefresh: boolean;
  needsSetup: boolean;
  setupReason: string | null;
  suggestedBowlSize: string | null;
  dogWeight: number | null;
  isCheckedOut: boolean;
  dogs: DogDetail[];
}

function suggestBowlSize(weight: number | null): string {
  if (weight == null || weight <= 0) return "Unknown — verify";
  if (weight < 20) return "Small";
  if (weight <= 50) return "Medium";
  return "Large";
}

async function computeRoomCleaning(supabase: any, bohData: any, locationId: string, today: string): Promise<any> {
  // ─── Step 0: Load ALL rooms from gingr_runs (authoritative) ─────────
  // Falls back to lite_settings.room_names if gingr_runs hasn't synced yet
  const { data: gingrRuns } = await supabase
    .from("gingr_runs")
    .select("gingr_run_id, run_name, area_name, run_type")
    .eq("location_id", locationId);

  let allRoomNames: Array<{ runName: string; areaName: string; runType: string }> = [];
  if (gingrRuns && gingrRuns.length > 0) {
    allRoomNames = gingrRuns.map((r: any) => ({
      runName: r.run_name,
      areaName: r.area_name || "",
      runType: r.run_type || "",
    }));
  } else {
    // Fallback: old lite_settings room_names
    const { data: roomNamesSetting } = await supabase
      .from("lite_settings")
      .select("setting_value")
      .eq("location_id", locationId)
      .eq("setting_key", "room_names")
      .maybeSingle();
    const roomNamesConfig: Record<string, string[]> = roomNamesSetting?.setting_value || {};
    for (const [roomType, roomList] of Object.entries(roomNamesConfig)) {
      if (!Array.isArray(roomList)) continue;
      for (const roomName of roomList) {
        allRoomNames.push({ runName: roomName, areaName: "", runType: roomType });
      }
    }
  }

  // Build reverse lookup: room name → physical room type
  const roomNameToType: Record<string, string> = {};
  for (const rn of allRoomNames) {
    if (rn.runName) roomNameToType[rn.runName] = rn.runType || rn.areaName || "";
  }

  // ─── Step 0b: Load authoritative room occupancy from gingr_room_occupancy ──
  const { data: roomOccupancy } = await supabase
    .from("gingr_room_occupancy")
    .select("gingr_run_id, run_name, area_name, animal_names, occupied")
    .eq("location_id", locationId)
    .eq("occupancy_date", today);

  // Build occupancy lookup: animal name → room info (from gingr_room_occupancy)
  // animal_names format: "Bauer (Jill Beckett)<br>Watson (Chris Wright)"
  const occupancyRoomMap: Record<string, { runName: string; areaName: string }> = {};
  for (const occ of roomOccupancy || []) {
    if (occ.occupied && occ.animal_names) {
      const entries = occ.animal_names.split(/<br\s*\/?>/i);
      for (const entry of entries) {
        // Extract dog name before the parenthesized owner name
        const dogName = entry.replace(/\s*\(.*\)\s*$/, "").trim().toLowerCase();
        if (dogName) {
          occupancyRoomMap[dogName] = { runName: occ.run_name, areaName: occ.area_name || "" };
        }
      }
    }
  }

  // ─── Step 1: Build room name lookup from BOH ─────────────────────────
  // BOH with full_day=true returns ALL currently-housed dogs, not just
  // today's check-ins/outs. Each dog has run_name = actual Gingr room.
  const bohRoomMap: Record<string, { runName: string; areaName: string }> = {};
  const checkingOut = bohData?.data?.checking_out || [];
  const checkingIn = bohData?.data?.checking_in || [];
  for (const dog of [...checkingOut, ...checkingIn]) {
    const animalId = String(dog.animal_id || dog.id || "");
    if (animalId && dog.run_name) {
      bohRoomMap[animalId] = { runName: dog.run_name, areaName: dog.area_name || "" };
    }
  }

  // ─── Step 1b: Persist BOH room assignments to ACTIVE reservations ───
  // BOH is the only reliable source for room assignments.
  // Filter for active reservations only (checked in, NOT checked out, not cancelled)
  // to avoid updating old/completed reservations for the same animal.
  if (Object.keys(bohRoomMap).length > 0) {
    const animalIds = Object.keys(bohRoomMap);
    const { data: bohReservations } = await supabase
      .from("gingr_reservations")
      .select("gingr_id, animal_gingr_id, room_assignment")
      .eq("location_id", locationId)
      .not("check_in_date", "is", null)
      .is("check_out_date", null)
      .is("cancelled_date", null)
      .in("animal_gingr_id", animalIds);

    const updates: Array<{ gingr_id: string; room: string }> = [];
    for (const res of bohReservations || []) {
      const aid = String(res.animal_gingr_id);
      const boh = bohRoomMap[aid];
      if (boh?.runName && res.room_assignment !== boh.runName) {
        updates.push({ gingr_id: res.gingr_id, room: boh.runName });
      }
    }

    for (const { gingr_id, room } of updates) {
      await supabase
        .from("gingr_reservations")
        .update({ room_assignment: room })
        .eq("gingr_id", gingr_id)
        .eq("location_id", locationId);
    }
  }

  // ─── Step 1c: Persist occupancy-based room assignments ──────────────
  // For dogs with no room_assignment and no BOH match, use gingr_room_occupancy
  if (Object.keys(occupancyRoomMap).length > 0) {
    const { data: unassignedRes } = await supabase
      .from("gingr_reservations")
      .select("gingr_id, animal_name, room_assignment")
      .eq("location_id", locationId)
      .not("check_in_date", "is", null)
      .is("check_out_date", null)
      .is("cancelled_date", null)
      .is("room_assignment", null);

    const occUpdates: Array<{ gingr_id: string; room: string }> = [];
    for (const res of unassignedRes || []) {
      const nameLower = (res.animal_name || "").trim().toLowerCase();
      const occ = nameLower ? occupancyRoomMap[nameLower] : null;
      if (occ?.runName) {
        occUpdates.push({ gingr_id: res.gingr_id, room: occ.runName });
      }
    }

    for (const { gingr_id, room } of occUpdates) {
      await supabase
        .from("gingr_reservations")
        .update({ room_assignment: room })
        .eq("gingr_id", gingr_id)
        .eq("location_id", locationId);
    }
  }

  // ─── Step 2: Get ALL active boarding reservations from Supabase ──────
  // These are dogs currently checked in (have check_in_date, no check_out_date, not cancelled)
  // BOH has all in-house dogs, but we also query Supabase for completeness.
  const resSelect = "gingr_id, animal_gingr_id, animal_name, owner_gingr_id, owner_first_name, owner_last_name, reservation_type_name, start_date, end_date, check_in_date, check_out_date, raw_data, room_assignment";
  const [{ data: activeReservations }, { data: checkedOutToday }] = await Promise.all([
    supabase
      .from("gingr_reservations")
      .select(resSelect)
      .eq("location_id", locationId)
      .not("check_in_date", "is", null)
      .is("check_out_date", null)
      .is("cancelled_date", null),
    // Also fetch dogs checked out TODAY — they still need disinfect
    supabase
      .from("gingr_reservations")
      .select(resSelect)
      .eq("location_id", locationId)
      .not("check_in_date", "is", null)
      .not("check_out_date", "is", null)
      .gte("check_out_date", today + "T00:00:00")
      .lt("check_out_date", addDays(today, 1) + "T00:00:00")
      .is("cancelled_date", null),
  ]);
  const allReservations = [...(activeReservations || []), ...(checkedOutToday || [])];

  const rooms: RoomEntry[] = [];
  const seenAnimals = new Set<string>();

  // ─── Step 2b: Pre-compute placeholder room names for unassigned dogs ──
  // Check occupancy map (from gingr_room_occupancy) before falling back to "(unlinked)".
  const unassignedRoomNames: Record<string, string> = {}; // gingr_id → room name
  {
    const typeCounters: Record<string, number> = {};
    for (const res of allReservations) {
      const animalId = res.animal_gingr_id ? String(res.animal_gingr_id) : "";
      const bohInfo = animalId ? bohRoomMap[animalId] : null;
      const resNameLower = (res.animal_name || "").trim().toLowerCase();
      const occInfo = resNameLower ? occupancyRoomMap[resNameLower] : null;
      const hasRoom = res.room_assignment || bohInfo?.runName || occInfo?.runName || res.raw_data?.run_name;
      if (hasRoom) continue;
      const typeName = res.reservation_type_name || "";
      const tLower = typeName.toLowerCase();
      if (tLower.startsWith("daycare") || tLower.startsWith("day care") || tLower.includes("resort tour")) continue;
      const roomType = parseRoomType(typeName);
      typeCounters[roomType] = (typeCounters[roomType] || 0) + 1;
      unassignedRoomNames[res.gingr_id] = `${roomType} (unlinked) #${typeCounters[roomType]}`;
    }
  }

  // ─── Step 3: Process all active reservations + today's checkouts ────
  for (const res of allReservations) {
    const typeName = res.reservation_type_name || "";
    const tLower = typeName.toLowerCase();

    // Skip non-boarding reservation types (no room needed)
    if (tLower.startsWith("daycare") || tLower.startsWith("day care") || tLower.includes("resort tour")) continue;

    const animalId = res.animal_gingr_id ? String(res.animal_gingr_id) : "";
    if (animalId && seenAnimals.has(animalId)) continue;
    if (animalId) seenAnimals.add(animalId);

    const isDayBoarding = tLower.includes("day boarding");
    const isCheckedOut = !!res.check_out_date;

    // Get dates — Supabase stores as TIMESTAMPTZ
    const startDate = res.start_date ? res.start_date.split("T")[0] : today;
    const endDate = res.end_date ? res.end_date.split("T")[0] : today;

    // Room name: room_assignment (server-side) → BOH lookup → occupancy lookup → raw_data → generate from type
    const bohInfo = animalId ? bohRoomMap[animalId] : null;
    const dogNameLower = (res.animal_name || "").trim().toLowerCase();
    const occInfo = dogNameLower ? occupancyRoomMap[dogNameLower] : null;
    const runName = res.room_assignment || bohInfo?.runName || occInfo?.runName || res.raw_data?.run_name || "";
    const areaName = bohInfo?.areaName || occInfo?.areaName || res.raw_data?.area_name || "";
    // Use physical room type when room is known, fall back to reservation type
    const roomType = (runName && roomNameToType[runName]) || parseRoomType(typeName);

    // Determine cleaning type
    let cleaningType = "refresh";
    let needsDisinfect = false;
    let needsRefresh = false;

    if (isCheckedOut || isDayBoarding) {
      // Checked out today or day boarding → full disinfect
      cleaningType = "disinfect";
      needsDisinfect = true;
    } else if (endDate === today) {
      // Last day — full disinfect needed
      cleaningType = "disinfect";
      needsDisinfect = true;
    } else if (startDate === today) {
      // First day — room is already fresh from setup, no refresh needed
      cleaningType = "none";
      needsRefresh = false;
    } else {
      // Middle of stay — refresh
      cleaningType = "refresh";
      needsRefresh = true;
    }

    // Calculate day number and total nights
    const startD = new Date(startDate + "T12:00:00");
    const todayD = new Date(today + "T12:00:00");
    const endD = new Date(endDate + "T12:00:00");
    const dayNumber = Math.max(1, Math.round((todayD.getTime() - startD.getTime()) / 86400000) + 1);
    const totalNights = Math.max(1, Math.round((endD.getTime() - startD.getTime()) / 86400000));

    rooms.push({
      room: runName || unassignedRoomNames[res.gingr_id] || roomType,
      roomType,
      areaName,
      dogName: res.animal_name || "",
      dogNames: res.animal_name ? [res.animal_name] : [],
      ownerLastName: res.owner_last_name || "",
      reservationType: typeName,
      checkIn: startDate,
      checkOut: endDate,
      dayNumber,
      totalNights,
      cleaningType,
      needsDisinfect,
      needsRefresh,
      needsSetup: false,
      setupReason: null,
      suggestedBowlSize: null,
      dogWeight: null,
      isCheckedOut,
      dogs: res.animal_name ? [{ name: res.animal_name, ownerLastName: res.owner_last_name || "", weight: null, suggestedBowlSize: null, setupReason: null, needsSetup: false }] : [],
    });
  }

  // ─── Step 4: Also add BOH checking_out dogs not already in Supabase ──
  // (edge case: BOH might have dogs that haven't synced to Supabase yet)
  for (const dog of checkingOut) {
    const animalId = String(dog.animal_id || dog.id || "");
    if (animalId && seenAnimals.has(animalId)) continue;
    if (animalId) seenAnimals.add(animalId);

    const typeName = dog.type || "";
    if (typeName.toLowerCase().startsWith("daycare")) continue;

    const isDayBoarding = typeName.toLowerCase().startsWith("day boarding");
    const runName = dog.run_name || "";
    const roomType = (runName && roomNameToType[runName]) || parseRoomType(typeName);
    const startDate = (dog.start_date || "").split(" ")[0];
    const endDate = (dog.end_date || "").split(" ")[0];

    let cleaningType = "refresh";
    let needsDisinfect = false;
    let needsRefresh = false;

    if (isDayBoarding) { cleaningType = "disinfect"; needsDisinfect = true; }
    else if (endDate === today) { cleaningType = "disinfect"; needsDisinfect = true; }
    else if (startDate === today) { cleaningType = "none"; needsRefresh = false; }
    else { cleaningType = "refresh"; needsRefresh = true; }

    const startD = new Date(startDate + "T12:00:00");
    const todayD = new Date(today + "T12:00:00");
    const endD = new Date(endDate + "T12:00:00");
    const dayNumber = Math.max(1, Math.round((todayD.getTime() - startD.getTime()) / 86400000) + 1);
    const totalNights = Math.max(1, Math.round((endD.getTime() - startD.getTime()) / 86400000));

    rooms.push({
      room: runName || roomType,
      roomType,
      areaName: dog.area_name || "",
      dogName: dog.a_first || "",
      dogNames: dog.a_first ? [dog.a_first] : [],
      ownerLastName: dog.o_last || "",
      reservationType: typeName,
      checkIn: startDate,
      checkOut: endDate,
      dayNumber,
      totalNights,
      cleaningType,
      needsDisinfect,
      needsRefresh,
      needsSetup: false,
      setupReason: null,
      suggestedBowlSize: null,
      dogWeight: null,
      isCheckedOut: false,
      dogs: dog.a_first ? [{ name: dog.a_first, ownerLastName: dog.o_last || "", weight: null, suggestedBowlSize: null, setupReason: null, needsSetup: false }] : [],
    });
  }

  // ─── Step 5: Setup detection ─────────────────────────────────────────
  // Query today's reservations from Supabase for evaluation, dayboarding, and first-time daycare
  const { data: todayReservations } = await supabase
    .from("gingr_reservations")
    .select("gingr_id, animal_gingr_id, animal_name, owner_last_name, reservation_type_name, start_date, raw_data")
    .eq("location_id", locationId)
    .gte("start_date", today)
    .lt("start_date", addDays(today, 1))
    .is("cancelled_date", null);

  const setupDogs: Array<{
    animalGingrId: string;
    dogName: string;
    ownerLastName: string;
    reason: string;
    room: string | null;
  }> = [];

  for (const res of todayReservations || []) {
    const typeName = res.reservation_type_name || "";
    const t = typeName.toLowerCase();
    let reason: string | null = null;

    if (t.includes("evaluation") || t.includes("eval")) {
      reason = "Evaluation";
    } else if (t.includes("day boarding") || t === "day boarding") {
      reason = "Day Boarding";
    } else if (t.includes("daycare") || t.includes("day care")) {
      // Check if this is the dog's first daycare reservation ever
      const { count } = await supabase
        .from("gingr_reservations")
        .select("gingr_id", { count: "exact", head: true })
        .eq("animal_gingr_id", res.animal_gingr_id)
        .eq("location_id", locationId)
        .ilike("reservation_type_name", "%daycare%")
        .lt("start_date", today)
        .is("cancelled_date", null);
      if (count === 0) {
        reason = "First Daycare";
      }
    } else if (!t.includes("resort tour")) {
      // All other boarding check-ins get a setup
      reason = "Check-In";
    }

    if (reason) {
      const animalId = res.animal_gingr_id ? String(res.animal_gingr_id) : "";
      const bohInfo = animalId ? bohRoomMap[animalId] : null;
      const setupDogNameLower = (res.animal_name || "").trim().toLowerCase();
      const setupOccInfo = setupDogNameLower ? occupancyRoomMap[setupDogNameLower] : null;
      const runName = bohInfo?.runName || setupOccInfo?.runName || res.raw_data?.run_name || null;
      setupDogs.push({
        animalGingrId: res.animal_gingr_id,
        dogName: res.animal_name || "",
        ownerLastName: res.owner_last_name || "",
        reason,
        room: runName,
      });
    }
  }

  // Fetch weights for all setup dogs
  const setupAnimalIds = setupDogs.map((d) => d.animalGingrId).filter(Boolean);
  let weightMap: Record<string, number | null> = {};
  if (setupAnimalIds.length > 0) {
    const { data: animals } = await supabase
      .from("gingr_animals")
      .select("gingr_id, weight")
      .in("gingr_id", setupAnimalIds);
    for (const a of animals || []) {
      const w = a.weight ? parseFloat(a.weight) : null;
      weightMap[a.gingr_id] = (w && !isNaN(w)) ? w : null;
    }
  }

  // Match setup dogs to rooms (by dog name)
  const dogNameRoomMap = new Map<string, number>();
  rooms.forEach((r, i) => {
    if (r.dogName) dogNameRoomMap.set(r.dogName.toLowerCase(), i);
  });

  const unmatchedSetups: typeof setupDogs = [];
  for (const sd of setupDogs) {
    const weight = weightMap[sd.animalGingrId] ?? null;
    const bowlSize = suggestBowlSize(weight);

    let matched = false;
    const nameKey = sd.dogName.toLowerCase();
    if (dogNameRoomMap.has(nameKey)) {
      const idx = dogNameRoomMap.get(nameKey)!;
      rooms[idx].needsSetup = true;
      rooms[idx].setupReason = sd.reason;
      rooms[idx].suggestedBowlSize = bowlSize;
      rooms[idx].dogWeight = weight;
      // Update per-dog detail in dogs array
      const dogDetail = rooms[idx].dogs?.find(d => d.name.toLowerCase() === nameKey);
      if (dogDetail) {
        dogDetail.weight = weight;
        dogDetail.suggestedBowlSize = bowlSize;
        dogDetail.setupReason = sd.reason;
        dogDetail.needsSetup = true;
      }
      matched = true;
    }

    if (!matched) {
      unmatchedSetups.push(sd);
    }
  }

  // Add unmatched setup dogs as new room entries
  for (const sd of unmatchedSetups) {
    const weight = weightMap[sd.animalGingrId] ?? null;
    rooms.push({
      room: sd.room || "Unassigned",
      roomType: "",
      areaName: "",
      dogName: sd.dogName,
      dogNames: sd.dogName ? [sd.dogName] : [],
      ownerLastName: sd.ownerLastName,
      reservationType: sd.reason,
      checkIn: today,
      checkOut: today,
      dayNumber: 1,
      totalNights: 0,
      cleaningType: "none",
      needsDisinfect: false,
      needsRefresh: false,
      needsSetup: true,
      setupReason: sd.reason,
      suggestedBowlSize: suggestBowlSize(weight),
      dogWeight: weight,
      isCheckedOut: false,
      dogs: sd.dogName ? [{ name: sd.dogName, ownerLastName: sd.ownerLastName, weight, suggestedBowlSize: suggestBowlSize(weight), setupReason: sd.reason, needsSetup: true }] : [],
    });
  }

  // ─── Step 6: Merge in ALL known rooms (vacant ones too) ─────────────
  // Build a set of room names already in the list (occupied)
  const occupiedRoomNames = new Set(rooms.map((r) => r.room));
  for (const rn of allRoomNames) {
    if (occupiedRoomNames.has(rn.runName)) continue;
    rooms.push({
      room: rn.runName,
      roomType: rn.runType || rn.areaName,
      areaName: rn.areaName,
      dogName: "",
      dogNames: [],
      ownerLastName: "",
      reservationType: "",
      checkIn: "",
      checkOut: "",
      dayNumber: 0,
      totalNights: 0,
      cleaningType: "none",
      needsDisinfect: false,
      needsRefresh: false,
      needsSetup: false,
      setupReason: null,
      suggestedBowlSize: null,
      dogWeight: null,
      isCheckedOut: false,
      dogs: [],
    });
  }

  // ─── Step 7: Merge entries sharing the same room into one row ─────────
  // Multiple dogs in the same physical room should be one checklist row.
  const mergedMap: Record<string, RoomEntry> = {};
  for (const r of rooms) {
    if (mergedMap[r.room]) {
      const m = mergedMap[r.room];
      // Merge dog names
      for (const name of r.dogNames) {
        if (name && !m.dogNames.includes(name)) m.dogNames.push(name);
      }
      // Merge per-dog detail arrays
      for (const dog of (r.dogs || [])) {
        if (dog.name && !m.dogs.some(d => d.name === dog.name)) m.dogs.push(dog);
      }
      // Escalate cleaning needs — disinfect supersedes refresh
      if (r.needsDisinfect) { m.needsDisinfect = true; m.needsRefresh = false; m.cleaningType = "disinfect"; }
      else if (r.needsRefresh && !m.needsDisinfect) m.needsRefresh = true;
      if (r.needsSetup) { m.needsSetup = true; m.setupReason = r.setupReason || m.setupReason; }
      if (r.suggestedBowlSize) m.suggestedBowlSize = r.suggestedBowlSize;
      if (r.dogWeight) m.dogWeight = r.dogWeight;
      if (r.isCheckedOut) m.isCheckedOut = true;
      // Use the longest stay for day/night display
      if (r.totalNights > m.totalNights) {
        m.dayNumber = r.dayNumber;
        m.totalNights = r.totalNights;
        m.checkIn = r.checkIn;
        m.checkOut = r.checkOut;
      }
    } else {
      mergedMap[r.room] = { ...r, dogs: [...(r.dogs || [])] };
    }
  }
  // Update dogName to joined string for backward compat
  const mergedRooms = Object.values(mergedMap);
  for (const r of mergedRooms) {
    r.dogName = r.dogNames.join(", ");
  }

  // Sort by room type, then owner (so siblings are adjacent), then room name
  mergedRooms.sort((a, b) => {
    if (a.roomType !== b.roomType) return a.roomType.localeCompare(b.roomType);
    if (a.ownerLastName !== b.ownerLastName) return a.ownerLastName.localeCompare(b.ownerLastName);
    return a.room.localeCompare(b.room, undefined, { numeric: true });
  });

  const totalRefresh = mergedRooms.filter((r) => r.needsRefresh).length;
  const totalDisinfect = mergedRooms.filter((r) => r.needsDisinfect).length;
  const totalSetups = mergedRooms.filter((r) => r.needsSetup).length;
  const totalRooms = mergedRooms.length;

  return {
    rooms: mergedRooms,
    summary: {
      totalOccupied: mergedRooms.filter((r) => r.cleaningType !== "none").length,
      totalRooms,
      totalRefresh,
      totalDisinfect,
      totalSetups,
    },
  };
}

// ─── 2. Private Play ──────────────────────────────────────────────────────

interface PPDog {
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

function computePrivatePlay(reservations: Record<string, any>, weightMap: Record<string, number | null>, breedMap: Record<string, string>): any {
  const dogs: PPDog[] = [];
  const seen = new Set<string>();

  for (const res of Object.values(reservations)) {
    const animalId = String(res.animal?.id || "");
    const animalGingrId = String(res.animalGingrId || res.animal?.id || "");
    const animalName = res.animal?.name || "";
    const ownerFirst = res.owner?.first_name || "";
    const ownerLast = res.owner?.last_name || "";
    const ownerName = `${ownerFirst} ${ownerLast}`.trim();
    const resType = res.reservation_type?.type || "";

    // Day boarding dogs get PP
    const isDayBoarding = resType.toLowerCase().startsWith("day boarding");

    // Check for Private Play service
    const services = res.services || [];
    const hasPP = services.some((s: any) =>
      (s.name || s.service_name || "").toLowerCase().includes("private play"),
    );

    if ((isDayBoarding || hasPP) && animalId && !seen.has(animalId)) {
      seen.add(animalId);
      // Support both Gingr API format and DB-mapped format
      const isCheckedIn = (res.checkInDate != null) || (res.check_in_date != null);
      const startDate = res.startDate || res.start_date || "";
      const startTime = formatTimeHuman(startDate);
      const roomLabel = res.roomLabel || res.room?.name || "";
      const weight = weightMap[animalGingrId] ?? null;
      const sizeCategory = getSizeCategory(animalGingrId, weight);
      const breed = breedMap[animalGingrId] || res.breed || res.animal?.breed || "";

      dogs.push({
        animalId,
        animalName,
        ownerName,
        reservationType: resType,
        requiredSessions: 3,
        source: isDayBoarding ? "day_boarding" : "private_play_service",
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
  "NO CRATE DRYER", "NO VELOCITY DRYER", "TOWEL DRY ONLY", "*See account notes*",
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

async function computeBathingReport(supabase: any, locationId: string, today: string, gingrSubdomain?: string, gingrApiKey?: string): Promise<any> {
  // Fetch all reservations with bath services for today:
  //   1) Checked-in and not yet checked out (boarding dogs in-house)
  //   2) Checked out today (departures)
  //   3) NOT yet checked in but starting today (daycare, day-boarding, evaluation — may not be checked in yet)
  const resSelect = "gingr_id, animal_gingr_id, animal_name, owner_first_name, owner_last_name, reservation_type_name, start_date, end_date, check_out_date, raw_data, room_assignment, services, notes_reservation, notes_animal, notes_owner";
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

  // Filter to dogs with bath scheduled today
  const bathDogs: any[] = [];
  const animalIds: string[] = [];
  for (const r of allRes) {
    const rd = r.raw_data || {};
    const rawSvcs = rd.services || [];
    const topSvcs = Array.isArray(r.services) ? r.services : [];

    // Look for bath service in raw_data.services first, then fall back to top-level services column
    let bathSvc = rawSvcs.find((s: any) => typeof s === "object" && s?.name?.toLowerCase().includes("bath"));
    if (!bathSvc) {
      bathSvc = topSvcs.find((s: any) => typeof s === "object" && s?.name?.toLowerCase().includes("bath"));
    }
    const hasBathTop = topSvcs.some((s: any) => { const n = typeof s === "string" ? s : s?.name || ""; return n.toLowerCase().includes("bath"); });
    if (!bathSvc && !hasBathTop) continue;

    const scheduledAt = bathSvc?.scheduled_at || "";
    const isScheduledToday = scheduledAt.includes(today);
    // Prefer raw_data.end_date (has timezone like -04:00) over DB column (UTC)
    const endDate = rd.end_date || r.end_date || "";
    const isDepartingToday = endDate.includes(today);
    if (!isScheduledToday && !isDepartingToday) continue;

    const animalGingrId = String(r.animal_gingr_id || rd.animal?.id || "").trim();
    if (animalGingrId) animalIds.push(animalGingrId);

    // Use whichever services array has data for addon parsing
    const svcsForAddons = rawSvcs.length > 0 ? rawSvcs : topSvcs;
    const { addonType, modifiers } = parseBathAddonsFromServices(svcsForAddons);
    const resType = rd.reservation_type || {};
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
      bathServiceId: bathSvc?.id ? String(bathSvc.id) : "",
      animalName: r.animal_name || rd.animal?.name || "Unknown",
      ownerName: [r.owner_first_name || rd.owner?.first_name || "", r.owner_last_name || rd.owner?.last_name || ""].filter(Boolean).join(" "),
      breed: rd.animal?.breed || "",
      roomLabel,
      suiteType: resType.type || r.reservation_type_name || "",
      addonType,
      bathServiceName: bathSvc?.name || "",
      bathModifiers: modifiers,
      reservationNotes,
      scheduledAt,
      scheduledTime: formatTimeHuman(scheduledAt),
      departureTime: formatTimeHuman(endDate),
      departureTimeRaw: endDate,
      isCheckedOut: !!r.check_out_date,
      isDone: !!bathSvc?.completed_at,
    });
  }

  // ─── Fresh N' Clean auto-detection ─────────────────────────────────────
  // Dogs boarding exactly 1 night, departing today, with no bath service
  const bathDogResIds = new Set(bathDogs.map(d => d.gingrReservationId));
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

    bathDogs.push({
      animalGingrId,
      gingrReservationId: resId,
      bathServiceId: "",
      animalName: r.animal_name || rd.animal?.name || "Unknown",
      ownerName: [r.owner_first_name || rd.owner?.first_name || "", r.owner_last_name || rd.owner?.last_name || ""].filter(Boolean).join(" "),
      breed: rd.animal?.breed || "",
      roomLabel,
      suiteType: resType.type || r.reservation_type_name || "",
      addonType: "",
      bathServiceName: "",
      bathModifiers: [],
      reservationNotes,
      scheduledAt: endDate,
      scheduledTime: formatTimeHuman(endDate),
      departureTime: formatTimeHuman(endDate),
      departureTimeRaw: endDate,
      isCheckedOut: !!r.check_out_date,
      isDone: false,
      isFreshNClean: true,
    });
  }

  // Fetch bath icons, play icons, and weights for all dogs
  let iconMap: Record<string, { title: string; comment: string }> = {};
  let playIconMap: Record<string, string> = {}; // animal_id → play type (e.g. "Private Play")
  let weightMap: Record<string, number | null> = {};
  if (animalIds.length > 0) {
    const [{ data: icons }, { data: playIcons }, { data: animals }] = await Promise.all([
      supabase
        .from("gingr_animal_icons_live")
        .select("animal_gingr_id, icon_title, icon_comment")
        .eq("location_id", locationId)
        .eq("icon_group", "Bath")
        .in("animal_gingr_id", animalIds),
      supabase
        .from("gingr_animal_icons_live")
        .select("animal_gingr_id, icon_title")
        .eq("location_id", locationId)
        .eq("icon_group", "Play")
        .in("animal_gingr_id", animalIds),
      supabase
        .from("gingr_animals")
        .select("gingr_id, weight")
        .in("gingr_id", animalIds),
    ]);
    (icons || []).forEach((r: any) => {
      iconMap[r.animal_gingr_id] = { title: r.icon_title || "", comment: r.icon_comment || "" };
    });
    (playIcons || []).forEach((r: any) => {
      const title = (r.icon_title || "").toLowerCase();
      if (title.includes("private") && title.includes("play")) {
        playIconMap[r.animal_gingr_id] = "private_play";
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

  // Resolve bath type: Fresh N' Clean for auto-detected, else icon → add-on → service name → Standard
  const dogs = bathDogs.map((d, idx) => {
    const icon = iconMap[d.animalGingrId];
    const bathType = d.isFreshNClean
      ? "Fresh N' Clean"
      : (icon?.title
        || d.addonType
        || extractBathTypeFromName(d.bathServiceName)
        || "Standard");
    const weight = weightMap[d.animalGingrId] ?? null;
    // Size classification: <30 lbs = small, >=30 lbs = large
    const sizeCategory = getSizeCategory(animalGingrId, weight);
    const hasPrivatePlay = !!playIconMap[d.animalGingrId];

    return {
      animalGingrId: d.animalGingrId,
      gingrReservationId: d.gingrReservationId,
      animalName: d.animalName,
      ownerName: d.ownerName,
      breed: d.breed,
      roomLabel: d.roomLabel,
      suiteType: d.suiteType,
      bathType,
      bathModifiers: d.bathModifiers,
      bathNotes: icon?.comment || "",
      reservationNotes: d.reservationNotes || "",
      serviceNotes: d.isFreshNClean ? "" : (serviceNotesMap[idx] || ""),
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
    };
  });

  dogs.sort((a, b) => (a.scheduledAt || "").localeCompare(b.scheduledAt || ""));

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
  for (const dog of dogs) {
    const resId = `g${dog.gingrReservationId}`;
    const completedInfo = completions[resId] || null;
    if (completedInfo) {
      dog.isDone = true;
      (dog as any).completedBy = completedInfo.by || "";
      (dog as any).completedAt = completedInfo.at || "";
    }
  }

  const totalCount = dogs.length;
  const completedCount = dogs.filter(d => d.isDone).length;

  return { dogs, completions, totalCount, completedCount };
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
  const resSelect = "gingr_id, animal_gingr_id, animal_name, owner_first_name, owner_last_name, reservation_type_name, start_date, end_date, check_in_date, check_out_date, cancelled_date, raw_data, room_assignment, services";
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

  // Fetch weight/breed for all departing dogs
  const animalIds = boardingDogs.map(r => String(r.animal_gingr_id || r.raw_data?.animal?.id || "").trim()).filter(Boolean);
  let weightMap: Record<string, number | null> = {};
  let breedMap: Record<string, string> = {};
  if (animalIds.length > 0) {
    const { data: animals } = await supabase
      .from("gingr_animals")
      .select("gingr_id, weight, breed")
      .in("gingr_id", animalIds);
    for (const a of (animals || [])) {
      const w = a.weight ? parseFloat(a.weight) : null;
      weightMap[a.gingr_id] = (w && !isNaN(w)) ? w : null;
      breedMap[a.gingr_id] = a.breed || "";
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

  // Build report
  const dogs = boardingDogs.map(r => {
    const rd = r.raw_data || {};
    const animalGingrId = String(r.animal_gingr_id || rd.animal?.id || "").trim();
    const reservationGingrId = String(r.gingr_id || "");
    const roomLabel = r.room_assignment || rd.run?.name || "";
    const weight = weightMap[animalGingrId] ?? null;
    const sizeCategory = getSizeCategory(animalGingrId, weight);
    const breed = breedMap[animalGingrId] || rd.animal?.breed || "";

    const belongingsData = belongingsMap[reservationGingrId] || { belongings: "", healthNotes: "", checkedInBy: "" };

    return {
      animalName: r.animal_name || rd.animal?.name || "Unknown",
      animalGingrId,
      ownerName: [r.owner_first_name || rd.owner?.first_name || "", r.owner_last_name || rd.owner?.last_name || ""].filter(Boolean).join(" "),
      breed,
      roomLabel,
      weight,
      sizeCategory,
      checkInDate: ((r.raw_data?.check_in_date || r.check_in_date || r.raw_data?.start_date || r.start_date || "").split("T")[0]) || "",
      checkInTime: formatTimeHuman(r.raw_data?.check_in_date || r.check_in_date || r.raw_data?.start_date || r.start_date || ""),
      checkOutDate: ((r.raw_data?.end_date || r.end_date || "").split("T")[0]) || "",
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
    return { dogs: [], summary: { total: 0, pink: 0, red: 0, green: 0, blue: 0, yellow: 0, halfAndHalf: 0 }, completions: {}, totalCount: 0, completedCount: 0 };
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
    return { dogs: [], summary: { total: 0, pink: 0, red: 0, green: 0, blue: 0, yellow: 0, halfAndHalf: 0 }, completions: {}, totalCount: 0, completedCount: 0 };
  }

  // Gather all animal IDs for icon + weight/breed lookup
  const animalIds = categorized.map(c => String(c.res.animal_gingr_id || c.res.raw_data?.animal?.id || "").trim()).filter(Boolean);
  const uniqueAnimalIds = [...new Set(animalIds)];

  // Fetch icons + weights/breeds in parallel
  const [iconsResult, animalsResult] = await Promise.all([
    uniqueAnimalIds.length > 0
      ? supabase.from("gingr_animal_icons_live")
          .select("animal_gingr_id, icon_title, icon_group, icon_comment")
          .eq("location_id", locationId)
          .eq("icon_group", "Play")
          .in("animal_gingr_id", uniqueAnimalIds)
      : { data: [] },
    uniqueAnimalIds.length > 0
      ? supabase.from("gingr_animals")
          .select("gingr_id, weight, breed")
          .in("gingr_id", uniqueAnimalIds)
      : { data: [] },
  ]);

  // Build icon maps per animal
  const playIconMap: Record<string, { hasSmall: boolean; hasLarge: boolean; hasPrivatePlay: boolean; playGroupTitle: string; playGroupComment: string; privatePlayTitle: string; privatePlayComment: string; iconDetails: Array<{ title: string; group: string; comment: string }> }> = {};
  for (const icon of (iconsResult.data || [])) {
    const aid = String(icon.animal_gingr_id);
    if (!playIconMap[aid]) playIconMap[aid] = { hasSmall: false, hasLarge: false, hasPrivatePlay: false, playGroupTitle: "", playGroupComment: "", privatePlayTitle: "", privatePlayComment: "", iconDetails: [] };
    const title = (icon.icon_title || "").toLowerCase();
    const rawTitle = icon.icon_title || "";
    const comment = icon.icon_comment || "";
    const group = icon.icon_group || "";
    playIconMap[aid].iconDetails.push({ title: rawTitle, group, comment });
    if (title.includes("private") && title.includes("play")) {
      playIconMap[aid].hasPrivatePlay = true;
      playIconMap[aid].privatePlayTitle = rawTitle;
      playIconMap[aid].privatePlayComment = comment;
    } else if (title.includes("small")) {
      playIconMap[aid].hasSmall = true;
      playIconMap[aid].playGroupTitle = rawTitle;
      playIconMap[aid].playGroupComment = comment;
    } else if (title.includes("large")) {
      playIconMap[aid].hasLarge = true;
      playIconMap[aid].playGroupTitle = rawTitle;
      playIconMap[aid].playGroupComment = comment;
    }
  }

  // Build weight/breed maps
  const weightMap: Record<string, number | null> = {};
  const breedMap: Record<string, string> = {};
  for (const a of (animalsResult.data || [])) {
    const w = a.weight ? parseFloat(a.weight) : null;
    weightMap[a.gingr_id] = (w && !isNaN(w)) ? w : null;
    breedMap[a.gingr_id] = a.breed || "";
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

    const icons = playIconMap[animalGingrId] || { hasSmall: false, hasLarge: false, hasPrivatePlay: false, playGroupTitle: "", playGroupComment: "", privatePlayTitle: "", privatePlayComment: "", iconDetails: [] };
    const weight = weightMap[animalGingrId] ?? null;
    const sizeCategory = getSizeCategory(animalGingrId, weight);
    const breed = breedMap[animalGingrId] || rd.animal?.breed || "";
    const roomLabel = r.room_assignment || rd.run?.name || "";

    // Also check room assignment for Private Play
    const roomLower = (roomLabel || "").toLowerCase();
    const roomHasPP = roomLower.includes("private play") || roomLower.includes(" pp");

    const hasPrivatePlay = icons.hasPrivatePlay || roomHasPP;
    const hasSizeIcon = icons.hasSmall || icons.hasLarge;

    let collarColor = "";
    let isHalfAndHalf = false;

    if (category === "daycare") {
      collarColor = "pink";
    } else if (category === "dayboarding") {
      collarColor = "red";
    } else if (category === "evaluation") {
      collarColor = "yellow";
    } else if (category === "boarding") {
      if (hasPrivatePlay) {
        collarColor = "red";
        if (hasSizeIcon) {
          isHalfAndHalf = true;
        }
      } else if (icons.hasLarge || sizeCategory === "LG") {
        collarColor = "green";
      } else if (icons.hasSmall || sizeCategory === "SM") {
        collarColor = "blue";
      } else {
        // No icon or size info — default to green (large) as safer assumption
        collarColor = "green";
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
      playGroupTitle: icons.playGroupTitle,
      playGroupComment: icons.playGroupComment,
      privatePlayTitle: icons.hasPrivatePlay ? icons.privatePlayTitle : "",
      privatePlayComment: icons.hasPrivatePlay ? icons.privatePlayComment : "",
      iconDetails: icons.iconDetails,
    });
  }

  // Sort by collar color group, then by animal name
  const colorOrder: Record<string, number> = { pink: 0, red: 1, green: 2, blue: 3, yellow: 4 };
  dogs.sort((a, b) => {
    const ca = colorOrder[a.collarColor] ?? 5;
    const cb = colorOrder[b.collarColor] ?? 5;
    if (ca !== cb) return ca - cb;
    return (a.animalName || "").localeCompare(b.animalName || "");
  });

  // Build summary counts
  const summary = { total: dogs.length, pink: 0, red: 0, green: 0, blue: 0, yellow: 0, halfAndHalf: 0 };
  for (const d of dogs) {
    if (d.collarColor === "pink") summary.pink++;
    else if (d.collarColor === "red") summary.red++;
    else if (d.collarColor === "green") summary.green++;
    else if (d.collarColor === "blue") summary.blue++;
    else if (d.collarColor === "yellow") summary.yellow++;
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
): Promise<any> {
  // 1. Get today's room occupancy (occupied rooms with animal names)
  const { data: occupancy } = await supabase
    .from("gingr_room_occupancy")
    .select("run_name, animal_names, gingr_run_id")
    .eq("location_id", locationId)
    .eq("occupancy_date", targetDate)
    .eq("occupied", true);

  if (!occupancy || occupancy.length === 0) {
    return { transfers: [], summary: { total: 0 }, completions: {}, totalCount: 0, completedCount: 0 };
  }

  // 2. Parse occupancy → animal name → current room
  const occupancyMap: Record<string, { runName: string; ownerName: string }> = {};
  for (const occ of occupancy) {
    if (!occ.animal_names || !occ.run_name) continue;
    const entries = (occ.animal_names as string).split("<br>").map((e: string) => e.trim()).filter(Boolean);
    for (const entry of entries) {
      const match = entry.match(/^(.+?)\s*\((.+?)\)/);
      const dogName = match ? match[1].trim() : entry.trim();
      const ownerName = match ? match[2].trim() : "";
      if (dogName) {
        occupancyMap[dogName.toLowerCase()] = { runName: occ.run_name, ownerName };
      }
    }
  }

  // 3. Get active reservations (checked in, not checked out, not cancelled)
  const { data: activeRes } = await supabase
    .from("gingr_reservations")
    .select("gingr_id, animal_gingr_id, animal_name, owner_first_name, owner_last_name, reservation_type_name, room_assignment, start_date, end_date, raw_data")
    .eq("location_id", locationId)
    .not("check_in_date", "is", null)
    .is("check_out_date", null)
    .is("cancelled_date", null);

  if (!activeRes || activeRes.length === 0) {
    return { transfers: [], summary: { total: 0 }, completions: {}, totalCount: 0, completedCount: 0 };
  }

  // 4. Gather animal IDs for weight/breed lookup
  const animalIds = activeRes.map((r: any) => String(r.animal_gingr_id || "")).filter(Boolean);
  const uniqueAnimalIds = [...new Set(animalIds)];

  let weightMap: Record<string, number | null> = {};
  let breedMap: Record<string, string> = {};
  if (uniqueAnimalIds.length > 0) {
    const { data: animals } = await supabase
      .from("gingr_animals")
      .select("gingr_id, weight, breed")
      .in("gingr_id", uniqueAnimalIds);
    for (const a of animals || []) {
      const w = a.weight ? parseFloat(a.weight) : null;
      weightMap[a.gingr_id] = (w && !isNaN(w)) ? w : null;
      breedMap[a.gingr_id] = a.breed || "";
    }
  }

  // 5. Compare: reservation room_assignment vs occupancy run_name
  const transfers: any[] = [];
  for (const res of activeRes) {
    const name = (res.animal_name || "").toLowerCase().trim();
    if (!name) continue;
    const occ = occupancyMap[name];
    if (!occ) continue;

    const previousRoom = res.room_assignment || "";
    const currentRoom = occ.runName;

    // Only flag if there's a mismatch AND the reservation had a previous room
    if (!previousRoom || previousRoom === currentRoom) continue;

    const prevType = classifyRoomType(previousRoom);
    const currType = classifyRoomType(currentRoom);
    const roomTypeChanged = prevType !== currType && prevType !== "" && currType !== "";

    const animalGingrId = String(res.animal_gingr_id || "");
    const weight = weightMap[animalGingrId] ?? null;
    const sizeCategory = getSizeCategory(animalGingrId, weight);
    const breed = breedMap[animalGingrId] || res.raw_data?.animal?.breed || "";
    const ownerName = [res.owner_first_name || "", res.owner_last_name || ""].filter(Boolean).join(" ") || occ.ownerName;

    // Build action items
    const actionItems: string[] = [
      `Move belongings from ${previousRoom} to ${currentRoom}`,
      `Clean/disinfect old room (${previousRoom})`,
      `Set up new room (${currentRoom})`,
    ];
    if (roomTypeChanged) {
      actionItems.splice(1, 0, `Update collar — was ${prevType}, now ${currType}`);
    }

    transfers.push({
      animalName: res.animal_name || "Unknown",
      animalGingrId,
      ownerName,
      breed,
      weight,
      sizeCategory,
      previousRoom,
      currentRoom,
      transferDate: targetDate,
      reservationType: res.reservation_type_name || "",
      reservationGingrId: String(res.gingr_id || ""),
      roomTypeChanged,
      previousRoomType: prevType,
      currentRoomType: currType,
      actionItems,
    });
  }

  // 6. Also check yesterday's occupancy vs today's to detect transfer timing
  const yesterday = addDays(targetDate, -1);
  const { data: yesterdayOcc } = await supabase
    .from("gingr_room_occupancy")
    .select("run_name, animal_names")
    .eq("location_id", locationId)
    .eq("occupancy_date", yesterday)
    .eq("occupied", true);

  if (yesterdayOcc && yesterdayOcc.length > 0) {
    const yesterdayMap: Record<string, string> = {};
    for (const occ of yesterdayOcc) {
      if (!occ.animal_names || !occ.run_name) continue;
      const entries = (occ.animal_names as string).split("<br>").map((e: string) => e.trim()).filter(Boolean);
      for (const entry of entries) {
        const match = entry.match(/^(.+?)\s*\(/);
        const dogName = match ? match[1].trim() : entry.trim();
        if (dogName) {
          yesterdayMap[dogName.toLowerCase()] = occ.run_name;
        }
      }
    }
    // Update transfer dates: if dog was already in new room yesterday, the transfer was earlier
    for (const t of transfers) {
      const yRoom = yesterdayMap[(t.animalName || "").toLowerCase()];
      if (yRoom === t.currentRoom) {
        // Dog was in the new room yesterday too — transfer happened before yesterday
        t.transferDate = yesterday;
      }
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
  services: string[];
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
      (s.name || s.service_name || "")
        .toLowerCase()
        .includes(filterKeyword.toLowerCase()),
    );

    if (matched.length === 0) continue;

    const animalId = String(res.animal?.id || "");
    if (!animalId || seen.has(animalId)) continue;
    seen.add(animalId);

    const ownerFirst = res.owner?.first_name || "";
    const ownerLast = res.owner?.last_name || "";

    dogs.push({
      animalId,
      animalName: res.animal?.name || "",
      ownerName: `${ownerFirst} ${ownerLast}`.trim(),
      services: matched.map(
        (s: any) => s.name || s.service_name || filterKeyword,
      ),
    });
  }

  dogs.sort((a, b) => a.animalName.localeCompare(b.animalName));

  return { dogs };
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

    // ─── Fetch playgroup icons from LIVE data (source of truth for size) ───
    const { data: liveIconRows } = await supabase
      .from('gingr_animal_icons_live')
      .select('animal_gingr_id, icon_title, icon_group')
      .eq('icon_group', 'Play');
    const globalPlaygroupMap: Record<string, string> = {};
    for (const icon of liveIconRows || []) {
      const title = (icon.icon_title || '').toLowerCase();
      if (title.includes('large')) globalPlaygroupMap[icon.animal_gingr_id] = 'large';
      else if (title.includes('small')) globalPlaygroupMap[icon.animal_gingr_id] = 'small';
      else if (title.includes('private')) globalPlaygroupMap[icon.animal_gingr_id] = 'private_play';
      else if (title.includes('evaluation')) globalPlaygroupMap[icon.animal_gingr_id] = 'evaluation';
    }

    // Helper: get size category from playgroup icons (source of truth), fallback to weight
    function getSizeCategory(animalGingrId: string, weight: number | null): string | null {
      const pg = globalPlaygroupMap[animalGingrId];
      if (pg === 'large') return 'LG';
      if (pg === 'small') return 'SM';
      if (pg === 'private_play') return 'PP';
      if (pg === 'evaluation') return 'EVAL';
      // Fallback to weight only if no playgroup icon
      if (weight != null) return weight < 30 ? 'SM' : 'LG';
      return null;
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
        .select("gingr_id, weight, breed")
        .in("gingr_id", ppAnimalIds);
      for (const a of ppAnimals || []) {
        const w = a.weight ? parseFloat(a.weight) : null;
        ppWeightMap[a.gingr_id] = (w && !isNaN(w)) ? w : null;
        ppBreedMap[a.gingr_id] = a.breed || "";
      }
    }
    const privatePlay = computePrivatePlay(reservations, ppWeightMap, ppBreedMap);

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
    const enrichmentReport = computeServiceReport(reservations, "enrichment");

    // 10. Belongings Report (departing dogs — fetch belongings from Gingr API)
    const belongingsReport = await computeBelongingsReport(supabase, locationId, today, gingrSubdomain, gingrApiKey);

    // 11. Collars Report (next-day collar preparation)
    const collarsReport = await computeCollarsReport(supabase, locationId, today);

    // 12. Lodging Transfers (room changes — day-of only, not in future loop)
    const lodgingTransfers = await computeLodgingTransfers(supabase, locationId, today);

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
          .select("gingr_id, weight, breed")
          .in("gingr_id", futureAnimalIds);
        for (const a of futureAnimals || []) {
          const w = a.weight ? parseFloat(a.weight) : null;
          futureWeightMap[a.gingr_id] = (w && !isNaN(w)) ? w : null;
          futureBreedMap[a.gingr_id] = a.breed || "";
        }
      }
      const privatePlayFuture = computePrivatePlay(reservationsFuture, futureWeightMap, futureBreedMap);
      const pamperFuture = computeServiceReport(reservationsFuture, "pamper");
      const enrichmentFuture = computeServiceReport(reservationsFuture, "enrichment");

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

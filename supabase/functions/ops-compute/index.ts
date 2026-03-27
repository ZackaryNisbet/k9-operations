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
      // First day — refresh
      cleaningType = "refresh";
      needsRefresh = true;
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
    else if (startDate === today) { cleaningType = "refresh"; needsRefresh = true; }
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
      mergedMap[r.room] = { ...r };
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
}

function computePrivatePlay(reservations: Record<string, any>): any {
  const dogs: PPDog[] = [];
  const seen = new Set<string>();

  for (const res of Object.values(reservations)) {
    const animalId = String(res.animal?.id || "");
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
      dogs.push({
        animalId,
        animalName,
        ownerName,
        reservationType: resType,
        requiredSessions: 3,
        source: isDayBoarding ? "day_boarding" : "private_play_service",
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

async function computeBathingReport(supabase: any, locationId: string, today: string): Promise<any> {
  // Fetch all reservations with bath services for today (active + checked out today)
  const resSelect = "gingr_id, animal_gingr_id, animal_name, owner_first_name, owner_last_name, reservation_type_name, start_date, end_date, check_out_date, raw_data, room_assignment, services";
  const [{ data: activeRes }, { data: coRes }] = await Promise.all([
    supabase.from("gingr_reservations").select(resSelect)
      .eq("location_id", locationId)
      .not("check_in_date", "is", null).is("check_out_date", null).is("cancelled_date", null)
      .lte("start_date", `${today}T23:59:59`).gte("end_date", `${today}T00:00:00`),
    supabase.from("gingr_reservations").select(resSelect)
      .eq("location_id", locationId)
      .not("check_out_date", "is", null).is("cancelled_date", null)
      .gte("check_out_date", today + "T00:00:00").lt("check_out_date", addDays(today, 1) + "T00:00:00"),
  ]);
  const allRes = [...(activeRes || []), ...(coRes || [])];

  // Filter to dogs with bath scheduled today
  const bathDogs: any[] = [];
  const animalIds: string[] = [];
  for (const r of allRes) {
    const rd = r.raw_data || {};
    const rawSvcs = rd.services || [];
    const bathSvc = rawSvcs.find((s: any) => typeof s === "object" && s?.name?.toLowerCase().includes("bath"));
    const topSvcs = Array.isArray(r.services) ? r.services : [];
    const hasBathTop = topSvcs.some((s: any) => { const n = typeof s === "string" ? s : s?.name || ""; return n.toLowerCase().includes("bath"); });
    if (!bathSvc && !hasBathTop) continue;

    const scheduledAt = bathSvc?.scheduled_at || "";
    const isScheduledToday = scheduledAt.includes(today);
    const endDate = r.end_date || "";
    const isDepartingToday = endDate.includes(today);
    if (!isScheduledToday && !isDepartingToday) continue;

    const animalGingrId = String(r.animal_gingr_id || rd.animal?.id || "").trim();
    if (animalGingrId) animalIds.push(animalGingrId);

    const { addonType, modifiers } = parseBathAddonsFromServices(rawSvcs);
    const resType = rd.reservation_type || {};
    const roomLabel = r.room_assignment || rd.run?.name || "";

    bathDogs.push({
      animalGingrId,
      gingrReservationId: String(r.gingr_id || ""),
      animalName: r.animal_name || rd.animal?.name || "Unknown",
      ownerName: [r.owner_first_name || rd.owner?.first_name || "", r.owner_last_name || rd.owner?.last_name || ""].filter(Boolean).join(" "),
      breed: rd.animal?.breed || "",
      roomLabel,
      suiteType: resType.type || r.reservation_type_name || "",
      addonType,
      bathServiceName: bathSvc?.name || "",
      bathModifiers: modifiers,
      scheduledAt,
      scheduledTime: formatTimeHuman(scheduledAt),
      departureTime: formatTimeHuman(endDate),
      departureTimeRaw: endDate,
      isCheckedOut: !!r.check_out_date,
      isDone: !!bathSvc?.completed_at,
    });
  }

  // Fetch bath icons for all dogs
  let iconMap: Record<string, { title: string; comment: string }> = {};
  if (animalIds.length > 0) {
    const { data: icons } = await supabase
      .from("gingr_animal_icons_live")
      .select("animal_gingr_id, icon_title, icon_comment")
      .eq("location_id", locationId)
      .eq("icon_group", "Bath")
      .in("animal_gingr_id", animalIds);
    (icons || []).forEach((r: any) => {
      iconMap[r.animal_gingr_id] = { title: r.icon_title || "", comment: r.icon_comment || "" };
    });
  }

  // Resolve bath type: icon → add-on → service name → Standard
  const dogs = bathDogs.map(d => {
    const icon = iconMap[d.animalGingrId];
    const bathType = icon?.title
      || d.addonType
      || extractBathTypeFromName(d.bathServiceName)
      || "Standard";
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
      scheduledAt: d.scheduledAt,
      scheduledTime: d.scheduledTime,
      departureTime: d.departureTime,
      departureTimeRaw: d.departureTimeRaw,
      isCheckedOut: d.isCheckedOut,
      isDone: d.isDone,
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

    // 2. Private Play
    const privatePlay = computePrivatePlay(reservations);

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
    const bathingReport = await computeBathingReport(supabase, locationId, today);

    // 9. Service Reports
    const pamperReport = computeServiceReport(reservations, "pamper");
    const enrichmentReport = computeServiceReport(reservations, "enrichment");

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
        },
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

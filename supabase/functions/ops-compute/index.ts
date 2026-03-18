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

const GINGR_SUBDOMAIN = "your-gingr-subdomain";
const GINGR_API_KEY = "a0fec5e66b3c3be8b6085b2708b3806e";
const DEFAULT_LOCATION_ID = "11111111-1111-1111-1111-111111111111";

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
  endpoint: string,
  method: "GET" | "POST" = "GET",
  body?: Record<string, string>,
): Promise<any> {
  const baseUrl = `https://${GINGR_SUBDOMAIN}.gingrapp.com/api/v1/${endpoint}`;

  let resp: Response;
  if (method === "POST") {
    const params = new URLSearchParams();
    params.append("key", GINGR_API_KEY);
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
    // Build URL properly — endpoint may already contain query params
    const sep = baseUrl.includes("?") ? "&" : "?";
    const params = new URLSearchParams({ key: GINGR_API_KEY });
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

function todayStr(): string {
  const d = new Date();
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
}

function suggestBowlSize(weight: number | null): string {
  if (weight == null || weight <= 0) return "Unknown — verify";
  if (weight < 20) return "Small";
  if (weight <= 50) return "Medium";
  return "Large";
}

async function computeRoomCleaning(supabase: any, bohData: any, today: string): Promise<any> {
  const checkingOut = bohData?.data?.checking_out || [];
  const rooms: RoomEntry[] = [];

  for (const dog of checkingOut) {
    const runName = dog.run_name || "";
    const typeName = dog.type || "";
    const areaName = dog.area_name || "";
    const startDate = (dog.start_date || "").split(" ")[0];
    const endDate = (dog.end_date || "").split(" ")[0];

    // Skip daycare dogs (no room)
    if (typeName.toLowerCase().startsWith("daycare")) continue;

    const isDayBoarding = typeName.toLowerCase().startsWith("day boarding");
    const roomType = parseRoomType(typeName);

    // Determine cleaning type
    let cleaningType = "refresh";
    let needsDisinfect = false;
    let needsRefresh = false;

    if (isDayBoarding) {
      cleaningType = "disinfect";
      needsDisinfect = true;
    } else if (endDate === today) {
      // Last day — full disinfect
      cleaningType = "disinfect";
      needsDisinfect = true;
    } else if (startDate === today) {
      // First day — just refresh
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
    const dayNumber = Math.max(
      1,
      Math.round((todayD.getTime() - startD.getTime()) / 86400000) + 1,
    );
    const totalNights = Math.max(
      1,
      Math.round((endD.getTime() - startD.getTime()) / 86400000),
    );

    rooms.push({
      room: runName || `${roomType} (unassigned)`,
      roomType,
      areaName,
      dogName: dog.a_first || "",
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
    });
  }

  // ─── Setup detection ─────────────────────────────────────────────────
  // Query today's reservations from Supabase for evaluation, dayboarding, and first-time daycare
  const { data: todayReservations } = await supabase
    .from("gingr_reservations")
    .select("gingr_id, animal_gingr_id, animal_name, owner_last_name, reservation_type_name, start_date, raw_data")
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
        .ilike("reservation_type_name", "%daycare%")
        .lt("start_date", today)
        .is("cancelled_date", null);
      if (count === 0) {
        reason = "First Daycare";
      }
    }

    if (reason) {
      // Try to find room assignment from raw_data (run_name from BOH)
      const runName = res.raw_data?.run_name || null;
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

  // Match setup dogs to rooms (by room name from BOH data)
  // Build a map of room name → room entry index for quick lookup
  const roomIndexMap = new Map<string, number>();
  rooms.forEach((r, i) => roomIndexMap.set(r.room, i));

  // Also try matching by dog name in existing rooms
  const dogNameRoomMap = new Map<string, number>();
  rooms.forEach((r, i) => {
    if (r.dogName) dogNameRoomMap.set(r.dogName.toLowerCase(), i);
  });

  const unmatchedSetups: typeof setupDogs = [];
  for (const sd of setupDogs) {
    const weight = weightMap[sd.animalGingrId] ?? null;
    const bowlSize = suggestBowlSize(weight);

    // Try to match to an existing room entry
    let matched = false;
    // 1. Match by dog name
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

  // Add unmatched setup dogs as new room entries (e.g. first-time daycare dogs without a room)
  for (const sd of unmatchedSetups) {
    const weight = weightMap[sd.animalGingrId] ?? null;
    rooms.push({
      room: sd.room || "Unassigned",
      roomType: "",
      areaName: "",
      dogName: sd.dogName,
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
    });
  }

  // Sort by area, then room name
  rooms.sort((a, b) => {
    if (a.areaName !== b.areaName) return a.areaName.localeCompare(b.areaName);
    return a.room.localeCompare(b.room);
  });

  const totalRefresh = rooms.filter((r) => r.cleaningType === "refresh").length;
  const totalDisinfect = rooms.filter(
    (r) => r.cleaningType === "disinfect",
  ).length;
  const totalSetups = rooms.filter((r) => r.needsSetup).length;

  return {
    rooms,
    summary: {
      totalOccupied: rooms.length,
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

interface BathDog {
  animalId: string;
  animalName: string;
  ownerName: string;
  bathType: string;
  services: string[];
}

function computeBathingReport(reservations: Record<string, any>): any {
  const dogs: BathDog[] = [];
  const seen = new Set<string>();

  for (const res of Object.values(reservations)) {
    const services = res.services || [];
    const bathServices = services.filter((s: any) =>
      (s.name || s.service_name || "").toLowerCase().includes("bath"),
    );

    if (bathServices.length === 0) continue;

    const animalId = String(res.animal?.id || "");
    if (!animalId || seen.has(animalId)) continue;
    seen.add(animalId);

    const ownerFirst = res.owner?.first_name || "";
    const ownerLast = res.owner?.last_name || "";
    const serviceNames = bathServices.map(
      (s: any) => s.name || s.service_name || "Bath",
    );

    dogs.push({
      animalId,
      animalName: res.animal?.name || "",
      ownerName: `${ownerFirst} ${ownerLast}`.trim(),
      bathType: serviceNames[0],
      services: serviceNames,
    });
  }

  dogs.sort((a, b) => a.animalName.localeCompare(b.animalName));

  return { dogs };
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
    let locationId = DEFAULT_LOCATION_ID;
    let dateOverride: string | null = null;

    // Parse body if present
    try {
      const body = await req.json();
      if (body.location_id) locationId = body.location_id;
      if (body.date) dateOverride = body.date;
    } catch {
      // No body or invalid JSON — use defaults
    }

    const today = dateOverride || todayStr();
    const startTime = Date.now();

    // Initialize Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ─── Fetch Gingr data in parallel ──────────────────────────────────
    const [bohResult, resResult] = await Promise.all([
      gingrFetch(
        `back_of_house?location_id=1&full_day=true&include_daycare=true`,
        "GET",
      ),
      gingrFetch("reservations", "POST", { checked_in: "true" }),
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
    const roomCleaning = await computeRoomCleaning(supabase, bohResult, today);

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

    // 8. Bathing Report
    const bathingReport = computeBathingReport(reservations);

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

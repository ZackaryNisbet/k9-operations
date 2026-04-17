// ============================================================================
// Ops Compute On-Demand — K9 Operations Lite
// Lightweight edge function that computes room cleaning, bathing, pamper,
// enrichment, private play, and lodging transfers for a specific date
// on-demand. No template checklists, no Gingr web auth. Caches results in
// lite_daily_ops.
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
} from "../_shared/gingr-icon-mappings.ts";
import {
  getRollCallWorkflowTitle,
  loadRollCallSessionRow,
  normalizeRollCallSession,
} from "../_shared/roll-call-logic.ts";
import { fetchPlaygroupAssignments } from "../_shared/playgroup-assignments.ts";
import {
  buildRoomOccupancyComputedItems,
  buildRoomOccupancyLookup,
  fetchRoomOccupancySnapshotForDate,
  ROOM_OCCUPANCY_LODGING_CATEGORIES,
  resolveRoomOccupancyLookupEntry,
  type RoomOccupancyLookup,
} from "../_shared/room-occupancy.ts";
import { buildRoomCleaningPayload } from "../_shared/room-cleaning.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function resolveCanonicalRoomEntry(
  roomLookup: RoomOccupancyLookup | null | undefined,
  input: {
    reservationId?: string | null;
    animalId?: string | null;
    animalName?: string | null;
    ownerFirstName?: string | null;
    ownerLastName?: string | null;
    ownerName?: string | null;
  },
) {
  if (!roomLookup) return null;
  return resolveRoomOccupancyLookupEntry(roomLookup, input);
}

function resolveCanonicalRoomLabel(
  roomLookup: RoomOccupancyLookup | null | undefined,
  input: Parameters<typeof resolveCanonicalRoomEntry>[1],
  fallbackLabel?: string | null,
): string {
  const entry = resolveCanonicalRoomEntry(roomLookup, input);
  return entry?.room_label || String(fallbackLabel || "").trim();
}

function normalizeTransferText(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase();
}

function buildTransferOccupancyKey(input: {
  animalId?: string | null;
  animalName?: string | null;
  ownerName?: string | null;
  ownerFirstName?: string | null;
  ownerLastName?: string | null;
}): string {
  const animalId = String(input.animalId || "").trim();
  if (animalId) return `animal:${animalId}`;
  const animalName = normalizeTransferText(input.animalName);
  const ownerName = normalizeTransferText(
    input.ownerName ||
      [input.ownerFirstName || "", input.ownerLastName || ""].filter(Boolean).join(" "),
  );
  if (!animalName) return "";
  return `name:${animalName}::${ownerName}`;
}

function buildTransferAssignmentMap(snapshot: any): Record<string, any> {
  const result: Record<string, any> = {};
  for (const assignment of snapshot?.assignments || []) {
    if (!assignment?.room_label) continue;
    const key = buildTransferOccupancyKey({
      animalId: assignment.animal_id,
      animalName: assignment.animal_name,
      ownerName: assignment.owner_name,
    });
    if (!key) continue;
    result[key] = assignment;
  }
  return result;
}

// ─── Date helpers ──────────────────────────────────────────────────────────

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatTimeHuman(isoStr: string): string {
  if (!isoStr) return "—";
  try {
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

// ─── Bath type resolution helpers ──────────────────────────────────────────

const BATH_TYPE_ADDONS = new Set([
  "Premium", "Medicated", "Whitening", "Shampoo From Home",
  "Hypoallergenic - NO SPRAY", "Hypoallergenic - WITH SPRAY",
]);

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
      for (const t of BATH_TYPE_ADDONS) { if (n.toLowerCase() === t.toLowerCase()) { if (!addonType) addonType = t; break; } }
      for (const m of BATH_MODIFIER_ADDONS) { if (n.toLowerCase() === m.toLowerCase()) { modifiers.push(m); break; } }
    }
  }
  return { addonType, modifiers };
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
  }
}

// ─── Fetch reservations for a target date ─────────────────────────────────

async function fetchReservationsForDate(
  supabase: any,
  locationId: string,
  targetDate: string,
  roomLookup?: RoomOccupancyLookup | null,
): Promise<Record<string, any>> {
  const nextDay = addDays(targetDate, 1);
  const resSelect = "gingr_id, animal_gingr_id, animal_name, owner_first_name, owner_last_name, reservation_type_name, start_date, end_date, check_in_date, check_out_date, cancelled_date, raw_data, services, room_assignment";

  const [{ data: activeRes }, { data: pendingRes }, { data: completedRes }] = await Promise.all([
    supabase.from("gingr_reservations").select(resSelect)
      .eq("location_id", locationId)
      .not("check_in_date", "is", null).is("check_out_date", null).is("cancelled_date", null)
      .lte("start_date", `${targetDate}T23:59:59`).gte("end_date", `${targetDate}T00:00:00`),
    supabase.from("gingr_reservations").select(resSelect)
      .eq("location_id", locationId)
      .is("check_in_date", null).is("check_out_date", null).is("cancelled_date", null)
      .gte("start_date", `${targetDate}T00:00:00`).lt("start_date", nextDay + "T00:00:00"),
    // Completed reservations (checked in AND checked out) that started on target date
    supabase.from("gingr_reservations").select(resSelect)
      .eq("location_id", locationId)
      .not("check_in_date", "is", null).not("check_out_date", "is", null).is("cancelled_date", null)
      .gte("start_date", `${targetDate}T00:00:00`).lte("start_date", `${targetDate}T23:59:59`),
  ]);

  const seen = new Set<string>();
  const result: Record<string, any> = {};
  for (const r of [...(activeRes || []), ...(pendingRes || []), ...(completedRes || [])]) {
    const id = String(r.gingr_id);
    if (seen.has(id)) continue;
    seen.add(id);
    const rd = r.raw_data || {};
    const animalId = String(r.animal_gingr_id || rd.animal?.id || "");
    const animalName = r.animal_name || rd.animal?.name || "";
    const ownerFirstName = r.owner_first_name || rd.owner?.first_name || "";
    const ownerLastName = r.owner_last_name || rd.owner?.last_name || "";
    result[id] = {
      gingrReservationId: id,
      animal: {
        id: animalId,
        name: animalName,
      },
      owner: {
        first_name: ownerFirstName,
        last_name: ownerLastName,
      },
      reservation_type: rd.reservation_type || { type: r.reservation_type_name || "" },
      services: Array.isArray(r.services) ? r.services : (rd.services || []),
      roomLabel: resolveCanonicalRoomLabel(
        roomLookup,
        {
          reservationId: id,
          animalId,
          animalName,
          ownerFirstName,
          ownerLastName,
        },
        r.room_assignment || rd.run?.name || rd.room?.name || "",
      ),
      animalGingrId: animalId,
      startDate: r.start_date || "",
      checkInDate: r.check_in_date || null,
    };
  }
  return result;
}

async function computeRoomCleaning(
  supabase: any,
  locationId: string,
  targetDate: string,
): Promise<any> {
  const previousDate = new Date(`${targetDate}T12:00:00`);
  previousDate.setDate(previousDate.getDate() - 1);
  const nextDate = new Date(`${targetDate}T12:00:00`);
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
        .in("occupancy_date", [previousDateKey, targetDate, nextDateKey]),
      supabase
        .from("gingr_reservations")
        .select(
          "gingr_id, animal_gingr_id, animal_name, owner_first_name, owner_last_name, reservation_type_name, start_date, end_date, check_in_date, check_out_date, cancelled_date, raw_data, room_assignment",
        )
        .eq("location_id", locationId)
        .is("cancelled_date", null)
        .lte("start_date", `${targetDate}T23:59:59`)
        .gte("end_date", `${targetDate}T00:00:00`),
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

  const allAnimalIds = [
    ...new Set(
      (reservationRows || [])
        .map((row: any) => String(row.animal_gingr_id || ""))
        .filter(Boolean),
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
    date: targetDate,
    runs,
    occupancyRows: roomOccupancy || [],
    bohDogs: [],
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

// ─── Reservation type classification ─────────────────────────────────────

function classifyReservationCategory(typeName: string): string {
  if (!typeName) return "other";
  const t = typeName.toLowerCase();
  if (t.includes("evaluation") || t.includes("eval") || t.includes("first stay")) return "evaluation";
  if (t.includes("day boarding") || t === "day boarding") return "day_boarding";
  if (t.includes("daycare") || t.includes("day care")) return "daycare";
  if (t.includes("boarding")) return "boarding";
  return "other";
}

// ─── Average checkout time helpers ───────────────────────────────────────

async function fetchAvgCheckoutFromSupabase(
  locationId: string,
  animalId: string,
  animalName: string,
  reservationType: string,
  supabase: any,
): Promise<{ avgCheckoutTime: string | null; sampleCount: number; checkoutHistory: any[] }> {
  try {
    const { data: reservations, error } = await supabase
      .from("gingr_reservations")
      .select("check_out_date, reservation_type_name")
      .eq("location_id", locationId)
      .eq("animal_gingr_id", animalId)
      .not("check_out_date", "is", null)
      .is("cancelled_date", null)
      .order("check_out_date", { ascending: false })
      .limit(50);
    if (error) {
      console.error(`Checkout history query failed for animal ${animalId}:`, error.message);
      return { avgCheckoutTime: null, sampleCount: 0, checkoutHistory: [] };
    }
    if (!Array.isArray(reservations) || reservations.length === 0) {
      return { avgCheckoutTime: null, sampleCount: 0, checkoutHistory: [] };
    }

    const targetCategory = reservationType ? classifyReservationCategory(reservationType) : "other";
    const filteredReservations = reservations.filter((row: any) => {
      const rowType = row?.reservation_type_name || "";
      if (!reservationType) return true;
      if (rowType === reservationType) return true;
      return targetCategory !== "other" && classifyReservationCategory(rowType) === targetCategory;
    });
    const sourceReservations = filteredReservations.length > 0 ? filteredReservations : reservations;

    const allCheckoutTimes: number[] = []; // minutes since midnight
    const checkoutHistory: any[] = [];

    for (const row of sourceReservations) {
      const coStamp = row?.check_out_date;
      if (!coStamp) continue;

      const resType = row?.reservation_type_name || "";

      let coDate: Date;
      const stampNum = typeof coStamp === "number" ? coStamp : Number(coStamp);
      if (!isNaN(stampNum) && stampNum > 1000000000 && stampNum < 10000000000) {
        // Unix timestamp in seconds
        coDate = new Date(stampNum * 1000);
      } else if (!isNaN(stampNum) && stampNum > 10000000000) {
        // Unix timestamp in milliseconds
        coDate = new Date(stampNum);
      } else {
        coDate = new Date(coStamp);
      }
      if (isNaN(coDate.getTime())) continue;

      // Use Eastern time
      const eastern = new Date(coDate.toLocaleString("en-US", { timeZone: "America/New_York" }));
      const minutesSinceMidnight = eastern.getHours() * 60 + eastern.getMinutes();
      // Filter out unreasonable times (before 6am or after 10pm)
      if (minutesSinceMidnight >= 360 && minutesSinceMidnight <= 1320) {
        allCheckoutTimes.push(minutesSinceMidnight);
        const h = eastern.getHours();
        const m = eastern.getMinutes();
        const ampm = h >= 12 ? "PM" : "AM";
        const h12 = h % 12 || 12;
        const timeStr = `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
        const dateStr = `${eastern.getFullYear()}-${String(eastern.getMonth() + 1).padStart(2, "0")}-${String(eastern.getDate()).padStart(2, "0")}`;
        checkoutHistory.push({
          date: dateStr,
          time: timeStr,
          reservationType: resType,
        });
      }
    }

    if (allCheckoutTimes.length === 0) return { avgCheckoutTime: null, sampleCount: 0, checkoutHistory: [] };

    const avgMinutes = Math.round(allCheckoutTimes.reduce((a, b) => a + b, 0) / allCheckoutTimes.length);
    const avgHours = Math.floor(avgMinutes / 60);
    const avgMins = avgMinutes % 60;
    const avgTimeStr = `${String(avgHours).padStart(2, "0")}:${String(avgMins).padStart(2, "0")}`;

    // Sort history newest first
    checkoutHistory.sort((a, b) => b.date.localeCompare(a.date));

    // Cache the result with checkout history
    await supabase.from("animal_checkout_averages").upsert({
      animal_id: animalId,
      animal_name: animalName,
      avg_checkout_time: avgTimeStr,
      sample_count: allCheckoutTimes.length,
      reservation_type: reservationType,
      checkout_history: checkoutHistory,
      computed_at: new Date().toISOString(),
    }, { onConflict: "animal_id" });

    return { avgCheckoutTime: avgTimeStr, sampleCount: allCheckoutTimes.length, checkoutHistory };
  } catch (err) {
    console.error(`Error fetching checkout avg for animal ${animalId}:`, err);
    return { avgCheckoutTime: null, sampleCount: 0, checkoutHistory: [] };
  }
}

async function getAvgCheckoutTimes(
  locationId: string,
  animalIds: string[],
  animalNames: Record<string, string>,
  resTypes: Record<string, string>,
  supabase: any,
): Promise<Record<string, { avgCheckoutTime: string | null; sampleCount: number; checkoutHistory: any[] }>> {
  if (animalIds.length === 0) return {};

  const result: Record<string, { avgCheckoutTime: string | null; sampleCount: number; checkoutHistory: any[] }> = {};

  // Check cache first
  const { data: cached } = await supabase
    .from("animal_checkout_averages")
    .select("animal_id, avg_checkout_time, sample_count, checkout_history, computed_at")
    .in("animal_id", animalIds);

  const now = new Date();
  const freshCache: Record<string, any> = {};

  for (const row of (cached || [])) {
    // Check if cache is still fresh (24h TTL)
    const computedAt = row.computed_at ? new Date(row.computed_at) : new Date(0);
    const ageMs = now.getTime() - computedAt.getTime();
    if (ageMs < 24 * 60 * 60 * 1000 && row.avg_checkout_time) {
      freshCache[row.animal_id] = row;
    }
  }

  // Use cached values
  for (const id of animalIds) {
    if (freshCache[id]) {
      result[id] = {
        avgCheckoutTime: freshCache[id].avg_checkout_time,
        sampleCount: freshCache[id].sample_count || 0,
        checkoutHistory: freshCache[id].checkout_history || [],
      };
    }
  }

  // Fetch fresh data for animals not in cache or stale
  const toFetch = animalIds.filter(id => !freshCache[id]);

  // Limit concurrent Gingr API calls to 5 at a time
  const queue = [...toFetch];
  async function worker() {
    while (queue.length > 0) {
      const id = queue.shift();
      if (!id) break;
      const data = await fetchAvgCheckoutFromSupabase(locationId, id, animalNames[id] || "", resTypes[id] || "", supabase);
      result[id] = data;
    }
  }
  const workers = Array.from({ length: Math.min(5, queue.length) }, () => worker());
  await Promise.all(workers);

  return result;
}

// ─── Compute bathing report (no Gingr web auth) ──────────────────────────

async function computeBathingReport(
  supabase: any,
  locationId: string,
  targetDate: string,
  roomLookup?: RoomOccupancyLookup | null,
): Promise<any> {
  const nextDay = addDays(targetDate, 1);
  const resSelect = "gingr_id, animal_gingr_id, animal_name, owner_first_name, owner_last_name, reservation_type_name, start_date, end_date, check_in_date, check_out_date, cancelled_date, raw_data, room_assignment, services, notes_reservation, notes_animal, notes_owner";

  const [{ data: activeRes }, { data: coRes }, { data: pendingRes }] = await Promise.all([
    supabase.from("gingr_reservations").select(resSelect)
      .eq("location_id", locationId)
      .not("check_in_date", "is", null).is("check_out_date", null).is("cancelled_date", null)
      .lte("start_date", `${targetDate}T23:59:59`).gte("end_date", `${targetDate}T00:00:00`),
    supabase.from("gingr_reservations").select(resSelect)
      .eq("location_id", locationId)
      .not("check_out_date", "is", null).is("cancelled_date", null)
      .gte("check_out_date", targetDate + "T00:00:00").lt("check_out_date", nextDay + "T00:00:00"),
    supabase.from("gingr_reservations").select(resSelect)
      .eq("location_id", locationId)
      .is("check_in_date", null).is("check_out_date", null).is("cancelled_date", null)
      .gte("start_date", `${targetDate}T00:00:00`).lt("start_date", nextDay + "T00:00:00"),
  ]);

  const seen = new Set<string>();
  const allRes: any[] = [];
  for (const r of [...(activeRes || []), ...(coRes || []), ...(pendingRes || [])]) {
    const id = String(r.gingr_id);
    if (!seen.has(id)) { seen.add(id); allRes.push(r); }
  }

  const bathDogs: any[] = [];
  const manualDogs: any[] = [];
  const suggestedDogs: any[] = [];
  const animalIds: string[] = [];

  for (const r of allRes) {
    const rd = r.raw_data || {};
    const rawSvcs = rd.services || [];
    const topSvcs = Array.isArray(r.services) ? r.services : [];
    const bathServices = extractBathLikeServices(rawSvcs, topSvcs);
    const { scheduledToday, scheduledOtherDay, hasBathOrGroom } = getBathSchedulingForDate(bathServices, targetDate);
    if (!hasBathOrGroom) continue;

    const startDate = rd.start_date || r.start_date || "";
    const endDate = rd.end_date || r.end_date || "";
    const resType = rd.reservation_type || {};
    const resTypeName = resType.type || r.reservation_type_name || "";
    const isDepartingToday = endDate.includes(targetDate);
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
          roomLabel: resolveCanonicalRoomLabel(
            roomLookup,
            {
              reservationId: String(r.gingr_id || ""),
              animalId: animalGingrId,
              animalName: r.animal_name || rd.animal?.name || "",
              ownerFirstName: r.owner_first_name || rd.owner?.first_name || "",
              ownerLastName: r.owner_last_name || rd.owner?.last_name || "",
            },
            r.room_assignment || rd.run?.name || "",
          ),
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
          statusContext: buildSuggestedBathStatusContext(targetDate, scheduledOtherDay),
        });
      }
      continue;
    }

    const resId = String(r.gingr_id || "");
    const animalGingrId = String(r.animal_gingr_id || rd.animal?.id || "").trim();
    if (animalGingrId) animalIds.push(animalGingrId);

    const svcsForAddons = rawSvcs.length > 0 ? rawSvcs : topSvcs;
    const { addonType, modifiers } = parseBathAddonsFromServices(svcsForAddons);
    const roomLabel = resolveCanonicalRoomLabel(
      roomLookup,
      {
        reservationId: resId,
        animalId: animalGingrId,
        animalName: r.animal_name || rd.animal?.name || "",
        ownerFirstName: r.owner_first_name || rd.owner?.first_name || "",
        ownerLastName: r.owner_last_name || rd.owner?.last_name || "",
      },
      r.room_assignment || rd.run?.name || "",
    );

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

  // ─── Suggested baths: boarding dogs staying 2+ nights with no bath ─────
  const bathDogResIds = new Set([...bathDogs, ...suggestedDogs].map(d => d.gingrReservationId));

  for (const r of allRes) {
    const resId = String(r.gingr_id || "");
    if (bathDogResIds.has(resId)) continue; // already has a bath

    const resTypeName = (r.reservation_type_name || "").toLowerCase();
    if (!resTypeName.includes("boarding")) continue; // must be boarding
    if (resTypeName.includes("day boarding")) continue; // day boarding excluded

    // Must be checked in (not just pending)
    if (!r.check_in_date) continue;
    // NOTE: do NOT skip checked-out dogs — a dog that left without a bath is a missed bath

    // Must be 2+ nights
    const startDay = (r.start_date || "").split("T")[0];
    const endDay = (r.end_date || "").split("T")[0];
    if (!startDay || !endDay) continue;
    const startMs = new Date(startDay + "T12:00:00").getTime();
    const endMs = new Date(endDay + "T12:00:00").getTime();
    const nights = Math.round((endMs - startMs) / (24 * 60 * 60 * 1000));
    if (nights < 2) continue;

    // Must be departing on the target date (end_date equals target date)
    if (endDay !== targetDate) continue;

    // Confirm no bath/grooming service on this reservation for today or tomorrow
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
    const roomLabel = resolveCanonicalRoomLabel(
      roomLookup,
      {
        reservationId: resId,
        animalId: animalGingrId,
        animalName: r.animal_name || rd.animal?.name || "",
        ownerFirstName: r.owner_first_name || rd.owner?.first_name || "",
        ownerLastName: r.owner_last_name || rd.owner?.last_name || "",
      },
      r.room_assignment || rd.run?.name || "",
    );
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
      statusContext: buildSuggestedBathStatusContext(targetDate, null),
    });
  }

  const existingBathResIds = new Set([...bathDogs, ...suggestedDogs].map((d) => d.gingrReservationId));
  const reservationById = new Map(allRes.map((r) => [String(r.gingr_id || ""), r]));
  const { data: manualOverrideRows } = await supabase
    .from("ops_bathing_manual_overrides")
    .select("gingr_reservation_id, animal_gingr_id, bath_type, bath_modifiers, note, added_by_name")
    .eq("location_id", locationId)
    .eq("override_date", targetDate)
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
    const animalGingrId = String(override.animal_gingr_id || r.animal_gingr_id || rd.animal?.id || "").trim();
    const roomLabel = resolveCanonicalRoomLabel(
      roomLookup,
      {
        reservationId: String(r.gingr_id || ""),
        animalId: animalGingrId,
        animalName: r.animal_name || rd.animal?.name || "",
        ownerFirstName: r.owner_first_name || rd.owner?.first_name || "",
        ownerLastName: r.owner_last_name || rd.owner?.last_name || "",
      },
      r.room_assignment || rd.run?.name || "",
    );
    const notesParts = [r.notes_reservation, r.notes_animal, r.notes_owner]
      .filter(Boolean)
      .map((n: string) => n.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const reservationNotes = notesParts.join(" | ");
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

  // Fetch bath icons, play icons, and weights
  // iconMap stores ALL bath icons per dog (array) to support multiple bath types
  let iconMap: Record<string, GingrAnimalIconRow[]> = {};
  let playIconMap: Record<string, string> = {};
  let weightMap: Record<string, number | null> = {};
  const iconMappings = await fetchLocationIconMappings({ supabase, locationId });
  if (animalIds.length > 0) {
    const [{ data: icons }, playAssignments, { data: animals }] = await Promise.all([
      supabase.from("gingr_animal_icons_live").select("animal_gingr_id, icon_title, icon_comment, icon_template_id, icon_identity_key, icon_group, icon_color, icon_class")
        .eq("location_id", locationId).eq("icon_group", "Bath").in("animal_gingr_id", animalIds),
      fetchPlaygroupAssignments({
        supabase,
        locationId,
        animalIds,
        columns: "animal_gingr_id, has_private_play",
      }),
      supabase.from("gingr_animals").select("gingr_id, weight").in("gingr_id", animalIds),
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

  // ─── Avg checkout time from cache ──────────────────────────────────────
  const allDogEntries = [...bathDogs, ...manualDogs, ...suggestedDogs];
  const uniqueAnimalIds = [...new Set(allDogEntries.map(d => d.animalGingrId).filter(Boolean))];
  const animalNameMap: Record<string, string> = {};
  const animalResTypeMap: Record<string, string> = {};
  for (const d of allDogEntries) {
    if (d.animalGingrId) {
      animalNameMap[d.animalGingrId] = d.animalName;
      animalResTypeMap[d.animalGingrId] = d.reservationType;
    }
  }

  const checkoutAvgs = await getAvgCheckoutTimes(locationId, uniqueAnimalIds, animalNameMap, animalResTypeMap, supabase);

  // ─── Build final dog objects ───────────────────────────────────────────
  function buildDogOutput(d: any): any {
    const icons = iconMap[d.animalGingrId] || [];
    const iconComments = icons.map(i => i.icon_comment).filter(Boolean);
    const normalizedBath = resolveBathDisplayFromIconRows({
      iconRows: icons,
      mappings: iconMappings,
      addonType: d.addonType,
      serviceName: d.bathServiceName,
      rawModifiers: d.bathModifiers,
      defaultType: "Standard",
    });
    const weight = weightMap[d.animalGingrId] ?? null;
    const sizeCategory = weight != null ? (weight < 30 ? "small" : "large") : null;
    const hasPrivatePlay = !!playIconMap[d.animalGingrId];

    // Room/sibling/roommate grouping
    const roomEntry = resolveCanonicalRoomEntry(
      roomLookup,
      {
        reservationId: d.gingrReservationId,
        animalId: d.animalGingrId,
        animalName: d.animalName,
        ownerName: d.ownerName,
      },
    );
    const roomName = roomEntry?.room_label || d.roomLabel || "";
    let roommates: string[] = [];
    let siblingGroup = "";
    if (roomEntry && roomEntry.occupants_today.length > 1) {
      siblingGroup = (roomEntry.room_label || "")
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "");
      for (const occ of roomEntry.roommates) {
        const label = occ.is_sibling ? `${occ.animal_name} (sibling)` : `${occ.animal_name} (${occ.owner_name})`;
        roommates.push(label);
      }
    }

    // Avg checkout
    const checkoutData = checkoutAvgs[d.animalGingrId];
    const avgCheckoutTime = checkoutData?.avgCheckoutTime || null;
    const checkoutHistory = checkoutData?.checkoutHistory || [];

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
      serviceNotes: d.status === "manual" ? (d.manualNote || "") : "",
      weight,
      sizeCategory,
      hasPrivatePlay,
      scheduledAt: d.scheduledAt,
      scheduledTime: d.scheduledTime,
      departureTime: d.departureTime,
      departureTimeRaw: d.departureTimeRaw,
      isCheckedOut: d.isCheckedOut,
      isDone: d.isDone,
      status: d.status,
      statusContext: d.statusContext || null,
      reservationType: d.reservationType,
      reservationCategory: d.reservationCategory,
      roomName,
      roommates,
      siblingGroup,
      avgCheckoutTime,
      checkoutHistory,
      reservationDates: { start: (d.startDate || "").split("T")[0], end: (d.endDate || "").split("T")[0] },
    };
  }

  const scheduledDogs = bathDogs.map(buildDogOutput);
  const manualDogsOut = manualDogs.map(buildDogOutput);
  const suggestedDogsOut = suggestedDogs.map(buildDogOutput);
  const dogs = [...scheduledDogs, ...manualDogsOut, ...suggestedDogsOut];

  const statusOrder: Record<string, number> = { scheduled: 0, manual: 1, suggested: 2 };

  dogs.sort((a, b) => {
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

  // Fetch bath completions
  const completionKey = `ops_bathing_${targetDate}`;
  const { data: completionRows } = await supabase
    .from("lite_settings")
    .select("setting_value")
    .eq("location_id", locationId)
    .eq("setting_key", completionKey)
    .limit(1);
  const completions: Record<string, { by: string; at: string }> = (completionRows && completionRows.length > 0 && completionRows[0].setting_value) ? completionRows[0].setting_value : {};

  for (const dog of grouped) {
    const resId = `g${dog.gingrReservationId}`;
    const completedInfo = completions[resId] || null;
    if (completedInfo) {
      dog.isDone = true;
      dog.completedBy = completedInfo.by || "";
      dog.completedAt = completedInfo.at || "";
    }
  }

  // Build summary with category counts
  const scheduledCount = grouped.filter(d => d.status === "scheduled").length;
  const manualCount = grouped.filter(d => d.status === "manual").length;
  const suggestedCount = grouped.filter(d => d.status === "suggested").length;
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
  const completedCount = grouped.filter(d => d.isDone).length;

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

// ─── Compute service report (pamper only) ─────────────────────────────────

function computeServiceReport(
  reservations: Record<string, any>,
  filterKeyword: string,
  roomLookup?: RoomOccupancyLookup | null,
): any {
  const dogs: any[] = [];
  const seen = new Set<string>();

  const normalizeAddonStatus = (value: any) =>
    String(value || "").trim().toLowerCase().replace(/[_\s]+/g, "-");
  const isOperationalAddonStatus = (value: any) => {
    const normalized = normalizeAddonStatus(value);
    if (!normalized) return true;
    return ["scheduled", "confirmed", "checked-in", "completed"].includes(normalized);
  };

  for (const res of Object.values(reservations)) {
    const services = res.services || [];
    const matched = services.filter((s: any) =>
      isOperationalAddonStatus(
        s?.status || s?.service_status || s?.reservation_status || s?.booking_status,
      ) &&
      (s.name || s.service_name || "").toLowerCase().includes(filterKeyword.toLowerCase()),
    );
    const reservationType = res.reservation_type?.type || res.reservationType || "";
    const isLuxurySuite = filterKeyword.toLowerCase() === "pamper" &&
      reservationType.toLowerCase().includes("luxury suite");
    if (matched.length === 0 && !isLuxurySuite) continue;

    const animalId = String(res.animal?.id || "");
    if (!animalId || seen.has(animalId)) continue;
    seen.add(animalId);

    dogs.push({
      animalId,
      animalName: res.animal?.name || "",
      ownerName: `${res.owner?.first_name || ""} ${res.owner?.last_name || ""}`.trim(),
      roomLabel: resolveCanonicalRoomLabel(
        roomLookup,
        {
          reservationId: String(res.gingrReservationId || res.gingr_id || ""),
          animalId,
          animalName: res.animal?.name || "",
          ownerFirstName: res.owner?.first_name || "",
          ownerLastName: res.owner?.last_name || "",
        },
        res.roomLabel || res.room?.name || "",
      ),
      reservationType,
      services: matched.length > 0
        ? matched.map((s: any) => s.name || s.service_name || filterKeyword)
        : ["Luxury Suite"],
    });
  }

  dogs.sort((a, b) => a.animalName.localeCompare(b.animalName));
  return { dogs };
}

// ─── Compute enrichment report (queries Gingr + snapshots for past/future) ─

async function computeEnrichmentReport(
  supabase: any,
  locationId: string,
  targetDate: string,
  localReservations: Record<string, any>,
  roomLookup?: RoomOccupancyLookup | null,
): Promise<any> {
  const scheduled: any[] = [];
  const suggested: any[] = [];
  const seen = new Set<string>();
  const normalizeAddonStatus = (value: any) =>
    String(value || "").trim().toLowerCase().replace(/[_\s]+/g, "-");
  const isOperationalAddonStatus = (value: any) => {
    const normalized = normalizeAddonStatus(value);
    if (!normalized) return true;
    return ["scheduled", "confirmed", "checked-in", "completed"].includes(normalized);
  };

  // 1) First try local reservations (from Supabase — currently checked-in dogs)
  for (const res of Object.values(localReservations)) {
    const services = res.services || [];
    const animalId = String(res.animal?.id || "");
    if (!animalId || seen.has(animalId)) continue;

    const enrichmentServices = services.filter((s: any) =>
      isOperationalAddonStatus(
        s?.status || s?.service_status || s?.reservation_status || s?.booking_status,
      ) &&
      (s.name || s.service_name || "").toLowerCase().includes("enrichment"),
    );
    if (enrichmentServices.length === 0) continue;
    seen.add(animalId);

    const ownerFirst = res.owner?.first_name || "";
    const ownerLast = res.owner?.last_name || "";
    const resType = res.reservation_type?.type || "";

    const scheduledForToday = enrichmentServices.some((s: any) => {
      const schedAt = s.scheduled_at || s.scheduled_date || "";
      return schedAt.includes(targetDate);
    });

    const dog = {
      animalId,
      animalName: res.animal?.name || "",
      ownerName: `${ownerFirst} ${ownerLast}`.trim(),
      roomLabel: resolveCanonicalRoomLabel(
        roomLookup,
        {
          reservationId: String(res.gingrReservationId || res.gingr_id || ""),
          animalId,
          animalName: res.animal?.name || "",
          ownerFirstName: ownerFirst,
          ownerLastName: ownerLast,
        },
        res.roomLabel || res.room?.name || "",
      ),
      services: enrichmentServices.map((s: any) => s.name || s.service_name || "enrichment"),
      status: scheduledForToday ? "scheduled" : "suggested",
      reservationType: resType,
      summary: enrichmentServices.map((s: any) => s.name || "enrichment").join(", "),
    };

    if (scheduledForToday) {
      scheduled.push(dog);
    } else {
      suggested.push({ ...dog, isSuggested: true, reason: `Enrichment on reservation but not scheduled for ${targetDate}` });
    }
  }

  // 2) Check enrichment_snapshots for historical data (catches daycare dogs that already checked out)
  const { data: snapshots } = await supabase
    .from("enrichment_snapshots")
    .select("animal_id, animal_name, owner_name, services, reservation_type, status")
    .eq("location_id", locationId)
    .eq("report_date", targetDate);

  for (const snap of (snapshots || [])) {
    if (!snap.animal_id || seen.has(snap.animal_id)) continue;
    seen.add(snap.animal_id);
    scheduled.push({
      animalId: snap.animal_id,
      animalName: snap.animal_name || "",
      ownerName: snap.owner_name || "",
      services: Array.isArray(snap.services) ? snap.services : ["enrichment"],
      status: snap.status || "scheduled",
      reservationType: snap.reservation_type || "",
      summary: Array.isArray(snap.services) ? snap.services.join(", ") : "enrichment",
    });
  }

  // 3) If we still have very few results, fall back to the synced reservations table
  if (scheduled.length + suggested.length < 3) {
    try {
      const { data: reservations } = await supabase
        .from("gingr_reservations")
        .select("animal_gingr_id, animal_name, owner_first_name, owner_last_name, reservation_type_name, raw_data, services")
        .eq("location_id", locationId)
        .lte("start_date", `${targetDate}T23:59:59`)
        .gte("end_date", `${targetDate}T00:00:00`)
        .is("cancelled_date", null);

      for (const row of (reservations || [])) {
        const animalId = String(row?.animal_gingr_id || "");
        if (!animalId || seen.has(animalId)) continue;

        const rawServices = Array.isArray((row.raw_data as any)?.services) ? (row.raw_data as any).services : [];
        const topServices = Array.isArray(row.services) ? row.services : [];
        const services = [...rawServices, ...topServices];
        const enrichmentSvcs = services.filter((s: any) =>
          isOperationalAddonStatus(
            s?.status || s?.service_status || s?.reservation_status || s?.booking_status,
          ) &&
          (s?.name || s?.service_name || "").toLowerCase().includes("enrichment"),
        );
        if (enrichmentSvcs.length === 0) continue;
        seen.add(animalId);

        scheduled.push({
          animalId,
          animalName: row?.animal_name || "",
          ownerName: `${row?.owner_first_name || ""} ${row?.owner_last_name || ""}`.trim(),
          roomLabel: resolveCanonicalRoomLabel(
            roomLookup,
            {
              animalId,
              animalName: row?.animal_name || "",
              ownerFirstName: row?.owner_first_name || "",
              ownerLastName: row?.owner_last_name || "",
            },
            (row.raw_data as any)?.run?.name || "",
          ),
          services: enrichmentSvcs.map((s: any) => s.name || s.service_name || "enrichment"),
          status: "scheduled",
          reservationType: row?.reservation_type_name || "",
          summary: enrichmentSvcs.map((s: any) => s.name || s.service_name || "enrichment").join(", "),
        });
      }
    } catch (err) {
      console.error("Enrichment reservations-table fallback error:", err);
    }
  }

  const allDogs = [...scheduled, ...suggested];
  allDogs.sort((a, b) => a.animalName.localeCompare(b.animalName));

  return {
    dogs: allDogs,
    scheduled,
    suggested,
    scheduledCount: scheduled.length,
    suggestedCount: suggested.length,
  };
}

// ─── Compute private play ─────────────────────────────────────────────────

async function computePrivatePlay(
  supabase: any,
  locationId: string,
  targetDate: string,
  reservations: Record<string, any>,
  privatePlayAnimalIds: Set<string>,
  roomLookup?: RoomOccupancyLookup | null,
): Promise<any> {
  const dogs: any[] = [];
  const seenAnimalIds = new Set<string>();
  const seenReservationIds = new Set<string>();

  for (const [reservationKey, res] of Object.entries(reservations)) {
    const gingrReservationId = String(
      res.gingrReservationId || res.gingr_id || reservationKey || "",
    ).trim();
    const animalId = String(res.animal?.id || "");
    const animalName = res.animal?.name || "";
    const ownerName = `${res.owner?.first_name || ""} ${res.owner?.last_name || ""}`.trim();
    const resType = res.reservation_type?.type || "";
    const isDayBoarding = resType.toLowerCase().startsWith("day boarding");
    const hasCanonicalPrivatePlay = privatePlayAnimalIds.has(animalId);
    const services = res.services || [];
    const hasPPService = services.some((s: any) =>
      (s.name || s.service_name || "").toLowerCase().includes("private play"),
    );
    const hasPP = hasCanonicalPrivatePlay || hasPPService;

    if ((isDayBoarding || hasPP) && animalId && !seenAnimalIds.has(animalId)) {
      seenAnimalIds.add(animalId);
      if (gingrReservationId) seenReservationIds.add(gingrReservationId);
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
        roomLabel: resolveCanonicalRoomLabel(
          roomLookup,
          {
            reservationId: gingrReservationId,
            animalId,
            animalName,
            ownerFirstName: res.owner?.first_name || "",
            ownerLastName: res.owner?.last_name || "",
          },
          res.roomLabel || res.room?.name || "",
        ),
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
    if (!animalId || seenAnimalIds.has(animalId)) continue;

    seenAnimalIds.add(animalId);
    seenReservationIds.add(gingrReservationId);
    dogs.push({
      gingrReservationId,
      animalId,
      animalName: reservation.animal?.name || "",
      ownerName: `${reservation.owner?.first_name || ""} ${reservation.owner?.last_name || ""}`.trim(),
      reservationType: reservation.reservation_type?.type || "",
      requiredSessions: 3,
      source: "manual_override",
      roomLabel: String(override.room_label_override || "").trim() || resolveCanonicalRoomLabel(
        roomLookup,
        {
          reservationId: gingrReservationId,
          animalId,
          animalName: reservation.animal?.name || "",
          ownerFirstName: reservation.owner?.first_name || "",
          ownerLastName: reservation.owner?.last_name || "",
        },
        reservation.roomLabel || reservation.room?.name || "",
      ),
    });
  }

  dogs.sort((a, b) => a.animalName.localeCompare(b.animalName));
  return {
    dogs,
    summary: { totalDogs: dogs.length, requiredSessions: dogs.length * 3 },
  };
}

// ─── Room type classification ─────────────────────────────────────────────

function classifyRoomType(roomName: string): string {
  const lower = (roomName || "").toLowerCase();
  if (lower.includes("luxury")) return "Luxury Suite";
  if (lower.includes("executive")) return "Executive Room";
  if (lower.includes("double")) return "Double Compartment";
  if (lower.includes("single")) return "Single Compartment";
  return "";
}

// ─── Compute lodging transfers (canonical room occupancy comparison) ──────
// Compares canonical room-occupancy snapshots between targetDate - 1 and
// targetDate. An animal whose resolved room changed between the two days is a
// transfer.

async function computeLodgingTransfers(
  supabase: any,
  locationId: string,
  targetDate: string,
): Promise<any> {
  const prevDate = addDays(targetDate, -1);
  const [prevSnapshot, currSnapshot] = await Promise.all([
    fetchRoomOccupancySnapshotForDate({
      supabase,
      locationId,
      date: prevDate,
      includeCategories: ["boarding"],
    }),
    fetchRoomOccupancySnapshotForDate({
      supabase,
      locationId,
      date: targetDate,
      includeCategories: ["boarding"],
    }),
  ]);

  const prevMap = buildTransferAssignmentMap(prevSnapshot);
  const currMap = buildTransferAssignmentMap(currSnapshot);

  const transfers: any[] = [];

  // Find animals present on BOTH days whose room changed
  for (const [assignmentKey, curr] of Object.entries(currMap)) {
    const prev = prevMap[assignmentKey];
    if (!prev) continue; // new arrival, not a transfer
    if (prev.room_label === curr.room_label) continue; // same room

    const previousRoom = String(prev.room_label || "");
    const currentRoom = String(curr.room_label || "");
    if (!previousRoom || !currentRoom) continue;
    const prevType = classifyRoomType(previousRoom);
    const currType = classifyRoomType(currentRoom);
    const roomTypeChanged = prevType !== currType && prevType !== "" && currType !== "";

    const displayName = String(curr.animal_name || prev.animal_name || "Unknown");

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
      animalGingrId: String(curr.animal_id || prev.animal_id || ""),
      ownerName: String(curr.owner_name || prev.owner_name || ""),
      breed: "",
      weight: null,
      sizeCategory: null,
      previousRoom,
      currentRoom,
      transferDate: targetDate,
      reservationType: "",
      reservationGingrId: "",
      roomTypeChanged,
      previousRoomType: prevType,
      currentRoomType: currType,
      actionItems,
    });
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

  const completedCount = Object.values(completions).filter((c: any) => c && c.status === "complete").length;

  return {
    transfers,
    summary: { total: transfers.length, roomTypeChanged: transfers.filter((t: any) => t.roomTypeChanged).length },
    completions,
    totalCount: transfers.length,
    completedCount,
  };
}

// ─── Main handler ──────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    let locationId: string | null = null;
    let date: string | null = null;
    let kind: string | null = null;
    let refresh = false;

    try {
      const body = await req.json();
      if (body.location_id) locationId = body.location_id;
      if (body.date) date = body.date;
      if (body.kind) kind = String(body.kind);
      if (body.refresh === true) refresh = true;
    } catch {
      // No body or invalid JSON
    }

    if (!locationId || !date) {
      return new Response(
        JSON.stringify({ error: "location_id and date are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return new Response(
        JSON.stringify({ error: "date must be YYYY-MM-DD format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const startTime = Date.now();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseServiceKey);

    if (kind === "roll_call_opening" || kind === "roll_call_closing") {
      const session = normalizeRollCallSession(
        kind === "roll_call_opening" ? "opening" : "closing",
      );
      const row = await loadRollCallSessionRow(sb, locationId, date, session, {
        createIfMissing: date >= new Date().toLocaleDateString("en-CA", {
          timeZone: "America/New_York",
        }),
        forceRefresh: refresh,
      });

      return new Response(
        JSON.stringify({
          success: true,
          date,
          location_id: locationId,
          kind,
          roll_call: row?.computed_items || null,
          row_id: row?.id || null,
          title: getRollCallWorkflowTitle(session),
          missing_snapshot: !row,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const roomOccupancySnapshot = await fetchRoomOccupancySnapshotForDate({
      supabase: sb,
      locationId,
      date,
      includeCategories: ROOM_OCCUPANCY_LODGING_CATEGORIES,
    });
    const roomOccupancyLookup = buildRoomOccupancyLookup(roomOccupancySnapshot);
    const roomOccupancyComputed = buildRoomOccupancyComputedItems(roomOccupancySnapshot);

    // Compute all service reports in parallel
    const reservations = await fetchReservationsForDate(
      sb,
      locationId,
      date,
      roomOccupancyLookup,
    );
    const ppAnimalIds = [...new Set(
      Object.values(reservations)
        .map((res: any) => String(res?.animal?.id || "").trim())
        .filter(Boolean),
    )];
    const ppAssignments = ppAnimalIds.length > 0
      ? await fetchPlaygroupAssignments({
          supabase: sb,
          locationId,
          animalIds: ppAnimalIds,
          columns: "animal_gingr_id, has_private_play",
        })
      : [];
    const privatePlayAnimalIds = new Set(
      (ppAssignments || [])
        .filter((assignment: any) => assignment?.hasPrivatePlay)
        .map((assignment: any) => assignment.animalGingrId),
    );

    const [roomCleaning, bathing, pamper, enrichment, lodgingTransfers] = await Promise.all([
      computeRoomCleaning(sb, locationId, date),
      computeBathingReport(sb, locationId, date, roomOccupancyLookup),
      Promise.resolve(computeServiceReport(reservations, "pamper", roomOccupancyLookup)),
      computeEnrichmentReport(sb, locationId, date, reservations, roomOccupancyLookup),
      computeLodgingTransfers(sb, locationId, date),
    ]);
    const privatePlay = await computePrivatePlay(
      sb,
      locationId,
      date,
      reservations,
      privatePlayAnimalIds,
      roomOccupancyLookup,
    );

    // Upsert results into lite_daily_ops so subsequent requests are cached
    await Promise.allSettled([
      upsertComputedItems(sb, `ops_room_occupancy_${date}`, locationId, "room_occupancy", "room_occupancy", date, roomOccupancyComputed),
      upsertComputedItems(sb, `ops_room_cleaning_${date}`, locationId, "room_cleaning", "room_cleaning", date, roomCleaning),
      upsertComputedItems(sb, `ops_bathing_${date}`, locationId, "bathing", "bathing", date, bathing),
      upsertComputedItems(sb, `ops_pp_${date}`, locationId, "pp", "pp", date, privatePlay),
      upsertComputedItems(sb, `ops_pamper_${date}`, locationId, "pamper", "pamper", date, pamper),
      upsertComputedItems(sb, `ops_svc_${date}`, locationId, "svc", "svc", date, enrichment),
      upsertComputedItems(sb, `ops_lodging_transfer_${date}`, locationId, "lodging_transfer", "lodging_transfer", date, lodgingTransfers),
    ]);

    const duration = Date.now() - startTime;

    return new Response(
      JSON.stringify({
        success: true,
        date,
        location_id: locationId,
        duration_ms: duration,
        room_occupancy: roomOccupancyComputed,
        room_cleaning: roomCleaning,
        bathing,
        pamper,
        enrichment,
        private_play: privatePlay,
        lodging_transfers: lodgingTransfers,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("ops-compute-ondemand error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

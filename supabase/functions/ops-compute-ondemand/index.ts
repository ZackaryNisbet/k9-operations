// ============================================================================
// Ops Compute On-Demand — K9 Operations Lite
// Lightweight edge function that computes bathing + pamper + enrichment +
// private play for a specific date on-demand. No room cleaning, no checklists,
// no Gingr web auth. Caches results in lite_daily_ops.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildSuggestedBathStatusContext,
  calculateNights,
  extractBathLikeServices,
  getBathSchedulingForDate,
  isBoardingReservation,
  normalizeBathDisplay,
} from "../_shared/bathing-logic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
): Promise<Record<string, any>> {
  const nextDay = addDays(targetDate, 1);
  const resSelect = "gingr_id, animal_gingr_id, animal_name, owner_first_name, owner_last_name, reservation_type_name, start_date, end_date, check_in_date, check_out_date, cancelled_date, raw_data, services";

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
    };
  }
  return result;
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

async function computeBathingReport(supabase: any, locationId: string, targetDate: string): Promise<any> {
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
          statusContext: buildSuggestedBathStatusContext(targetDate, scheduledOtherDay),
        });
      }
      continue;
    }

    const animalGingrId = String(r.animal_gingr_id || rd.animal?.id || "").trim();
    if (animalGingrId) animalIds.push(animalGingrId);

    const svcsForAddons = rawSvcs.length > 0 ? rawSvcs : topSvcs;
    const { addonType, modifiers } = parseBathAddonsFromServices(svcsForAddons);
    const roomLabel = r.room_assignment || rd.run?.name || "";

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
      statusContext: buildSuggestedBathStatusContext(targetDate, null),
    });
  }

  // Fetch bath icons, play icons, and weights
  // iconMap stores ALL bath icons per dog (array) to support multiple bath types
  let iconMap: Record<string, Array<{ title: string; comment: string }>> = {};
  let playIconMap: Record<string, string> = {};
  let weightMap: Record<string, number | null> = {};
  if (animalIds.length > 0) {
    const [{ data: icons }, { data: playIcons }, { data: animals }] = await Promise.all([
      supabase.from("gingr_animal_icons_live").select("animal_gingr_id, icon_title, icon_comment")
        .eq("location_id", locationId).eq("icon_group", "Bath").in("animal_gingr_id", animalIds),
      supabase.from("gingr_animal_icons_live").select("animal_gingr_id, icon_title")
        .eq("location_id", locationId).eq("icon_group", "Play").in("animal_gingr_id", animalIds),
      supabase.from("gingr_animals").select("gingr_id, weight").in("gingr_id", animalIds),
    ]);
    (icons || []).forEach((r: any) => {
      const id = r.animal_gingr_id;
      if (!iconMap[id]) iconMap[id] = [];
      iconMap[id].push({ title: r.icon_title || "", comment: r.icon_comment || "" });
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

  // ─── Room occupancy: sibling/roommate grouping ─────────────────────────
  const { data: roomOcc } = await supabase
    .from("gingr_room_occupancy")
    .select("run_name, animal_names")
    .eq("location_id", locationId)
    .eq("occupancy_date", targetDate)
    .eq("occupied", true);

  // Build map: dogName (lowercased) → { runName, ownerName, animals: [{name, owner}] }
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
      roomByDogName[occ.name.toLowerCase()] = {
        runName: row.run_name,
        ownerName: occ.owner,
        allOccupants: occupants,
      };
    }
  }

  // ─── Avg checkout time from cache ──────────────────────────────────────
  const allDogEntries = [...bathDogs, ...suggestedDogs];
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
    const iconTitles = icons.map(i => i.title).filter(Boolean);
    const iconComments = icons.map(i => i.comment).filter(Boolean);
    const normalizedBath = normalizeBathDisplay({
      iconTitles,
      addonType: d.addonType,
      serviceName: d.bathServiceName,
      rawModifiers: d.bathModifiers,
      defaultType: "Standard",
    });
    const weight = weightMap[d.animalGingrId] ?? null;
    const sizeCategory = weight != null ? (weight < 30 ? "small" : "large") : null;
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
      serviceNotes: "",
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
  const suggestedDogsOut = suggestedDogs.map(buildDogOutput);
  const dogs = [...scheduledDogs, ...suggestedDogsOut];

  // Sort: scheduled first (by scheduledAt), then suggested (by animalName)
  dogs.sort((a, b) => {
    if (a.status !== b.status) return a.status === "scheduled" ? -1 : 1;
    if (a.siblingGroup && a.siblingGroup === b.siblingGroup) return a.animalName.localeCompare(b.animalName);
    if (a.status === "scheduled") return (a.scheduledAt || "").localeCompare(b.scheduledAt || "");
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
  const suggestedCount = grouped.filter(d => d.status === "suggested").length;
  const byCategory: Record<string, number> = { boarding: 0, daycare: 0, day_boarding: 0, evaluation: 0, suggested: suggestedCount };
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
): any {
  const dogs: any[] = [];
  const seen = new Set<string>();

  for (const res of Object.values(reservations)) {
    const services = res.services || [];
    const matched = services.filter((s: any) =>
      (s.name || s.service_name || "").toLowerCase().includes(filterKeyword.toLowerCase()),
    );
    if (matched.length === 0) continue;

    const animalId = String(res.animal?.id || "");
    if (!animalId || seen.has(animalId)) continue;
    seen.add(animalId);

    dogs.push({
      animalId,
      animalName: res.animal?.name || "",
      ownerName: `${res.owner?.first_name || ""} ${res.owner?.last_name || ""}`.trim(),
      services: matched.map((s: any) => s.name || s.service_name || filterKeyword),
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
): Promise<any> {
  const scheduled: any[] = [];
  const suggested: any[] = [];
  const seen = new Set<string>();

  // 1) First try local reservations (from Supabase — currently checked-in dogs)
  for (const res of Object.values(localReservations)) {
    const services = res.services || [];
    const animalId = String(res.animal?.id || "");
    if (!animalId || seen.has(animalId)) continue;

    const enrichmentServices = services.filter((s: any) =>
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
          (s?.name || s?.service_name || "").toLowerCase().includes("enrichment"),
        );
        if (enrichmentSvcs.length === 0) continue;
        seen.add(animalId);

        scheduled.push({
          animalId,
          animalName: row?.animal_name || "",
          ownerName: `${row?.owner_first_name || ""} ${row?.owner_last_name || ""}`.trim(),
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

function computePrivatePlay(reservations: Record<string, any>): any {
  const dogs: any[] = [];
  const seen = new Set<string>();

  for (const res of Object.values(reservations)) {
    const animalId = String(res.animal?.id || "");
    const animalName = res.animal?.name || "";
    const ownerName = `${res.owner?.first_name || ""} ${res.owner?.last_name || ""}`.trim();
    const resType = res.reservation_type?.type || "";
    const isDayBoarding = resType.toLowerCase().startsWith("day boarding");
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

// ─── Compute lodging transfers (occupancy comparison) ─────────────────────
// Compares gingr_room_occupancy between targetDate - 1 and targetDate.
// An animal whose run_name changed between the two days is a transfer.

async function computeLodgingTransfers(
  supabase: any,
  locationId: string,
  targetDate: string,
): Promise<any> {
  const prevDate = addDays(targetDate, -1);

  // Fetch occupancy for both days in parallel
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
  function parseOccupancy(rows: any[]): Record<string, { runName: string; ownerName: string }> {
    const map: Record<string, { runName: string; ownerName: string }> = {};
    for (const row of rows || []) {
      if (!row.animal_names || !row.run_name) continue;
      const entries = (row.animal_names as string).split("<br>").map((e: string) => e.trim()).filter(Boolean);
      for (const entry of entries) {
        // Handle names like "Oslo Teddy (Ozzy) (Samantha  Schramak)"
        // Owner name is always the LAST parenthesized group
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
          // Dog name is everything before the last paren group
          const lastParenIdx = entry.lastIndexOf(`(${ownerName})`);
          dogName = entry.substring(0, lastParenIdx).trim();
          // Remove trailing paren content that's part of the dog name's own parens
          // e.g., "Oslo Teddy (Ozzy)" stays as-is
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

  const prevMap = parseOccupancy(prevOcc);
  const currMap = parseOccupancy(currOcc);

  const transfers: any[] = [];

  // Find animals present on BOTH days whose room changed
  for (const [nameKey, curr] of Object.entries(currMap)) {
    const prev = prevMap[nameKey];
    if (!prev) continue; // new arrival, not a transfer
    if (prev.runName === curr.runName) continue; // same room

    const previousRoom = prev.runName;
    const currentRoom = curr.runName;
    const prevType = classifyRoomType(previousRoom);
    const currType = classifyRoomType(currentRoom);
    const roomTypeChanged = prevType !== currType && prevType !== "" && currType !== "";

    // Reconstruct display name from the key (use current day entry for casing)
    // Find the original-cased name from currOcc
    let displayName = nameKey;
    for (const row of currOcc || []) {
      if (!row.animal_names) continue;
      const entries = (row.animal_names as string).split("<br>").map((e: string) => e.trim()).filter(Boolean);
      for (const entry of entries) {
        if (entry.toLowerCase().startsWith(nameKey)) {
          // Extract just the dog name portion (before owner paren)
          const parenGroups: string[] = [];
          const parenRe = /\(([^)]+)\)/g;
          let m;
          while ((m = parenRe.exec(entry)) !== null) {
            parenGroups.push(m[1].trim());
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
      animalGingrId: "",
      ownerName: curr.ownerName || prev.ownerName || "",
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

    try {
      const body = await req.json();
      if (body.location_id) locationId = body.location_id;
      if (body.date) date = body.date;
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

    // Compute all service reports in parallel
    const reservations = await fetchReservationsForDate(sb, locationId, date);

    const [bathing, pamper, enrichment, lodgingTransfers] = await Promise.all([
      computeBathingReport(sb, locationId, date),
      Promise.resolve(computeServiceReport(reservations, "pamper")),
      computeEnrichmentReport(sb, locationId, date, reservations),
      computeLodgingTransfers(sb, locationId, date),
    ]);
    const privatePlay = computePrivatePlay(reservations);

    // Upsert results into lite_daily_ops so subsequent requests are cached
    await Promise.allSettled([
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

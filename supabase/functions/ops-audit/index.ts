// ============================================================================
// Ops Audit — K9 Operations
// Compares app-computed data against Gingr source data for validation.
// Supports bathing plus workflow audits against browser-visible Gingr data.
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
import {
  fetchAnimalViewJson,
  fetchReservationViewJson,
  gingrWebLogin,
} from "../_shared/gingr-browser-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ─── Helpers ──────────────────────────────────────────────────────────────

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function normalizeIcons(icons: string[]): string[] {
  return icons
    .map(i => i.trim().toUpperCase())
    .filter(Boolean)
    .sort();
}

function normalizeName(name: string): string {
  return (name || "").trim().toLowerCase();
}

function normalizeText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value).trim();
  if (Array.isArray(value)) return value.map(normalizeText).filter(Boolean).join(", ");
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).map(normalizeText).filter(Boolean).join(" ");
  return "";
}

function normalizeList<T = any>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object") return Object.values(value as Record<string, T>);
  return [];
}

function choiceLabel(value: any): string {
  return normalizeText(value?.label || value?.name || value?.value || value);
}

function dogKey(animalName: string, ownerLastName: string): string {
  const name = (animalName || "").trim();
  const initial = (ownerLastName || "").trim().charAt(0).toUpperCase();
  return initial ? `${name} ${initial}.` : name;
}

function daysBetween(startDateStr: string, endDateStr: string): number {
  const startDay = startDateStr.split("T")[0];
  const endDay = endDateStr.split("T")[0];
  if (!startDay || !endDay) return 0;
  const startMs = new Date(startDay + "T12:00:00").getTime();
  const endMs = new Date(endDay + "T12:00:00").getTime();
  return Math.round((endMs - startMs) / (24 * 60 * 60 * 1000));
}

async function mapInBatches<T, U>(
  items: T[],
  batchSize: number,
  mapper: (item: T, index: number) => Promise<U>,
) {
  const results: U[] = [];
  for (let index = 0; index < items.length; index += batchSize) {
    const batch = items.slice(index, index + batchSize);
    const mapped = await Promise.all(batch.map((item, offset) => mapper(item, index + offset)));
    results.push(...mapped);
  }
  return results;
}

// ─── Fetch app bathing data from lite_daily_ops ───────────────────────────

async function fetchAppBathingData(
  sb: any,
  locationId: string,
  targetDate: string,
): Promise<any[]> {
  const opsId = `ops_bathing_${targetDate}`;
  const { data: opsRow } = await sb
    .from("lite_daily_ops")
    .select("computed_items")
    .eq("id", opsId)
    .eq("location_id", locationId)
    .limit(1)
    .maybeSingle();

  if (opsRow?.computed_items?.dogs && Array.isArray(opsRow.computed_items.dogs)) {
    return opsRow.computed_items.dogs;
  }

  // Fallback: call ops-compute-ondemand
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resp = await fetch(`${supabaseUrl}/functions/v1/ops-compute-ondemand`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${supabaseServiceKey}`,
    },
    body: JSON.stringify({ date: targetDate, location_id: locationId }),
  });

  if (!resp.ok) {
    throw new Error(`ops-compute-ondemand returned ${resp.status}: ${await resp.text()}`);
  }

  const result = await resp.json();
  if (result.bathing?.dogs && Array.isArray(result.bathing.dogs)) {
    return result.bathing.dogs;
  }

  return [];
}

// ─── Fetch Gingr ground truth from gingr_reservations ─────────────────────

interface GingrBathDog {
  animalName: string;
  animalGingrId: string;
  ownerFirstName: string;
  ownerLastName: string;
  gingrReservationId: string;
  bathServiceName: string;
  bathType: string;
  bathAddons: string[];
  bathModifiers: string[];
  scheduledAt: string;
  reservationType: string;
}

async function fetchGingrGroundTruth(
  sb: any,
  locationId: string,
  targetDate: string,
): Promise<{ bathDogs: GingrBathDog[]; allRes: any[] }> {
  const nextDay = addDays(targetDate, 1);
  const resSelect = "gingr_id, animal_gingr_id, animal_name, owner_first_name, owner_last_name, reservation_type_name, start_date, end_date, check_in_date, check_out_date, cancelled_date, raw_data, services";

  const [{ data: activeRes }, { data: coRes }, { data: pendingRes }] = await Promise.all([
    sb.from("gingr_reservations").select(resSelect)
      .eq("location_id", locationId)
      .not("check_in_date", "is", null).is("check_out_date", null).is("cancelled_date", null)
      .lte("start_date", `${targetDate}T23:59:59`).gte("end_date", `${targetDate}T00:00:00`),
    sb.from("gingr_reservations").select(resSelect)
      .eq("location_id", locationId)
      .not("check_out_date", "is", null).is("cancelled_date", null)
      .gte("check_out_date", targetDate + "T00:00:00").lt("check_out_date", nextDay + "T00:00:00"),
    sb.from("gingr_reservations").select(resSelect)
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

  const bathDogs: GingrBathDog[] = [];
  const animalIds: string[] = [];

  for (const r of allRes) {
    const rd = r.raw_data || {};
    const rawSvcs = rd.services || [];
    const topSvcs = Array.isArray(r.services) ? r.services : [];
    const bathServices = extractBathLikeServices(rawSvcs, topSvcs);
    const { scheduledToday, hasBathOrGroom } = getBathSchedulingForDate(bathServices, targetDate);
    if (!hasBathOrGroom || !scheduledToday) continue;

    const animalGingrId = String(r.animal_gingr_id || rd.animal?.id || "").trim();
    if (animalGingrId) animalIds.push(animalGingrId);

    const svcsForAddons = rawSvcs.length > 0 ? rawSvcs : topSvcs;
    const addonNames: string[] = [];
    const modifiers: string[] = [];
    const MODIFIER_SET = new Set(["NO CRATE DRYER", "NO VELOCITY DRYER", "TOWEL DRY ONLY", "*See account notes*"]);
    const BATH_ADDON_KEYWORDS = ["premium", "hypo", "medicated", "shampoo", "no spray", "standard", "fresh", "velocity", "crate", "dryer", "towel"];
    for (const svc of svcsForAddons) {
      const n = typeof svc === "string" ? svc : svc?.name || "";
      if (!n || n.toLowerCase().includes("bath")) continue;
      // Only include bath-related addons — skip food, ice cream, medication, enrichment, etc.
      const lower = n.toLowerCase();
      const isBathRelated = BATH_ADDON_KEYWORDS.some(kw => lower.includes(kw));
      if (MODIFIER_SET.has(n)) modifiers.push(n);
      else if (isBathRelated) addonNames.push(n);
      // else: non-bath service, skip (food from home, ice cream, medication, etc.)
    }

    const normalizedFromServices = normalizeBathDisplay({
      iconTitles: addonNames,
      serviceName: scheduledToday.name,
      rawModifiers: modifiers,
      defaultType: "Standard",
    });
    const resType = rd.reservation_type || {};

    bathDogs.push({
      animalName: r.animal_name || rd.animal?.name || "Unknown",
      animalGingrId,
      ownerFirstName: r.owner_first_name || rd.owner?.first_name || "",
      ownerLastName: r.owner_last_name || rd.owner?.last_name || "",
      gingrReservationId: String(r.gingr_id || ""),
      bathServiceName: scheduledToday.name || "",
      bathType: normalizedFromServices.bathType,
      bathAddons: normalizedFromServices.bathIcons,
      bathModifiers: normalizedFromServices.bathModifiers,
      scheduledAt: scheduledToday.scheduledAt,
      reservationType: resType.type || r.reservation_type_name || "",
    });
  }

  // Fetch bath icons from gingr_animal_icons_live
  if (animalIds.length > 0) {
    const { data: icons } = await sb
      .from("gingr_animal_icons_live")
      .select("animal_gingr_id, icon_title, icon_comment")
      .eq("location_id", locationId)
      .eq("icon_group", "Bath")
      .in("animal_gingr_id", animalIds);

    const iconMap: Record<string, string[]> = {};
    for (const icon of (icons || [])) {
      const id = icon.animal_gingr_id;
      if (!iconMap[id]) iconMap[id] = [];
      iconMap[id].push(icon.icon_title || "");
    }

    for (const dog of bathDogs) {
      if (iconMap[dog.animalGingrId]) {
        const normalized = normalizeBathDisplay({
          iconTitles: iconMap[dog.animalGingrId].filter(Boolean),
          serviceName: dog.bathServiceName,
          rawModifiers: dog.bathModifiers,
          defaultType: "Standard",
        });
        dog.bathType = normalized.bathType;
        dog.bathAddons = normalized.bathIcons;
        dog.bathModifiers = normalized.bathModifiers;
      }
    }
  }

  return { bathDogs, allRes };
}

// ─── Detect Fresh n Clean dogs ───────────────────────────────────────────
// Boarding exactly 1 night, departing today, no bath service on reservation

interface FreshNCleanDog {
  name: string;
  nights: number;
  has_bath: boolean;
  valid: boolean;
}

function detectFreshNClean(
  appDogs: any[],
  allRes: any[],
  gingrBathResIds: Set<string>,
  targetDate: string,
): FreshNCleanDog[] {
  // Get Fresh n Clean dogs from app data
  const appFnc = appDogs.filter(d => d.isFreshNClean === true);

  if (appFnc.length === 0) {
    // App didn't find any — run detection ourselves from raw reservations
    return detectFreshNCleanFromReservations(allRes, gingrBathResIds, targetDate);
  }

  // Validate each app-reported Fresh n Clean dog against reservation data
  return appFnc.map(d => {
    const resId = d.gingrReservationId || "";
    const res = allRes.find(r => String(r.gingr_id) === resId);

    let nights = 0;
    let hasBath = false;

    if (res) {
      const startDate = res.start_date || "";
      const endDate = res.end_date || "";
      nights = daysBetween(startDate, endDate);

      const rd = res.raw_data || {};
      const rawSvcs = rd.services || [];
      const topSvcs = Array.isArray(res.services) ? res.services : [];
      hasBath = [...rawSvcs, ...topSvcs].some((s: any) => {
        const n = typeof s === "string" ? s : s?.name || "";
        return n.toLowerCase().includes("bath");
      });
    }

    const ownerLast = (d.ownerName || "").split(" ").pop() || "";
    return {
      name: dogKey(d.animalName, ownerLast),
      nights,
      has_bath: hasBath,
      valid: nights === 1 && !hasBath,
    };
  });
}

function detectFreshNCleanFromReservations(
  allRes: any[],
  gingrBathResIds: Set<string>,
  targetDate: string,
): FreshNCleanDog[] {
  const results: FreshNCleanDog[] = [];

  for (const r of allRes) {
    const resId = String(r.gingr_id || "");
    if (gingrBathResIds.has(resId)) continue;

    const resTypeName = (r.reservation_type_name || "").toLowerCase();
    if (!resTypeName.includes("boarding")) continue;

    const rd = r.raw_data || {};
    const endDate = rd.end_date || r.end_date || "";
    if (!endDate.includes(targetDate)) continue;

    const startDate = r.start_date || "";
    const nights = daysBetween(startDate, endDate);
    if (nights !== 1) continue;

    const rawSvcs = rd.services || [];
    const topSvcs = Array.isArray(r.services) ? r.services : [];
    const hasBath = [...rawSvcs, ...topSvcs].some((s: any) => {
      const n = typeof s === "string" ? s : s?.name || "";
      return n.toLowerCase().includes("bath");
    });
    if (hasBath) continue;

    const ownerLast = r.owner_last_name || rd.owner?.last_name || "";
    const animalName = r.animal_name || rd.animal?.name || "Unknown";

    results.push({
      name: dogKey(animalName, ownerLast),
      nights: 1,
      has_bath: false,
      valid: true,
    });
  }

  return results;
}

// ─── Detect Suggested Bath dogs ──────────────────────────────────────────
// Departing today + boarded 2+ nights + no bath on reservation

interface SuggestedDog {
  name: string;
  nights: number;
  has_bath: boolean;
  valid: boolean;
  context?: string;
}

interface ManualOverrideDog {
  name: string;
  bathType: string;
  note: string;
}

function detectSuggested(
  appDogs: any[],
  allRes: any[],
  gingrBathResIds: Set<string>,
  targetDate: string,
): SuggestedDog[] {
  // Get suggested dogs from app data
  const appSuggested = appDogs.filter(d => d.status === "suggested");

  if (appSuggested.length === 0) {
    // App didn't find any — run detection ourselves
    return detectSuggestedFromReservations(allRes, gingrBathResIds, targetDate);
  }

  // Validate each app-reported suggested dog
  return appSuggested.map(d => {
    const resId = d.gingrReservationId || "";
    const res = allRes.find(r => String(r.gingr_id) === resId);

    let nights = 0;
    let hasBath = false;
    let hasBathToday = false;
    let context = d.statusContext?.message || "";
    let isBoarding = false;
    let departsToday = false;

    if (res) {
      const rd = res.raw_data || {};
      const startDate = rd.start_date || res.start_date || "";
      const endDate = rd.end_date || res.end_date || "";
      nights = calculateNights(startDate, endDate);
      departsToday = (endDate || "").includes(targetDate);
      isBoarding = isBoardingReservation(rd.reservation_type?.type || res.reservation_type_name || "");

      const bathServices = extractBathLikeServices(rd.services || [], Array.isArray(res.services) ? res.services : []);
      const { scheduledToday, scheduledOtherDay, hasBathOrGroom } = getBathSchedulingForDate(bathServices, targetDate);
      hasBath = hasBathOrGroom;
      hasBathToday = !!scheduledToday;
      if (!context) {
        context = buildSuggestedBathStatusContext(targetDate, scheduledOtherDay).message;
      }
    }

    const ownerLast = (d.ownerName || "").split(" ").pop() || "";
    return {
      name: dogKey(d.animalName, ownerLast),
      nights,
      has_bath: hasBath,
      valid: departsToday && isBoarding && nights >= 2 && !hasBathToday,
      context,
    };
  });
}

function detectSuggestedFromReservations(
  allRes: any[],
  gingrBathResIds: Set<string>,
  targetDate: string,
): SuggestedDog[] {
  const results: SuggestedDog[] = [];
  // Also exclude reservations we've already counted as Fresh n Clean
  const allBathResIds = new Set(gingrBathResIds);

  for (const r of allRes) {
    const resId = String(r.gingr_id || "");
    if (allBathResIds.has(resId)) continue;

    const rd = r.raw_data || {};
    const startDate = rd.start_date || r.start_date || "";
    const endDate = rd.end_date || r.end_date || "";
    const endDay = endDate.split("T")[0];
    if (endDay !== targetDate) continue;

    const reservationTypeName = rd.reservation_type?.type || r.reservation_type_name || "";
    if (!isBoardingReservation(reservationTypeName)) continue;

    const nights = calculateNights(startDate, endDate);
    if (nights < 2) continue;

    const bathServices = extractBathLikeServices(rd.services || [], Array.isArray(r.services) ? r.services : []);
    const { scheduledToday, scheduledOtherDay, hasBathOrGroom } = getBathSchedulingForDate(bathServices, targetDate);
    if (scheduledToday) continue;

    const ownerLast = r.owner_last_name || rd.owner?.last_name || "";
    const animalName = r.animal_name || rd.animal?.name || "Unknown";

    results.push({
      name: dogKey(animalName, ownerLast),
      nights,
      has_bath: hasBathOrGroom,
      valid: true,
      context: buildSuggestedBathStatusContext(targetDate, scheduledOtherDay).message,
    });
  }

  return results;
}

// ─── Compare app data vs Gingr ground truth (ICONS-based) ───────────────

interface DogDetail {
  dog: string;
  status: "match" | "mismatch" | "missing_from_app" | "missing_from_gingr";
  field?: string;
  app: any;
  gingr: any;
}

function compareBathingData(
  appDogs: any[],
  gingrDogs: GingrBathDog[],
) {
  // Only compare scheduled dogs (exclude Fresh n Clean and suggested)
  const scheduledAppDogs = appDogs.filter(d => d.status === "scheduled" && !d.isFreshNClean);

  const appByAnimalId: Record<string, any> = {};
  for (const d of scheduledAppDogs) {
    const key = d.animalGingrId || "";
    if (key) appByAnimalId[key] = d;
  }

  const gingrByAnimalId: Record<string, GingrBathDog> = {};
  for (const d of gingrDogs) {
    const key = d.animalGingrId || "";
    if (key) gingrByAnimalId[key] = d;
  }

  const appByName: Record<string, any> = {};
  for (const d of scheduledAppDogs) {
    const key = normalizeName(d.animalName);
    if (key && !appByName[key]) appByName[key] = d;
  }

  const gingrByName: Record<string, GingrBathDog> = {};
  for (const d of gingrDogs) {
    const key = normalizeName(d.animalName);
    if (key && !gingrByName[key]) gingrByName[key] = d;
  }

  const details: DogDetail[] = [];
  const matchedAppIds = new Set<string>();
  const matchedGingrIds = new Set<string>();
  let matched = 0;
  let mismatched = 0;
  const missingFromApp: string[] = [];
  const missingFromGingr: string[] = [];
  const iconMismatches: Array<{ dog: string; app_icons: string[]; gingr_icons: string[] }> = [];

  for (const gingrDog of gingrDogs) {
    const gId = gingrDog.animalGingrId;
    const gName = normalizeName(gingrDog.animalName);
    const displayName = dogKey(gingrDog.animalName, gingrDog.ownerLastName);

    let appDog = appByAnimalId[gId];
    if (!appDog && gName) appDog = appByName[gName];

    if (!appDog) {
      missingFromApp.push(displayName);
      details.push({
        dog: displayName,
        status: "missing_from_app",
        app: null,
        gingr: {
          animalName: gingrDog.animalName,
          icons: gingrDog.bathAddons,
          modifiers: gingrDog.bathModifiers,
          reservationType: gingrDog.reservationType,
        },
      });
      continue;
    }

    matchedAppIds.add(appDog.animalGingrId || normalizeName(appDog.animalName));
    matchedGingrIds.add(gId || gName);

    // Compare on ICONS only (order-insensitive set comparison)
    const appIcons = normalizeIcons(appDog.bathIcons || []);
    const gingrIcons = normalizeIcons(gingrDog.bathAddons || []);
    const iconsMatch = JSON.stringify(appIcons) === JSON.stringify(gingrIcons);

    if (iconsMatch) {
      matched++;
      details.push({
        dog: displayName,
        status: "match",
        app: {
          animalName: appDog.animalName,
          icons: appDog.bathIcons || [],
          modifiers: appDog.bathModifiers || [],
        },
        gingr: {
          animalName: gingrDog.animalName,
          icons: gingrDog.bathAddons || [],
          modifiers: gingrDog.bathModifiers || [],
        },
      });
    } else {
      mismatched++;
      iconMismatches.push({
        dog: displayName,
        app_icons: appDog.bathIcons || [],
        gingr_icons: gingrDog.bathAddons || [],
      });
      details.push({
        dog: displayName,
        status: "mismatch",
        field: "icons",
        app: {
          animalName: appDog.animalName,
          icons: appDog.bathIcons || [],
          modifiers: appDog.bathModifiers || [],
        },
        gingr: {
          animalName: gingrDog.animalName,
          icons: gingrDog.bathAddons || [],
          modifiers: gingrDog.bathModifiers || [],
        },
      });
    }
  }

  // Find app dogs missing from Gingr
  for (const appDog of scheduledAppDogs) {
    const aId = appDog.animalGingrId || "";
    const aName = normalizeName(appDog.animalName);
    if (matchedAppIds.has(aId) || matchedAppIds.has(aName)) continue;

    if (gingrByName[aName] && !matchedGingrIds.has(gingrByName[aName].animalGingrId) && !matchedGingrIds.has(aName)) continue;

    const displayName = dogKey(appDog.animalName, (appDog.ownerName || "").split(" ").pop() || "");
    missingFromGingr.push(displayName);
    details.push({
      dog: displayName,
      status: "missing_from_gingr",
      app: {
        animalName: appDog.animalName,
        icons: appDog.bathIcons || [],
        modifiers: appDog.bathModifiers || [],
      },
      gingr: null,
    });
  }

  return {
    matched,
    mismatched,
    missing_from_app: missingFromApp,
    missing_from_gingr: missingFromGingr,
    icon_mismatches: iconMismatches,
    details,
  };
}

const WORKFLOW_AUDIT_CONFIG: Record<string, {
  label: string;
  typeSub: string;
  session?: "am" | "midday" | "pm";
  kind: "feeding-meds" | "feeding-report";
}> = {
  feeding_meds_am: { label: "AM Feeding and Meds", typeSub: "feeding_meds_am", session: "am", kind: "feeding-meds" },
  feeding_meds_midday: { label: "Midday Feeding and Meds", typeSub: "feeding_meds_midday", session: "midday", kind: "feeding-meds" },
  feeding_meds_pm: { label: "PM Feeding and Meds", typeSub: "feeding_meds_pm", session: "pm", kind: "feeding-meds" },
  feeding_report: { label: "Feeding Report", typeSub: "feeding_report", kind: "feeding-report" },
};

function normalizeReservationCollection(result: any): any[] {
  if (Array.isArray(result?.data)) return result.data;
  if (result?.data && typeof result.data === "object") return Object.values(result.data);
  if (Array.isArray(result)) return result;
  return [];
}

function classifyReservationCategory(typeName: string): string {
  const value = String(typeName || "").toLowerCase();
  if (value.includes("evaluation") || value.includes("eval")) return "evaluation";
  if (value.includes("day board")) return "day boarding";
  if (value.includes("daycare") || value.includes("day care")) return "daycare";
  if (value.includes("boarding") || value.includes("suite") || value.includes("villa") || value.includes("executive") || value.includes("compartment")) return "boarding";
  return "other";
}

function normalizeInstructionLabel(value: any) {
  const parts = [
    normalizeText(value?.summary),
    normalizeText(value?.detail),
    normalizeText(value?.schedule),
    normalizeText(value?.notes),
    normalizeText(value?.medication_name),
    normalizeText(value?.food_type),
    normalizeText(value?.schedule_time),
    normalizeText(value?.frequency),
  ].filter(Boolean);
  return [...new Set(parts)].join(" · ");
}

function workflowDogKey(row: any) {
  return String(row?.reservationId || row?.reservation_id || row?.animalGingrId || row?.animal_gingr_id || normalizeName(row?.dogName || row?.animalName || row?.animal_name || ""));
}

function matchesWorkflowSession(row: any, session: "am" | "midday" | "pm", type: "feeding" | "medication") {
  const text = [
    normalizeText(row?.schedule_time),
    normalizeText(row?.frequency),
    normalizeText(row?.raw_data?.schedule_time),
    normalizeText(row?.raw_data?.schedule),
    normalizeText(row?.raw_data?.normalized_schedule_label),
  ].join(" ").toLowerCase();

  if (text.includes("three") || text.includes("3x") || text.includes("tid")) return true;
  if (session === "midday") {
    if (text.includes("midday") || text.includes("noon") || text.includes("12") || text.includes("afternoon")) return true;
    return false;
  }
  if (session === "am") {
    if (text.includes("am") || text.includes("morning") || text.includes("breakfast") || text.includes("7") || text.includes("6")) return true;
    if (text.includes("twice") || text.includes("2x") || text.includes("bid")) return true;
    return !text && type === "feeding";
  }
  if (text.includes("pm") || text.includes("evening") || text.includes("dinner") || text.includes("night") || text.includes("17") || text.includes("18") || text.includes("19")) return true;
  if (text.includes("twice") || text.includes("2x") || text.includes("bid")) return true;
  return !text;
}

async function fetchGingrConfig(sb: any, locationId: string) {
  const { data, error } = await sb
    .from("lite_settings")
    .select("setting_value")
    .eq("location_id", locationId)
    .eq("setting_key", "gingr_config")
    .maybeSingle();

  if (error) throw error;
  const config = data?.setting_value || {};
  if (!config?.api_key || !config?.subdomain) {
    throw new Error("Gingr is not configured for this location.");
  }
  return { subdomain: String(config.subdomain), apiKey: String(config.api_key) };
}

function buildBrowserFeedingItems(report: any) {
  const payload = report?.feeding_report || report?.feedingReport || report?.feeding_info || report?.feedingInfo || report || {};
  const schedules = normalizeList<any>(payload?.feedingSchedules || payload?.feeding_schedules);
  const foodType = choiceLabel(payload?.foodType || payload?.food_type) || choiceLabel(payload?.feedingMethod || payload?.feeding_method) || "Feeding";
  const feedingNotes = normalizeText(payload?.feedingNotes || payload?.feeding_notes);

  if (schedules.length === 0 && !foodType && !feedingNotes) {
    return [];
  }

  if (schedules.length === 0) {
    return [{
      id: "feeding_browser_default",
      summary: foodType || "Feeding",
      detail: foodType || "Feeding",
      schedule: "",
      notes: feedingNotes,
      food_type: foodType,
      schedule_time: "",
      frequency: "",
      raw_data: { source: "gingr_browser_view_json", payload },
    }];
  }

  return schedules.map((schedule, index) => {
    const scheduleLabel = choiceLabel(schedule?.feedingSchedule || schedule?.schedule || schedule?.time);
    const amount = [
      choiceLabel(schedule?.feedingAmount || schedule?.amount),
      choiceLabel(schedule?.feedingUnit || schedule?.unit),
    ].filter(Boolean).join(" ").trim();
    const scheduleNotes = normalizeText(schedule?.feedingInstructions || schedule?.instructions);
    const summary = [amount, foodType].filter(Boolean).join(" · ") || foodType || "Feeding";

    return {
      id: `feeding_browser_${index}`,
      summary,
      detail: [amount, foodType, scheduleLabel].filter(Boolean).join(" · ") || summary,
      schedule: scheduleLabel,
      notes: [scheduleNotes, feedingNotes].filter(Boolean).join(" · "),
      food_type: foodType,
      schedule_time: scheduleLabel,
      frequency: scheduleLabel,
      raw_data: {
        source: "gingr_browser_view_json",
        payload,
        schedule,
        normalized_schedule_label: scheduleLabel,
      },
    };
  });
}

function buildBrowserMedicationItems(report: any) {
  const payload = report?.medication_report || report?.medicationReport || report?.medication_info || report?.medicationInfo || report || {};
  const schedules = normalizeList<any>(payload?.medicationSchedules || payload?.medication_schedules);

  return schedules.flatMap((schedule, scheduleIndex) => {
    const scheduleLabel = choiceLabel(schedule?.medicationSchedule || schedule?.schedule || schedule?.time);
    return normalizeList<any>(schedule?.medications || schedule?.items).map((medication, medIndex) => {
      const medicationName =
        choiceLabel(medication?.medicationType || medication?.medication_type || medication?.type) ||
        normalizeText(medication?.medication_name) ||
        "Medication";
      const dosage = [
        choiceLabel(medication?.medicationAmount || medication?.amount),
        choiceLabel(medication?.medicationUnit || medication?.unit),
      ].filter(Boolean).join(" ").trim();
      const notes = normalizeText(medication?.medicationNotes || medication?.notes || payload?.medicationNotes || payload?.medication_notes);
      const summary = [medicationName, dosage].filter(Boolean).join(" · ") || medicationName;

      return {
        id: `medication_browser_${scheduleIndex}_${medIndex}`,
        summary,
        detail: [medicationName, dosage, scheduleLabel].filter(Boolean).join(" · ") || summary,
        schedule: scheduleLabel,
        notes,
        medication_name: medicationName,
        dosage,
        schedule_time: scheduleLabel,
        frequency: scheduleLabel,
        raw_data: {
          source: "gingr_browser_view_json",
          payload,
          schedule,
          medication,
          normalized_schedule_label: scheduleLabel,
        },
      };
    });
  });
}

async function fetchWorkflowCandidateReservations(
  sb: any,
  locationId: string,
  date: string,
  kind: "feeding-meds" | "feeding-report",
) {
  const { data, error } = await sb
    .from("gingr_reservations")
    .select("gingr_id, animal_gingr_id, animal_name, owner_first_name, owner_last_name, reservation_type_name, start_date, end_date, cancelled_date")
    .eq("location_id", locationId)
    .is("cancelled_date", null)
    .lte("start_date", `${date}T23:59:59`)
    .gte("end_date", `${date}T00:00:00`)
    .order("start_date", { ascending: true });

  if (error) throw error;

  return (data || []).filter((reservation: any) => {
    const category = classifyReservationCategory(reservation?.reservation_type_name || "");
    if (kind === "feeding-report") {
      return category === "boarding" && String(reservation?.start_date || "").slice(0, 10) < date;
    }
    return ["boarding", "daycare", "day boarding", "evaluation"].includes(category);
  });
}

async function fetchWorkflowAuditData(
  sb: any,
  locationId: string,
  date: string,
  report: string,
) {
  const config = WORKFLOW_AUDIT_CONFIG[report];
  if (!config) {
    throw new Error(`Unsupported report type: ${report}`);
  }

  const [credentials, candidateReservations, appEntry] = await Promise.all([
    fetchGingrConfig(sb, locationId),
    fetchWorkflowCandidateReservations(sb, locationId, date, config.kind),
    sb
      .from("lite_daily_ops")
      .select("computed_items")
      .eq("id", `ops_${config.typeSub}_${date}`)
      .maybeSingle(),
  ]);
  const cookies = await gingrWebLogin(credentials.subdomain, credentials.apiKey);
  const auditErrors: string[] = [];
  const liveRows = (await mapInBatches(candidateReservations, 8, async (reservation: any) => {
    try {
      const reservationId = String(reservation?.gingr_id || "").trim();
      const animalId = String(reservation?.animal_gingr_id || "").trim();
      const reservationDetail = reservationId
        ? await fetchReservationViewJson(credentials.subdomain, cookies, reservationId)
        : null;

      let feedingItems = buildBrowserFeedingItems(
        reservationDetail?.feeding_report || reservationDetail?.feedingReport || reservationDetail?.feeding_info || reservationDetail?.feedingInfo,
      );
      let medicationItems = buildBrowserMedicationItems(
        reservationDetail?.medication_report || reservationDetail?.medicationReport || reservationDetail?.medication_info || reservationDetail?.medicationInfo,
      );

      if ((feedingItems.length === 0 || medicationItems.length === 0) && animalId) {
        const animalDetail = await fetchAnimalViewJson(credentials.subdomain, cookies, animalId);
        if (feedingItems.length === 0) {
          feedingItems = buildBrowserFeedingItems(animalDetail?.feeding_info || animalDetail?.feedingInfo);
        }
        if (medicationItems.length === 0) {
          medicationItems = buildBrowserMedicationItems(animalDetail?.medication_info || animalDetail?.medicationInfo);
        }
      }

      if (config.session) {
        feedingItems = feedingItems.filter((row: any) => matchesWorkflowSession(row, config.session!, "feeding"));
        medicationItems = medicationItems.filter((row: any) => matchesWorkflowSession(row, config.session!, "medication"));
      }

      const ownerLastName = normalizeText(
        reservation?.owner_last_name ||
        reservationDetail?.owner_last_name ||
        reservationDetail?.owner?.last_name,
      );

      return {
        reservationId,
        animalGingrId: animalId || String(reservationDetail?.a_id || reservationDetail?.animal?.id || "").trim(),
        dogName: normalizeText(reservation?.animal_name || reservationDetail?.animal_name || reservationDetail?.animal?.name) || "Dog",
        ownerInitial: `${ownerLastName.charAt(0).toUpperCase() || ""}.`,
        feedingItems,
        medicationItems,
      };
    } catch (error: any) {
      auditErrors.push(
        `${reservation?.animal_name || "Dog"} (${reservation?.gingr_id || "unknown reservation"}): ${error?.message || "Browser audit fetch failed."}`,
      );
      return null;
    }
  }))
    .filter(Boolean)
    .filter((row: any) => {
      if (config.kind === "feeding-report") return row.feedingItems.length > 0;
      return row.feedingItems.length > 0 || row.medicationItems.length > 0;
    });

  const appRows = Array.isArray(appEntry.data?.computed_items?.rows) ? appEntry.data.computed_items.rows : [];
  return {
    config,
    appRows,
    liveRows,
    auditSource: "gingr_browser_reservation_view_json",
    auditErrors,
    browserCandidateCount: candidateReservations.length,
  };
}

function compareWorkflowRows(appRows: any[], liveRows: any[]) {
  const appByKey = new Map(appRows.map((row) => [workflowDogKey(row), row]));
  const liveByKey = new Map(liveRows.map((row) => [workflowDogKey(row), row]));

  const details: any[] = [];
  const missingFromApp: string[] = [];
  const missingFromGingr: string[] = [];
  let matched = 0;
  let mismatched = 0;

  for (const liveRow of liveRows) {
    const key = workflowDogKey(liveRow);
    const appRow = appByKey.get(key);
    const liveLabel = `${liveRow.dogName} ${liveRow.ownerInitial || ""}`.trim();
    if (!appRow) {
      missingFromApp.push(liveLabel);
      details.push({
        dog: liveLabel,
        status: "missing_from_app",
        app: null,
        gingr: {
          feeding_items: liveRow.feedingItems.map(normalizeInstructionLabel),
          medication_items: liveRow.medicationItems.map(normalizeInstructionLabel),
        },
        differences: ["Dog exists in live Gingr detail but is missing from the app report."],
      });
      continue;
    }

    const appFeeding = (appRow.feedingItems || []).map(normalizeInstructionLabel).filter(Boolean).sort();
    const appMedication = (appRow.medicationItems || []).map(normalizeInstructionLabel).filter(Boolean).sort();
    const liveFeeding = (liveRow.feedingItems || []).map(normalizeInstructionLabel).filter(Boolean).sort();
    const liveMedication = (liveRow.medicationItems || []).map(normalizeInstructionLabel).filter(Boolean).sort();

    const differences: string[] = [];
    if (JSON.stringify(appFeeding) !== JSON.stringify(liveFeeding)) {
      differences.push("Feeding instructions differ.");
    }
    if (JSON.stringify(appMedication) !== JSON.stringify(liveMedication)) {
      differences.push("Medication instructions differ.");
    }

    if (differences.length === 0) {
      matched += 1;
      details.push({
        dog: liveLabel,
        status: "match",
        app: { feeding_items: appFeeding, medication_items: appMedication },
        gingr: { feeding_items: liveFeeding, medication_items: liveMedication },
        differences: [],
      });
    } else {
      mismatched += 1;
      details.push({
        dog: liveLabel,
        status: "mismatch",
        app: { feeding_items: appFeeding, medication_items: appMedication },
        gingr: { feeding_items: liveFeeding, medication_items: liveMedication },
        differences,
      });
    }
  }

  for (const appRow of appRows) {
    const key = workflowDogKey(appRow);
    if (liveByKey.has(key)) continue;
    const label = `${appRow.dogName || appRow.animalName || "Dog"} ${appRow.ownerInitial || ""}`.trim();
    missingFromGingr.push(label);
    details.push({
      dog: label,
      status: "missing_from_gingr",
      app: {
        feeding_items: (appRow.feedingItems || []).map(normalizeInstructionLabel).filter(Boolean),
        medication_items: (appRow.medicationItems || []).map(normalizeInstructionLabel).filter(Boolean),
      },
      gingr: null,
      differences: ["Dog exists in the app report but was not returned by the live Gingr audit fetch."],
    });
  }

  return {
    matched,
    mismatched,
    missing_from_app: missingFromApp,
    missing_from_gingr: missingFromGingr,
    details,
  };
}

// ─── Main handler ─────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { date, report, location_id } = body;

    if (!date || !report || !location_id) {
      return new Response(
        JSON.stringify({ error: "date, report, and location_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return new Response(
        JSON.stringify({ error: "date must be YYYY-MM-DD format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseServiceKey);
    const startTime = Date.now();

    if (report !== "bathing" && !WORKFLOW_AUDIT_CONFIG[report]) {
      return new Response(
        JSON.stringify({ error: `Unsupported report type: ${report}. Supported: bathing, ${Object.keys(WORKFLOW_AUDIT_CONFIG).join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (WORKFLOW_AUDIT_CONFIG[report]) {
      const { config, appRows, liveRows, auditSource, auditErrors, browserCandidateCount } = await fetchWorkflowAuditData(sb, location_id, date, report);
      const comparison = compareWorkflowRows(appRows, liveRows);
      const duration = Date.now() - startTime;
      const hasMissing = comparison.missing_from_app.length > 0 || comparison.missing_from_gingr.length > 0;
      const hasSourceErrors = auditErrors.length > 0 || liveRows.length !== browserCandidateCount;
      const status = hasMissing || hasSourceErrors
        ? "FAIL"
        : comparison.mismatched > 0
          ? "WARNING"
          : "PASS";

      return new Response(
        JSON.stringify({
          status,
          date,
          report,
          report_label: config.label,
          duration_ms: duration,
          audit_source: auditSource,
          browser_candidate_count: browserCandidateCount,
          source_errors: auditErrors,
          audited_at: new Date().toISOString(),
          app_scheduled: {
            count: appRows.length,
            dogs: appRows.map((row: any) => ({
              reservationId: row.reservationId,
              animalGingrId: row.animalGingrId,
              animalName: row.dogName,
              feeding_items: (row.feedingItems || []).map(normalizeInstructionLabel).filter(Boolean),
              medication_items: (row.medicationItems || []).map(normalizeInstructionLabel).filter(Boolean),
            })),
          },
          gingr_scheduled: {
            count: liveRows.length,
            dogs: liveRows.map((row: any) => ({
              reservationId: row.reservationId,
              animalGingrId: row.animalGingrId,
              animalName: row.dogName,
              feeding_items: (row.feedingItems || []).map(normalizeInstructionLabel).filter(Boolean),
              medication_items: (row.medicationItems || []).map(normalizeInstructionLabel).filter(Boolean),
            })),
          },
          comparison: {
            matched: comparison.matched,
            mismatched: comparison.mismatched,
            missing_from_app: comparison.missing_from_app,
            missing_from_gingr: comparison.missing_from_gingr,
          },
          details: comparison.details,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fetch both datasets in parallel
    // fetchGingrGroundTruth now also returns allRes for Fresh n Clean / Suggested detection
    const [appDogs, { bathDogs: gingrDogs, allRes }] = await Promise.all([
      fetchAppBathingData(sb, location_id, date),
      fetchGingrGroundTruth(sb, location_id, date),
    ]);

    // Build set of Gingr reservation IDs that already have baths
    const gingrBathResIds = new Set(gingrDogs.map(d => d.gingrReservationId));

    // Detect app-generated dogs
    const freshNCleanDogs = detectFreshNClean(appDogs, allRes, gingrBathResIds, date);
    const suggestedDogs = detectSuggested(appDogs, allRes, gingrBathResIds, date);

    // Compare scheduled dogs only (icons-based)
    const comparison = compareBathingData(appDogs, gingrDogs);
    const manualDogs: ManualOverrideDog[] = appDogs
      .filter((d: any) => d.status === "manual")
      .map((d: any) => ({
        name: dogKey(d.animalName, (d.ownerName || "").split(" ").pop() || ""),
        bathType: d.bathType || "Standard",
        note: d.serviceNotes || d.statusContext?.message || "",
      }));

    const duration = Date.now() - startTime;

    // Scheduled app dogs (exclude Fresh n Clean and suggested)
    const scheduledAppDogs = appDogs.filter((d: any) => d.status === "scheduled" && !d.isFreshNClean);

    // Status logic:
    // "pass" = all Gingr dogs matched AND all app-generated dogs have valid criteria
    // "warning" = minor differences
    // "fail" = dogs missing from either side, or app-generated dogs with invalid criteria
    const allFncValid = freshNCleanDogs.every(d => d.valid);
    const allSuggestedValid = suggestedDogs.every(d => d.valid);
    const hasMissing = comparison.missing_from_app.length > 0 || comparison.missing_from_gingr.length > 0;
    const hasInvalidGenerated = !allFncValid || !allSuggestedValid;

    let status: "pass" | "fail" | "warning" = "pass";
    if (hasMissing || hasInvalidGenerated) {
      status = "fail";
    } else if (comparison.mismatched > 0) {
      status = comparison.icon_mismatches.length > 0 ? "fail" : "warning";
    }

    return new Response(
      JSON.stringify({
        status,
        date,
        report,
        report_label: "Bathing",
        duration_ms: duration,
        audit_source: "gingr_synced_reservations_plus_service_context",
        audited_at: new Date().toISOString(),
        gingr_scheduled: {
          count: gingrDogs.length,
          dogs: gingrDogs.map((d) => ({
            animalName: d.animalName,
            icons: d.bathAddons || [],
            modifiers: d.bathModifiers || [],
            reservationType: d.reservationType,
          })),
        },
        app_scheduled: {
          count: scheduledAppDogs.length,
          dogs: scheduledAppDogs.map((d: any) => ({
            animalName: d.animalName,
            icons: d.bathIcons || [],
            modifiers: d.bathModifiers || [],
            status: d.status,
          })),
        },
        app_generated: {
          fresh_n_clean: {
            count: freshNCleanDogs.length,
            dogs: freshNCleanDogs,
          },
          manual: {
            count: manualDogs.length,
            dogs: manualDogs,
          },
          suggested: {
            count: suggestedDogs.length,
            dogs: suggestedDogs,
          },
        },
        comparison: {
          matched: comparison.matched,
          mismatched: comparison.mismatched,
          missing_from_app: comparison.missing_from_app,
          missing_from_gingr: comparison.missing_from_gingr,
          icon_mismatches: comparison.icon_mismatches,
        },
        details: comparison.details,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("ops-audit error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

// ============================================================================
// Ops Audit — K9 Operations
// Compares app-computed data against Gingr source data for validation.
// Currently supports: bathing report audit.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    // Find bath services — service_id 2 (Bath) or name containing "bath"
    let bathSvc: any = null;
    bathSvc = rawSvcs.find((s: any) => typeof s === "object" && (s?.service_id === 2 || s?.service_id === "2"));
    if (!bathSvc) {
      bathSvc = rawSvcs.find((s: any) => typeof s === "object" && s?.name?.toLowerCase().includes("bath"));
    }
    if (!bathSvc) {
      bathSvc = topSvcs.find((s: any) => typeof s === "object" && s?.name?.toLowerCase().includes("bath"));
    }

    const hasBathTop = topSvcs.some((s: any) => {
      const n = typeof s === "string" ? s : s?.name || "";
      return n.toLowerCase().includes("bath");
    });
    if (!bathSvc && !hasBathTop) continue;

    const scheduledAt = bathSvc?.scheduled_at || "";
    const isScheduledToday = scheduledAt.includes(targetDate);
    const endDate = r.end_date || "";
    const isDepartingToday = endDate.includes(targetDate);
    if (!isScheduledToday && !isDepartingToday) continue;

    const animalGingrId = String(r.animal_gingr_id || rd.animal?.id || "").trim();
    if (animalGingrId) animalIds.push(animalGingrId);

    const svcsForAddons = rawSvcs.length > 0 ? rawSvcs : topSvcs;
    const addonNames: string[] = [];
    const modifiers: string[] = [];
    for (const svc of svcsForAddons) {
      const n = typeof svc === "string" ? svc : svc?.name || "";
      if (!n || n.toLowerCase().includes("bath")) continue;
      // Classify as modifier or addon
      const MODIFIER_SET = new Set(["NO CRATE DRYER", "NO VELOCITY DRYER", "TOWEL DRY ONLY", "*See account notes*"]);
      if (MODIFIER_SET.has(n)) modifiers.push(n);
      else addonNames.push(n);
    }

    const resType = rd.reservation_type || {};

    bathDogs.push({
      animalName: r.animal_name || rd.animal?.name || "Unknown",
      animalGingrId,
      ownerFirstName: r.owner_first_name || rd.owner?.first_name || "",
      ownerLastName: r.owner_last_name || rd.owner?.last_name || "",
      gingrReservationId: String(r.gingr_id || ""),
      bathServiceName: bathSvc?.name || "",
      bathType: "Standard", // not used for comparison anymore
      bathAddons: addonNames,
      bathModifiers: modifiers,
      scheduledAt,
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
        dog.bathAddons = iconMap[dog.animalGingrId].filter(Boolean);
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

    if (res) {
      const startDate = res.start_date || "";
      const endDate = res.end_date || "";
      nights = daysBetween(startDate, endDate);

      const rd = res.raw_data || {};
      const rawSvcs = rd.services || [];
      const topSvcs = Array.isArray(res.services) ? res.services : [];
      hasBath = [...rawSvcs, ...topSvcs].some((s: any) => {
        const n = typeof s === "string" ? s : s?.name || "";
        return n.toLowerCase().includes("bath") || n.toLowerCase().includes("groom");
      });
    }

    const endDay = (res?.end_date || "").split("T")[0];
    const ownerLast = (d.ownerName || "").split(" ").pop() || "";
    return {
      name: dogKey(d.animalName, ownerLast),
      nights,
      has_bath: hasBath,
      valid: endDay === targetDate && nights >= 2 && !hasBath,
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

    const rtName = (r.reservation_type_name || "").toLowerCase();
    if (!rtName.includes("boarding")) continue;
    if (rtName.includes("day boarding")) continue;

    const startDate = r.start_date || "";
    const endDate = r.end_date || "";
    const endDay = endDate.split("T")[0];
    if (endDay !== targetDate) continue;

    const nights = daysBetween(startDate, endDate);
    if (nights < 2) continue;

    const rd = r.raw_data || {};
    const rawSvcs = rd.services || [];
    const topSvcs = Array.isArray(r.services) ? r.services : [];
    const hasBathOrGroom = [...rawSvcs, ...topSvcs].some((s: any) => {
      const n = typeof s === "string" ? s : s?.name || "";
      return n.toLowerCase().includes("bath") || n.toLowerCase().includes("groom");
    });
    if (hasBathOrGroom) continue;

    const ownerLast = r.owner_last_name || rd.owner?.last_name || "";
    const animalName = r.animal_name || rd.animal?.name || "Unknown";

    results.push({
      name: dogKey(animalName, ownerLast),
      nights,
      has_bath: false,
      valid: true,
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

    if (report !== "bathing") {
      return new Response(
        JSON.stringify({ error: `Unsupported report type: ${report}. Supported: bathing` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseServiceKey);
    const startTime = Date.now();

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
        duration_ms: duration,
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

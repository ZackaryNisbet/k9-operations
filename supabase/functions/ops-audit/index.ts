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

// ─── Bath type resolution (mirrors ops-compute-ondemand) ──────────────────

const BATH_TYPE_ADDONS = new Set([
  "Premium", "Medicated", "Whitening", "Shampoo From Home",
  "Hypoallergenic - NO SPRAY", "Hypoallergenic - WITH SPRAY",
]);

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
      for (const t of BATH_TYPE_ADDONS) { if (n.toLowerCase() === t.toLowerCase()) { if (!addonType) addonType = t; break; } }
      for (const m of BATH_MODIFIER_ADDONS) { if (n.toLowerCase() === m.toLowerCase()) { modifiers.push(m); break; } }
    }
  }
  return { addonType, modifiers };
}

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

// Create a display key: "AnimalName O." (first letter of owner last name)
function dogKey(animalName: string, ownerLastName: string): string {
  const name = (animalName || "").trim();
  const initial = (ownerLastName || "").trim().charAt(0).toUpperCase();
  return initial ? `${name} ${initial}.` : name;
}

// ─── Fetch app bathing data from lite_daily_ops ───────────────────────────

async function fetchAppBathingData(
  sb: any,
  locationId: string,
  targetDate: string,
): Promise<any[]> {
  // First try cached computed_items from lite_daily_ops
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

  // Fallback: call ops-compute-ondemand via internal Supabase function invoke
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
): Promise<GingrBathDog[]> {
  const nextDay = addDays(targetDate, 1);
  const resSelect = "gingr_id, animal_gingr_id, animal_name, owner_first_name, owner_last_name, reservation_type_name, start_date, end_date, check_in_date, check_out_date, cancelled_date, raw_data, services";

  // Fetch all reservations spanning the target date (same filters as ops-compute-ondemand)
  const [{ data: activeRes }, { data: coRes }, { data: pendingRes }] = await Promise.all([
    // Active: checked in, not checked out, not cancelled, spans target date
    sb.from("gingr_reservations").select(resSelect)
      .eq("location_id", locationId)
      .not("check_in_date", "is", null).is("check_out_date", null).is("cancelled_date", null)
      .lte("start_date", `${targetDate}T23:59:59`).gte("end_date", `${targetDate}T00:00:00`),
    // Checked out today
    sb.from("gingr_reservations").select(resSelect)
      .eq("location_id", locationId)
      .not("check_out_date", "is", null).is("cancelled_date", null)
      .gte("check_out_date", targetDate + "T00:00:00").lt("check_out_date", nextDay + "T00:00:00"),
    // Pending: starts today, not checked in yet
    sb.from("gingr_reservations").select(resSelect)
      .eq("location_id", locationId)
      .is("check_in_date", null).is("check_out_date", null).is("cancelled_date", null)
      .gte("start_date", `${targetDate}T00:00:00`).lt("start_date", nextDay + "T00:00:00"),
  ]);

  // Deduplicate
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

    // Find bath services — look for service_id 2 (Bath) or name containing "bath"
    const allSvcs = [...rawSvcs, ...topSvcs];
    let bathSvc: any = null;

    // Primary: find by service_id 2
    bathSvc = rawSvcs.find((s: any) => typeof s === "object" && (s?.service_id === 2 || s?.service_id === "2"));
    // Fallback: find by name
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

    // Check scheduled_at matches target date
    const scheduledAt = bathSvc?.scheduled_at || "";
    const isScheduledToday = scheduledAt.includes(targetDate);
    const endDate = r.end_date || "";
    const isDepartingToday = endDate.includes(targetDate);
    if (!isScheduledToday && !isDepartingToday) continue;

    const animalGingrId = String(r.animal_gingr_id || rd.animal?.id || "").trim();
    if (animalGingrId) animalIds.push(animalGingrId);

    // Extract bath type and addons from all services on this reservation
    const svcsForAddons = rawSvcs.length > 0 ? rawSvcs : topSvcs;
    const { addonType, modifiers } = parseBathAddonsFromServices(svcsForAddons);

    // Collect all addon service names for this reservation
    const addonNames: string[] = [];
    for (const svc of svcsForAddons) {
      const n = typeof svc === "string" ? svc : svc?.name || "";
      if (n && !n.toLowerCase().includes("bath")) {
        addonNames.push(n);
      }
    }

    const bathType = addonType || extractBathTypeFromName(bathSvc?.name || "") || "Standard";
    const resType = rd.reservation_type || {};

    bathDogs.push({
      animalName: r.animal_name || rd.animal?.name || "Unknown",
      animalGingrId,
      ownerFirstName: r.owner_first_name || rd.owner?.first_name || "",
      ownerLastName: r.owner_last_name || rd.owner?.last_name || "",
      gingrReservationId: String(r.gingr_id || ""),
      bathServiceName: bathSvc?.name || "",
      bathType,
      bathAddons: addonNames,
      bathModifiers: modifiers,
      scheduledAt,
      reservationType: resType.type || r.reservation_type_name || "",
    });
  }

  // Fetch bath icons from gingr_animal_icons_live for ground truth icon comparison
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

    // Attach icons to each bath dog
    for (const dog of bathDogs) {
      if (iconMap[dog.animalGingrId]) {
        dog.bathAddons = iconMap[dog.animalGingrId].filter(Boolean);
      }
    }
  }

  return bathDogs;
}

// ─── Compare app data vs Gingr ground truth ───────────────────────────────

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
  // Filter out suggested dogs from app — only compare scheduled baths
  const scheduledAppDogs = appDogs.filter(d => d.status === "scheduled");

  // Build lookup maps keyed by animalGingrId
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

  // Also build fallback maps by normalized name for matching when IDs differ
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
  const bathTypeMismatches: Array<{ dog: string; app_type: string; gingr_type: string }> = [];

  // Compare each Gingr dog against app data
  for (const gingrDog of gingrDogs) {
    const gId = gingrDog.animalGingrId;
    const gName = normalizeName(gingrDog.animalName);
    const displayName = dogKey(gingrDog.animalName, gingrDog.ownerLastName);

    // Find matching app dog by ID first, then by name
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
          bathType: gingrDog.bathType,
          icons: gingrDog.bathAddons,
          modifiers: gingrDog.bathModifiers,
          reservationType: gingrDog.reservationType,
        },
      });
      continue;
    }

    // Mark as matched
    matchedAppIds.add(appDog.animalGingrId || normalizeName(appDog.animalName));
    matchedGingrIds.add(gId || gName);

    // Compare bath type
    const appBathType = (appDog.bathType || "Standard").trim();
    const gingrBathType = (gingrDog.bathType || "Standard").trim();
    const bathTypeMatch = appBathType.toLowerCase() === gingrBathType.toLowerCase();

    // Compare icons
    const appIcons = normalizeIcons(appDog.bathIcons || []);
    const gingrIcons = normalizeIcons(gingrDog.bathAddons || []);
    const iconsMatch = JSON.stringify(appIcons) === JSON.stringify(gingrIcons);

    // Compare modifiers
    const appModifiers = normalizeIcons(appDog.bathModifiers || []);
    const gingrModifiers = normalizeIcons(gingrDog.bathModifiers || []);
    const modifiersMatch = JSON.stringify(appModifiers) === JSON.stringify(gingrModifiers);

    const isFullMatch = bathTypeMatch && iconsMatch && modifiersMatch;

    if (isFullMatch) {
      matched++;
      details.push({
        dog: displayName,
        status: "match",
        app: {
          animalName: appDog.animalName,
          bathType: appBathType,
          icons: appDog.bathIcons || [],
          modifiers: appDog.bathModifiers || [],
        },
        gingr: {
          animalName: gingrDog.animalName,
          bathType: gingrBathType,
          icons: gingrDog.bathAddons || [],
          modifiers: gingrDog.bathModifiers || [],
        },
      });
    } else {
      mismatched++;
      const mismatchFields: string[] = [];
      if (!bathTypeMatch) {
        mismatchFields.push("bathType");
        bathTypeMismatches.push({
          dog: displayName,
          app_type: appBathType,
          gingr_type: gingrBathType,
        });
      }
      if (!iconsMatch) {
        mismatchFields.push("icons");
        iconMismatches.push({
          dog: displayName,
          app_icons: appDog.bathIcons || [],
          gingr_icons: gingrDog.bathAddons || [],
        });
      }
      if (!modifiersMatch) mismatchFields.push("modifiers");

      details.push({
        dog: displayName,
        status: "mismatch",
        field: mismatchFields.join(", "),
        app: {
          animalName: appDog.animalName,
          bathType: appBathType,
          icons: appDog.bathIcons || [],
          modifiers: appDog.bathModifiers || [],
        },
        gingr: {
          animalName: gingrDog.animalName,
          bathType: gingrBathType,
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

    // Check if there's a Gingr dog by name we haven't matched
    if (gingrByName[aName] && !matchedGingrIds.has(gingrByName[aName].animalGingrId) && !matchedGingrIds.has(aName)) continue;

    const displayName = dogKey(appDog.animalName, (appDog.ownerName || "").split(" ").pop() || "");
    missingFromGingr.push(displayName);
    details.push({
      dog: displayName,
      status: "missing_from_gingr",
      app: {
        animalName: appDog.animalName,
        bathType: appDog.bathType || "Standard",
        icons: appDog.bathIcons || [],
        modifiers: appDog.bathModifiers || [],
      },
      gingr: null,
    });
  }

  // Determine overall status
  let status: "pass" | "fail" | "warning" = "pass";
  if (missingFromApp.length > 0 || missingFromGingr.length > 0) {
    status = "fail";
  } else if (mismatched > 0) {
    status = iconMismatches.length > 0 || bathTypeMismatches.length > 0 ? "fail" : "warning";
  }

  return {
    status,
    matched,
    mismatched,
    missing_from_app: missingFromApp,
    missing_from_gingr: missingFromGingr,
    icon_mismatches: iconMismatches,
    bath_type_mismatches: bathTypeMismatches,
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
    const [appDogs, gingrDogs] = await Promise.all([
      fetchAppBathingData(sb, location_id, date),
      fetchGingrGroundTruth(sb, location_id, date),
    ]);

    // Compare
    const comparison = compareBathingData(appDogs, gingrDogs);

    const duration = Date.now() - startTime;

    // Filter app dogs to scheduled only for count
    const scheduledAppDogs = appDogs.filter((d: any) => d.status === "scheduled");

    return new Response(
      JSON.stringify({
        status: comparison.status,
        date,
        report,
        duration_ms: duration,
        app: {
          count: scheduledAppDogs.length,
          dogs: scheduledAppDogs.map((d: any) => ({
            animalName: d.animalName,
            bathType: d.bathType || "Standard",
            icons: d.bathIcons || [],
            modifiers: d.bathModifiers || [],
            status: d.status,
          })),
        },
        gingr: {
          count: gingrDogs.length,
          dogs: gingrDogs.map((d) => ({
            animalName: d.animalName,
            bathType: d.bathType,
            icons: d.bathAddons || [],
            modifiers: d.bathModifiers || [],
            reservationType: d.reservationType,
          })),
        },
        comparison: {
          matched: comparison.matched,
          mismatched: comparison.mismatched,
          missing_from_app: comparison.missing_from_app,
          missing_from_gingr: comparison.missing_from_gingr,
          icon_mismatches: comparison.icon_mismatches,
          bath_type_mismatches: comparison.bath_type_mismatches,
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

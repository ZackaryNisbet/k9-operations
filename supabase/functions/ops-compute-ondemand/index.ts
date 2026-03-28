// ============================================================================
// Ops Compute On-Demand — K9 Operations Lite
// Lightweight edge function that computes bathing + pamper + enrichment +
// private play for a specific date on-demand. No room cleaning, no checklists,
// no Gingr web auth. Caches results in lite_daily_ops.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

  const [{ data: activeRes }, { data: pendingRes }] = await Promise.all([
    supabase.from("gingr_reservations").select(resSelect)
      .eq("location_id", locationId)
      .not("check_in_date", "is", null).is("check_out_date", null).is("cancelled_date", null)
      .lte("start_date", `${targetDate}T23:59:59`).gte("end_date", `${targetDate}T00:00:00`),
    supabase.from("gingr_reservations").select(resSelect)
      .eq("location_id", locationId)
      .is("check_in_date", null).is("check_out_date", null).is("cancelled_date", null)
      .gte("start_date", `${targetDate}T00:00:00`).lt("start_date", nextDay + "T00:00:00"),
  ]);

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
    };
  }
  return result;
}

// ─── Compute bathing report (no Gingr web auth) ──────────────────────────

async function computeBathingReport(supabase: any, locationId: string, targetDate: string): Promise<any> {
  const nextDay = addDays(targetDate, 1);
  const resSelect = "gingr_id, animal_gingr_id, animal_name, owner_first_name, owner_last_name, reservation_type_name, start_date, end_date, check_out_date, raw_data, room_assignment, services, notes_reservation, notes_animal, notes_owner";

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
  const animalIds: string[] = [];

  for (const r of allRes) {
    const rd = r.raw_data || {};
    const rawSvcs = rd.services || [];
    const topSvcs = Array.isArray(r.services) ? r.services : [];

    let bathSvc = rawSvcs.find((s: any) => typeof s === "object" && s?.name?.toLowerCase().includes("bath"));
    if (!bathSvc) {
      bathSvc = topSvcs.find((s: any) => typeof s === "object" && s?.name?.toLowerCase().includes("bath"));
    }
    const hasBathTop = topSvcs.some((s: any) => { const n = typeof s === "string" ? s : s?.name || ""; return n.toLowerCase().includes("bath"); });
    if (!bathSvc && !hasBathTop) continue;

    const scheduledAt = bathSvc?.scheduled_at || "";
    const isScheduledToday = scheduledAt.includes(targetDate);
    const endDate = r.end_date || "";
    const isDepartingToday = endDate.includes(targetDate);
    if (!isScheduledToday && !isDepartingToday) continue;

    const animalGingrId = String(r.animal_gingr_id || rd.animal?.id || "").trim();
    if (animalGingrId) animalIds.push(animalGingrId);

    const svcsForAddons = rawSvcs.length > 0 ? rawSvcs : topSvcs;
    const { addonType, modifiers } = parseBathAddonsFromServices(svcsForAddons);
    const resType = rd.reservation_type || {};
    const roomLabel = r.room_assignment || rd.run?.name || "";

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

  // Fetch bath icons, play icons, and weights
  let iconMap: Record<string, { title: string; comment: string }> = {};
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

  // Resolve bath type: icon -> add-on -> service name -> Standard
  const dogs = bathDogs.map((d) => {
    const icon = iconMap[d.animalGingrId];
    const bathType = icon?.title || d.addonType || extractBathTypeFromName(d.bathServiceName) || "Standard";
    const weight = weightMap[d.animalGingrId] ?? null;
    const sizeCategory = weight != null ? (weight < 30 ? "small" : "large") : null;
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
    };
  });

  dogs.sort((a, b) => (a.scheduledAt || "").localeCompare(b.scheduledAt || ""));

  // Fetch bath completions
  const completionKey = `ops_bathing_${targetDate}`;
  const { data: completionRows } = await supabase
    .from("lite_settings")
    .select("setting_value")
    .eq("location_id", locationId)
    .eq("setting_key", completionKey)
    .limit(1);
  const completions: Record<string, { by: string; at: string }> = (completionRows && completionRows.length > 0 && completionRows[0].setting_value) ? completionRows[0].setting_value : {};

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

// ─── Compute service report (pamper, enrichment) ──────────────────────────

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

    const [bathing, pamper, enrichment] = await Promise.all([
      computeBathingReport(sb, locationId, date),
      Promise.resolve(computeServiceReport(reservations, "pamper")),
      Promise.resolve(computeServiceReport(reservations, "enrichment")),
    ]);
    const privatePlay = computePrivatePlay(reservations);

    // Upsert results into lite_daily_ops so subsequent requests are cached
    await Promise.allSettled([
      upsertComputedItems(sb, `ops_bathing_${date}`, locationId, "bathing", "bathing", date, bathing),
      upsertComputedItems(sb, `ops_pp_${date}`, locationId, "pp", "pp", date, privatePlay),
      upsertComputedItems(sb, `ops_pamper_${date}`, locationId, "pamper", "pamper", date, pamper),
      upsertComputedItems(sb, `ops_svc_${date}`, locationId, "svc", "svc", date, enrichment),
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

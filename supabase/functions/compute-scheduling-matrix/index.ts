// ============================================================================
// Compute Scheduling Matrix — K9 Operations
//
// Computes scheduling_matrix_daily rows for a rolling date range.
// Sources: dashboard_metrics_daily, gingr_reservations, gingr_reservation_types,
//          v_dog_playgroups, gingr_animal_icons_live, gingr_room_occupancy,
//          lite_daily_ops (bathing), gingr_animals (feeding/meds heuristic)
//
// Designed to be called:
//   1. By gingr-sync post-sync callback
//   2. On-demand from the scheduling UI
//
// Inputs (JSON body):
//   location_id  — required
//   date_from    — optional, defaults to today (ET)
//   date_to      — optional, defaults to date_from + 7
//   force        — optional, recompute even if fresh
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function nowET(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
}
function dateStrET(d?: Date): string {
  const dt = d || nowET();
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}
function addDaysStr(d: string, n: number): string {
  const dt = new Date(d + "T12:00:00");
  dt.setDate(dt.getDate() + n);
  return dt.toISOString().split("T")[0];
}

// ─── Reservation classification (mirrors opsHelpers.js canonical logic) ───
function classifyReservationType(
  typeName: string,
  typeRow?: { is_boarding?: boolean; is_daycare?: boolean; single_day?: boolean }
): string {
  const n = (typeName || "").toLowerCase();
  if (n.includes("eval")) return "evaluation";
  if (n.includes("tour")) return "tour";
  if (typeRow?.is_daycare || n.includes("daycare") || n.includes("day care")) return "daycare";
  if (n.includes("day boarding") || n.includes("day board")) return "dayboarding";
  if (typeRow?.is_boarding || n.includes("boarding") || n.includes("lodge") || n.includes("kennel")) return "boarding";
  if (n.includes("groom") || n.includes("bath")) return "grooming";
  return "other";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json().catch(() => ({}));
    const locationId = body.location_id;
    if (!locationId) {
      return new Response(JSON.stringify({ error: "location_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const dateFrom = body.date_from || dateStrET();
    const dateTo = body.date_to || addDaysStr(dateFrom, 7);

    // ── Load reference data ───────────────────────────────────────────
    const [resTypesRes, dashMetricsRes, playRes, iconsRes, roomOccRes] = await Promise.all([
      supabase.from("gingr_reservation_types").select("*").eq("location_id", locationId),
      supabase.from("dashboard_metrics_daily").select("*")
        .eq("location_id", locationId)
        .gte("metric_date", dateFrom).lte("metric_date", dateTo),
      supabase.from("v_dog_playgroups").select("*").eq("location_id", locationId),
      supabase.from("gingr_animal_icons_live").select("*").eq("location_id", locationId),
      supabase.from("gingr_occupancy_snapshot").select("*")
        .eq("location_id", locationId)
        .gte("snapshot_date", dateFrom).lte("snapshot_date", dateTo),
    ]);

    const resTypes = resTypesRes.data || [];
    const dashMetrics = dashMetricsRes.data || [];
    const playgroups = playRes.data || [];
    const icons = iconsRes.data || [];
    const roomOcc = roomOccRes.data || [];

    // Build playgroup lookup: animal_gingr_id → { playgroup, size }
    const playgroupMap = new Map<string, string>();
    for (const pg of playgroups) {
      playgroupMap.set(String(pg.animal_gingr_id), pg.playgroup);
    }

    // Build icon lookup for PP detection
    const ppAnimalIds = new Set<string>();
    for (const icon of icons) {
      if (icon.icon_group === "Play" && (icon.icon_title || "").toLowerCase().includes("private")) {
        ppAnimalIds.add(String(icon.animal_gingr_id));
      }
    }

    // ── Load reservations for date range ──────────────────────────────
    const { data: reservations } = await supabase
      .from("gingr_reservations")
      .select("animal_gingr_id, reservation_type_name, start_date, end_date, check_in_date, check_out_date, cancelled_date, services")
      .eq("location_id", locationId)
      .is("cancelled_date", null)
      .or(`start_date.lte.${dateTo},end_date.gte.${dateFrom}`);

    const allRes = reservations || [];

    // ── Load lite_daily_ops for bathing reports ───────────────────────
    const { data: opsRows } = await supabase
      .from("lite_daily_ops")
      .select("date, type, type_sub, computed_items")
      .eq("location_id", locationId)
      .eq("type", "ops")
      .gte("date", dateFrom).lte("date", dateTo);

    const opsMap = new Map<string, any>();
    for (const row of (opsRows || [])) {
      const key = `${row.date}_${row.type_sub}`;
      opsMap.set(key, row);
    }

    // ── Compute matrix for each date ─────────────────────────────────
    const results: any[] = [];
    let currentDate = dateFrom;
    while (currentDate <= dateTo) {
      const dashRow = dashMetrics.find((r: any) => r.metric_date === currentDate);

      // Filter reservations active on this date
      const activeRes = allRes.filter((r: any) => {
        const start = (r.start_date || "").slice(0, 10);
        const end = (r.end_date || "").slice(0, 10);
        return start <= currentDate && end >= currentDate;
      });

      // Classify each reservation
      let boardingLarge = 0, boardingSmall = 0, boardingUnknown = 0;
      let daycareLarge = 0, daycareSmall = 0, daycareUnknown = 0;
      let ppDayboarders = 0, ppOvernightBoarders = 0;
      let feedingDogs = 0, medicationDogs = 0;

      const resTypeMap = new Map<string, any>();
      for (const rt of resTypes) {
        resTypeMap.set(rt.name, rt);
      }

      for (const res of activeRes) {
        const typeRow = resTypeMap.get(res.reservation_type_name);
        const cls = classifyReservationType(res.reservation_type_name, typeRow);
        const animalId = String(res.animal_gingr_id);
        const playgroup = playgroupMap.get(animalId);
        const isPP = ppAnimalIds.has(animalId);

        // Size classification
        const isLarge = playgroup === "large";
        const isSmall = playgroup === "small";

        if (cls === "boarding") {
          if (isPP) {
            ppOvernightBoarders++;
          } else if (isLarge) {
            boardingLarge++;
          } else if (isSmall) {
            boardingSmall++;
          } else {
            boardingUnknown++;
          }
        } else if (cls === "daycare" || cls === "dayboarding") {
          if (isPP) {
            ppDayboarders++;
          } else if (isLarge) {
            daycareLarge++;
          } else if (isSmall) {
            daycareSmall++;
          } else {
            daycareUnknown++;
          }
        }

        // Feeding detection: scan services for "Food From Home"
        const services = res.services;
        if (services) {
          const svcStr = typeof services === "string" ? services : JSON.stringify(services);
          if (svcStr.toLowerCase().includes("food from home")) {
            feedingDogs++;
          }
          if (svcStr.toLowerCase().includes("medication") || svcStr.toLowerCase().includes("medicine")) {
            medicationDogs++;
          }
        }
      }

      // Bathing from lite_daily_ops
      let departureBaths = 0;
      const bathOps = opsMap.get(`${currentDate}_bathing`);
      if (bathOps?.computed_items) {
        const items = typeof bathOps.computed_items === "string"
          ? JSON.parse(bathOps.computed_items)
          : bathOps.computed_items;
        departureBaths = Array.isArray(items) ? items.length : 0;
      }

      // Dashboard fallback for metrics not computed from reservations
      const grossDogs = dashRow?.dogs_in_house || (boardingLarge + boardingSmall + boardingUnknown + daycareLarge + daycareSmall + daycareUnknown + ppDayboarders + ppOvernightBoarders);
      const dogsArriving = dashRow?.dogs_arriving || 0;
      const dogsDeparting = dashRow?.dogs_going_home || 0;
      const evals = dashRow?.evals_today || 0;
      const tours = dashRow?.tours_today || 0;

      // Room occupancy
      const occSnap = roomOcc.find((r: any) => r.snapshot_date === currentDate);
      const roomsOccupied = occSnap?.number_occupied || 0;
      const roomsAvailable = occSnap?.number_available || 0;
      const totalRooms = dashRow?.total_room_count || (roomsOccupied + roomsAvailable) || 28;

      const matrixRow = {
        location_id: locationId,
        matrix_date: currentDate,
        boarding_large: boardingLarge,
        boarding_small: boardingSmall,
        boarding_unknown_size: boardingUnknown,
        daycare_large: daycareLarge,
        daycare_small: daycareSmall,
        daycare_unknown_size: daycareUnknown,
        pp_dayboarders: ppDayboarders,
        pp_overnight_boarders: ppOvernightBoarders,
        departure_baths: departureBaths,
        evaluations: evals,
        tours: tours,
        gross_dogs_in_building: grossDogs,
        feeding_dogs: feedingDogs,
        medication_dogs: medicationDogs,
        dogs_arriving: dogsArriving,
        dogs_departing: dogsDeparting,
        dogs_checked_out: dashRow?.dogs_checked_out || 0,
        rooms_occupied: roomsOccupied,
        rooms_available: roomsAvailable,
        total_rooms: totalRooms,
        detail_json: {},
        computed_at: new Date().toISOString(),
      };

      results.push(matrixRow);
      currentDate = addDaysStr(currentDate, 1);
    }

    // ── Upsert into scheduling_matrix_daily ───────────────────────────
    if (results.length > 0) {
      const { error: upsertErr } = await supabase
        .from("scheduling_matrix_daily")
        .upsert(results, { onConflict: "location_id,matrix_date" });

      if (upsertErr) {
        console.error("Upsert error:", upsertErr);
        return new Response(JSON.stringify({ error: upsertErr.message, rows_attempted: results.length }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ ok: true, rows_upserted: results.length, date_range: [dateFrom, dateTo] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("compute-scheduling-matrix error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

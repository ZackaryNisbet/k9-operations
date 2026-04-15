import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function isDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function reservationMatchesDate(reservation: any, targetDate: string): boolean {
  const nextDate = addDays(targetDate, 1);
  const startDate = String(reservation?.start_date || "");
  const endDate = String(reservation?.end_date || "");
  const checkOutDate = String(reservation?.check_out_date || "");
  const checkInDate = String(reservation?.check_in_date || "");

  const overlapsActiveStay =
    startDate <= `${targetDate}T23:59:59` && endDate >= `${targetDate}T00:00:00`;
  const checkedOutThatDay =
    checkOutDate >= `${targetDate}T00:00:00` && checkOutDate < `${nextDate}T00:00:00`;
  const pendingStartThatDay =
    !checkInDate &&
    !checkOutDate &&
    startDate >= `${targetDate}T00:00:00` &&
    startDate < `${nextDate}T00:00:00`;

  return overlapsActiveStay || checkedOutThatDay || pendingStartThatDay;
}

async function userHasLocationAccess(sb: any, userId: string, locationId: string): Promise<boolean> {
  const { data: profile } = await sb
    .from("profiles")
    .select("location_id")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.location_id === locationId) return true;

  const { data: profileLocation } = await sb
    .from("profile_locations")
    .select("id")
    .eq("profile_id", userId)
    .eq("location_id", locationId)
    .limit(1)
    .maybeSingle();

  return !!profileLocation;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";

    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const [{ data: authData, error: authError }, body] = await Promise.all([
      authClient.auth.getUser(),
      req.json(),
    ]);

    if (authError || !authData?.user) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const action = String(body?.action || "add").toLowerCase();
    const locationId = String(body?.location_id || "").trim();
    const date = String(body?.date || "").trim();
    const gingrReservationId = String(body?.gingr_reservation_id || "").trim();
    const roomLabelOverride = String(body?.room_label_override || "").trim().slice(0, 120);
    const note = String(body?.note || "").trim().slice(0, 500);

    if (!locationId || !date || !gingrReservationId) {
      return new Response(
        JSON.stringify({ error: "location_id, date, and gingr_reservation_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!isDateKey(date)) {
      return new Response(
        JSON.stringify({ error: "date must be YYYY-MM-DD" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (action !== "add" && action !== "remove") {
      return new Response(
        JSON.stringify({ error: "action must be add or remove" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const canAccessLocation = await userHasLocationAccess(adminClient, authData.user.id, locationId);
    if (!canAccessLocation) {
      return new Response(
        JSON.stringify({ error: "You do not have access to this location" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: actorProfile } = await adminClient
      .from("profiles")
      .select("full_name, first_name, last_name, email")
      .eq("id", authData.user.id)
      .maybeSingle();

    const actorName =
      actorProfile?.full_name ||
      [actorProfile?.first_name, actorProfile?.last_name].filter(Boolean).join(" ") ||
      actorProfile?.email ||
      authData.user.email ||
      "Staff";

    const { data: reservation, error: reservationError } = await adminClient
      .from("gingr_reservations")
      .select("gingr_id, animal_gingr_id, start_date, end_date, check_in_date, check_out_date, cancelled_date, raw_data, room_assignment")
      .eq("location_id", locationId)
      .eq("gingr_id", gingrReservationId)
      .maybeSingle();

    if (reservationError || !reservation) {
      return new Response(
        JSON.stringify({ error: "Reservation not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (reservation.cancelled_date) {
      return new Response(
        JSON.stringify({ error: "Cancelled reservations cannot be added to private play" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!reservationMatchesDate(reservation, date)) {
      return new Response(
        JSON.stringify({ error: "That reservation is not active on the selected report date" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "add") {
      const { error: upsertError } = await adminClient
        .from("ops_private_play_manual_overrides")
        .upsert(
          {
            location_id: locationId,
            override_date: date,
            gingr_reservation_id: gingrReservationId,
            animal_gingr_id: String(reservation.animal_gingr_id || "").trim() || null,
            room_label_override: roomLabelOverride,
            note,
            added_by_user_id: authData.user.id,
            added_by_name: actorName,
            removed_at: null,
            removed_by_user_id: null,
            removed_by_name: "",
          },
          {
            onConflict: "location_id,override_date,gingr_reservation_id",
            ignoreDuplicates: false,
          },
        );

      if (upsertError) throw upsertError;
    } else {
      const { error: removeError } = await adminClient
        .from("ops_private_play_manual_overrides")
        .update({
          removed_at: new Date().toISOString(),
          removed_by_user_id: authData.user.id,
          removed_by_name: actorName,
        })
        .eq("location_id", locationId)
        .eq("override_date", date)
        .eq("gingr_reservation_id", gingrReservationId)
        .is("removed_at", null);

      if (removeError) throw removeError;
    }

    const recomputeResp = await fetch(`${supabaseUrl}/functions/v1/ops-compute-ondemand`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({ location_id: locationId, date }),
    });

    if (!recomputeResp.ok) {
      throw new Error(`ops-compute-ondemand failed: ${await recomputeResp.text()}`);
    }

    const recomputeData = await recomputeResp.json();

    return new Response(
      JSON.stringify({
        success: true,
        action,
        note,
        room_label_override: roomLabelOverride,
        recompute: recomputeData?.private_play || null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("ops-private-play-manual error:", err);
    return new Response(
      JSON.stringify({ error: err?.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

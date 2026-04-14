import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildRotationCacheSignature,
  buildRotationSchedulePayload,
  normalizeRotationConfig,
} from "../_shared/rotation-schedule.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseJwtClaims(token: string) {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    return JSON.parse(atob(parts[1]));
  } catch {
    return null;
  }
}

async function assertLocationAccess(req: Request, locationId: string) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    throw Object.assign(new Error("Missing Authorization header"), { status: 401 });
  }

  const bearerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    serviceRoleKey,
  );

  if (bearerToken === serviceRoleKey) {
    return serviceClient;
  }

  const claims = parseJwtClaims(bearerToken);
  if (claims?.role === "service_role") {
    return serviceClient;
  }

  const authClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    },
  );

  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser();

  if (authError || !user) {
    throw Object.assign(new Error("Unable to authenticate request"), { status: 401 });
  }

  const [
    { data: liteProfiles, error: profileError },
    { data: ownerProfile, error: ownerProfileError },
  ] = await Promise.all([
    serviceClient
      .from("lite_profiles")
      .select("location_id, role, is_active")
      .eq("user_id", user.id)
      .eq("is_active", true),
    serviceClient
      .from("profiles")
      .select("id, role")
      .eq("id", user.id)
      .in("role", ["owner", "role_owner"])
      .maybeSingle(),
  ]);

  if (profileError) {
    throw Object.assign(profileError, { status: 500 });
  }

  if (ownerProfileError) {
    throw Object.assign(ownerProfileError, { status: 500 });
  }

  const hasAccess = !!ownerProfile || (liteProfiles || []).some((profile: any) =>
    profile.role === "enterprise_admin" || profile.location_id === locationId,
  );

  if (!hasAccess) {
    throw Object.assign(new Error("You do not have access to compute this location's rotation schedule."), { status: 403 });
  }

  return serviceClient;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const locationId = String(body.location_id || "");
    const scheduleDate = String(body.schedule_date || "");
    const mode = body.mode === "actual_staffing" ? "actual_staffing" : "optimal";

    if (!locationId || !scheduleDate) {
      return jsonResponse({ error: "location_id and schedule_date are required" }, 400);
    }

    const serviceClient = await assertLocationAccess(req, locationId);

    const [{ data: matrixRow, error: matrixError }, { data: configRow, error: configError }, { data: staffPlanRow, error: staffPlanError }] = await Promise.all([
      serviceClient
        .from("scheduling_matrix_daily")
        .select("*")
        .eq("location_id", locationId)
        .eq("matrix_date", scheduleDate)
        .maybeSingle(),
      serviceClient
        .from("lite_settings")
        .select("setting_value, updated_at")
        .eq("location_id", locationId)
        .eq("setting_key", "schedule_config")
        .maybeSingle(),
      mode === "actual_staffing"
        ? serviceClient
          .from("daily_staff_plan")
          .select("*")
          .eq("location_id", locationId)
          .eq("plan_date", scheduleDate)
          .eq("shift", "full")
          .maybeSingle()
        : Promise.resolve({ data: null, error: null }) as any,
    ]);

    if (matrixError) throw Object.assign(matrixError, { status: 500 });
    if (configError) throw Object.assign(configError, { status: 500 });
    if (staffPlanError) throw Object.assign(staffPlanError, { status: 500 });

    if (!matrixRow) {
      return jsonResponse({ error: "No scheduling matrix found for this date." }, 404);
    }

    const normalizedConfig = normalizeRotationConfig(configRow?.setting_value || {});
    const freshnessSignature = buildRotationCacheSignature({
      matrixComputedAt: matrixRow?.computed_at || null,
      staffPlanUpdatedAt: staffPlanRow?.updated_at || null,
      configUpdatedAt: configRow?.updated_at || null,
    });

    const { data: cachedRow, error: cacheFetchError } = await serviceClient
      .from("rotation_schedule_cache")
      .select("response_payload, freshness_signature")
      .eq("location_id", locationId)
      .eq("schedule_date", scheduleDate)
      .eq("mode", mode)
      .maybeSingle();

    if (cacheFetchError && cacheFetchError.code !== "42P01") {
      throw Object.assign(cacheFetchError, { status: 500 });
    }

    if (cachedRow?.freshness_signature === freshnessSignature && cachedRow?.response_payload) {
      return jsonResponse({
        ok: true,
        cached: true,
        location_id: locationId,
        schedule_date: scheduleDate,
        mode,
        ...cachedRow.response_payload,
      });
    }

    const responsePayload = buildRotationSchedulePayload({
      matrix: matrixRow,
      config: normalizedConfig,
      staffPlan: staffPlanRow,
      mode,
    });

    const { error: cacheUpsertError } = await serviceClient
      .from("rotation_schedule_cache")
      .upsert({
        location_id: locationId,
        schedule_date: scheduleDate,
        mode,
        matrix_computed_at: matrixRow?.computed_at || null,
        staff_plan_updated_at: staffPlanRow?.updated_at || null,
        config_updated_at: configRow?.updated_at || null,
        freshness_signature: freshnessSignature,
        response_payload: responsePayload,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "location_id,schedule_date,mode",
      });

    if (cacheUpsertError && cacheUpsertError.code !== "42P01") {
      throw Object.assign(cacheUpsertError, { status: 500 });
    }

    return jsonResponse({
      ok: true,
      cached: false,
      location_id: locationId,
      schedule_date: scheduleDate,
      mode,
      ...responsePayload,
    });
  } catch (error: any) {
    console.error("compute-rotation-schedule error:", error);
    return jsonResponse({ error: error.message || "Failed to compute rotation schedule" }, error.status || 500);
  }
});

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  addDaysStr,
  computeSchedulingMatrixRows,
  dateStrET,
  upsertSchedulingMatrixRows,
} from "../_shared/scheduling-matrix.ts";

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

async function assertLocationAccess(req: Request, locationId: string) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    throw Object.assign(new Error("Missing Authorization header"), { status: 401 });
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

  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: profiles, error: profileError } = await serviceClient
    .from("lite_profiles")
    .select("location_id, role, is_active")
    .eq("user_id", user.id)
    .eq("is_active", true);

  if (profileError) {
    throw Object.assign(profileError, { status: 500 });
  }

  const hasAccess = (profiles || []).some((profile: any) =>
    profile.role === "enterprise_admin" || profile.location_id === locationId,
  );

  if (!hasAccess) {
    throw Object.assign(new Error("You do not have access to compute this location's scheduling matrix."), { status: 403 });
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
    if (!locationId) {
      return jsonResponse({ error: "location_id required" }, 400);
    }

    const dateFrom = String(body.date_from || dateStrET());
    const dateTo = String(body.date_to || addDaysStr(dateFrom, 6));

    const serviceClient = await assertLocationAccess(req, locationId);
    const rows = await computeSchedulingMatrixRows({
      supabase: serviceClient,
      locationId,
      dateFrom,
      dateTo,
    });

    const upsertResult = await upsertSchedulingMatrixRows(serviceClient, rows);

    return jsonResponse({
      ok: true,
      location_id: locationId,
      date_range: [dateFrom, dateTo],
      rows_upserted: upsertResult.count,
    });
  } catch (error: any) {
    console.error("compute-scheduling-matrix error:", error);
    return jsonResponse({ error: error.message || "Failed to compute scheduling matrix" }, error.status || 500);
  }
});

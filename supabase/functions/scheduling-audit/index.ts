import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  addDaysStr,
  buildReservationRecord,
  buildReservationTypeMaps,
  computeDemandSnapshotForDate,
} from "../_shared/scheduling-matrix.ts";
import {
  buildPlaygroupAssignmentMap,
  derivePlaygroupAssignmentsFromIcons,
} from "../_shared/playgroup-assignments.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GINGR_ICON_BATCH_SIZE = 200;
const RESERVATION_RETRY_DELAYS_MS = [250, 750, 1500];

const METRIC_DEFINITIONS = [
  { key: "opening.large_boarding", label: "Large Boarding Opening" },
  { key: "opening.small_boarding", label: "Small Boarding Opening" },
  { key: "opening.private_play_boarding", label: "Private Play Boarding Opening" },
  { key: "opening.half_and_half_boarding", label: "Half and Half Boarding Opening" },
  { key: "opening.unclassified_boarding", label: "Unresolved Boarding Opening" },
  { key: "opening.total_boarding", label: "Total Boarding Dogs Opening" },
  { key: "closing.large_boarding", label: "Large Boarding Closing" },
  { key: "closing.small_boarding", label: "Small Boarding Closing" },
  { key: "closing.private_play_boarding", label: "Private Play Boarding Closing" },
  { key: "closing.half_and_half_boarding", label: "Half and Half Boarding Closing" },
  { key: "closing.unclassified_boarding", label: "Unresolved Boarding Closing" },
  { key: "closing.total_boarding", label: "Total Boarding Dogs Closing" },
  { key: "daycare.evaluations", label: "Evaluations" },
  { key: "daycare.private_play_dayboarding", label: "Private Play Dayboarding" },
  { key: "daycare.half_and_half_daytime", label: "Half and Half Daytime Dogs" },
  { key: "daycare.large_daycare", label: "Large Daycare" },
  { key: "daycare.small_daycare", label: "Small Daycare" },
  { key: "daycare.unclassified_daycare", label: "Unresolved Daytime Dogs" },
  { key: "daycare.total_daycare", label: "Total Daycare Dogs" },
  { key: "support.departure_baths", label: "Departure Baths" },
  { key: "support.morning_feeding_dogs", label: "Morning Feeding Dogs" },
  { key: "support.evening_feeding_dogs", label: "Evening Feeding Dogs" },
  { key: "support.medication_dogs", label: "Medication Dogs" },
  { key: "support.total_dog_volume", label: "Total Dog Volume" },
  { key: "support.tours", label: "Tours" },
] as const;

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
    throw Object.assign(new Error("You do not have access to audit this location's scheduling matrix."), { status: 403 });
  }

  return serviceClient;
}

async function gingrFetch(
  subdomain: string,
  endpoint: string,
  apiKey: string,
  method: "GET" | "POST" = "GET",
  body?: Record<string, string>,
) {
  const url = `https://${subdomain}.gingrapp.com/api/v1/${endpoint}`;

  let resp: Response;
  if (method === "POST") {
    const params = new URLSearchParams();
    params.append("key", apiKey);
    if (body) {
      for (const [key, value] of Object.entries(body)) {
        params.append(key, value);
      }
    }
    resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
      body: params.toString(),
    });
  } else {
    const params = new URLSearchParams({ key: apiKey });
    if (body) {
      for (const [key, value] of Object.entries(body)) {
        params.append(key, value);
      }
    }
    resp = await fetch(`${url}?${params.toString()}`);
  }

  if (!resp.ok) {
    throw new Error(`Gingr API error ${resp.status}: ${await resp.text()}`);
  }

  return resp.json();
}

function toDateKey(value?: string | null) {
  return String(value || "").slice(0, 10);
}

function enumerateDates(dateFrom: string, dateTo: string): string[] {
  const dates: string[] = [];
  let current = dateFrom;
  while (current <= dateTo) {
    dates.push(current);
    current = addDaysStr(current, 1);
  }
  return dates;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapGingrReservationRow(row: any) {
  return {
    gingr_id: row?.reservation_id ? String(row.reservation_id) : null,
    animal_gingr_id: row?.animal?.id ? String(row.animal.id) : null,
    animal_name: row?.animal?.name || null,
    reservation_type_id: row?.reservation_type?.id ? String(row.reservation_type.id) : null,
    reservation_type_name: row?.reservation_type?.type || null,
    start_date: row?.start_date || null,
    end_date: row?.end_date || null,
    check_in_date: row?.check_in_date || null,
    check_out_date: row?.check_out_date || null,
    cancelled_date: row?.cancelled_date || null,
    created_date: row?.created_date || null,
    confirmed_date: row?.confirmed_date || null,
    created_at: row?.created_date || row?.confirmed_date || null,
    services: row?.services || null,
  };
}

function normalizeReservationCollection(result: any): any[] {
  if (Array.isArray(result?.data)) return result.data;
  if (result?.data && typeof result.data === "object") return Object.values(result.data);
  if (Array.isArray(result)) return result;
  return [];
}

async function fetchGingrReservationsForAudit({
  subdomain,
  apiKey,
  dateFrom,
  dateTo,
}: {
  subdomain: string;
  apiKey: string;
  dateFrom: string;
  dateTo: string;
}) {
  const dayResults = [];
  for (const targetDate of enumerateDates(dateFrom, dateTo)) {
    let result = { data: {} };
    for (let attempt = 0; attempt <= RESERVATION_RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        result = await gingrFetch(subdomain, "reservations", apiKey, "POST", {
          start_date: targetDate,
          end_date: targetDate,
        });
        break;
      } catch (error) {
        if (attempt >= RESERVATION_RETRY_DELAYS_MS.length) {
          console.error(`scheduling-audit reservation fetch failed for ${targetDate}:`, error);
          break;
        }
        await sleep(RESERVATION_RETRY_DELAYS_MS[attempt]);
      }
    }
    dayResults.push(result);
  }

  const rows = dayResults.flatMap(normalizeReservationCollection);

  const byId = new Map<string, any>();
  for (const row of rows) {
    const reservationId = String(row?.reservation_id || "").trim();
    if (!reservationId) continue;
    byId.set(reservationId, row);
  }

  return Array.from(byId.values());
}

async function fetchLivePlaygroupAssignments({
  subdomain,
  apiKey,
  reservations,
}: {
  subdomain: string;
  apiKey: string;
  reservations: any[];
}) {
  const animalIds = [...new Set(
    reservations
      .map((row) => String(row?.animal?.id || "").trim())
      .filter(Boolean),
  )];

  if (!animalIds.length) {
    return buildPlaygroupAssignmentMap([]);
  }

  const iconRows: any[] = [];
  for (let i = 0; i < animalIds.length; i += GINGR_ICON_BATCH_SIZE) {
    const chunk = animalIds.slice(i, i + GINGR_ICON_BATCH_SIZE);
    const params = new URLSearchParams();
    params.append("key", apiKey);
    params.append("animal_ids", JSON.stringify(chunk.map(Number)));
    params.append("owner_ids", "null");

    const response = await fetch(`https://${subdomain}.gingrapp.com/api/v1/get_icons`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
      body: params.toString(),
    });

    if (!response.ok) {
      throw new Error(`get_icons error ${response.status}: ${await response.text()}`);
    }

    const result = await response.json();
    if (!result?.success) {
      throw new Error(`get_icons failed: ${JSON.stringify(result).slice(0, 200)}`);
    }

    const animals = result?.data?.animals || {};
    for (const [animalId, entry] of Object.entries(animals) as [string, any][]) {
      for (const icon of entry?.icons || []) {
        iconRows.push({
          animal_gingr_id: animalId,
          icon_template_id: String(icon?.color_label_template_id || icon?.id || ""),
          icon_title: icon?.title || null,
          icon_group: icon?.name || null,
          icon_comment: icon?.comment || null,
        });
      }
    }
  }

  return buildPlaygroupAssignmentMap(derivePlaygroupAssignmentsFromIcons(iconRows));
}

function getNestedValue(obj: any, key: string) {
  return key.split(".").reduce((acc, part) => acc?.[part], obj);
}

function toMetricMap(display: any) {
  const metrics: Record<string, number> = {};
  for (const metric of METRIC_DEFINITIONS) {
    metrics[metric.key] = Number(getNestedValue(display, metric.key) || 0);
  }
  return metrics;
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
    const dateFrom = String(body.date_from || "");
    const dateTo = String(body.date_to || "");

    if (!locationId || !dateFrom || !dateTo) {
      return jsonResponse({ error: "location_id, date_from, and date_to are required" }, 400);
    }

    const serviceClient = await assertLocationAccess(req, locationId);

    const [{ data: settingsRow, error: settingsError }, { data: matrixRows, error: matrixError }, { data: resTypeRows, error: resTypeError }] = await Promise.all([
      serviceClient
        .from("lite_settings")
        .select("setting_value")
        .eq("location_id", locationId)
        .eq("setting_key", "gingr_config")
        .maybeSingle(),
      serviceClient
        .from("scheduling_matrix_daily")
        .select("matrix_date, detail_json, computed_at")
        .eq("location_id", locationId)
        .gte("matrix_date", dateFrom)
        .lte("matrix_date", dateTo)
        .order("matrix_date", { ascending: true }),
      serviceClient
        .from("gingr_reservation_types")
        .select("gingr_id, name, is_boarding, is_daycare, single_day")
        .eq("location_id", locationId),
    ]);

    if (settingsError) throw settingsError;
    if (matrixError) throw matrixError;
    if (resTypeError) throw resTypeError;

    const gingrConfig = settingsRow?.setting_value || {};
    if (!gingrConfig?.api_key || !gingrConfig?.subdomain) {
      return jsonResponse({ error: "Gingr is not configured for this location." }, 400);
    }

    const directReservations = await fetchGingrReservationsForAudit({
      subdomain: gingrConfig.subdomain,
      apiKey: gingrConfig.api_key,
      dateFrom,
      dateTo,
    });
    const playgroupMap = await fetchLivePlaygroupAssignments({
      subdomain: gingrConfig.subdomain,
      apiKey: gingrConfig.api_key,
      reservations: directReservations,
    });
    const resTypeMaps = buildReservationTypeMaps(resTypeRows || []);
    const reservations = directReservations
      .map(mapGingrReservationRow)
      .filter((row) => !row.cancelled_date)
      .map((row) => buildReservationRecord(row, resTypeMaps, playgroupMap));
    const matrixByDate = new Map((matrixRows || []).map((row: any) => [row.matrix_date, row]));

    const days = enumerateDates(dateFrom, dateTo).map((targetDate) => {
      const liveSnapshot = computeDemandSnapshotForDate({
        targetDate,
        reservations,
        roomByDate: {},
        totalRooms: 0,
      });

      const matrixRow = matrixByDate.get(targetDate);
      const matrixDisplay = matrixRow?.detail_json?.display || null;
      const gingrMetrics = toMetricMap(liveSnapshot.display);
      const matrixMetrics = toMetricMap(matrixDisplay);
      const mismatches = METRIC_DEFINITIONS
        .map((metric) => ({
          key: metric.key,
          label: metric.label,
          matrix_value: matrixMetrics[metric.key] ?? 0,
          gingr_value: gingrMetrics[metric.key] ?? 0,
          delta: (matrixMetrics[metric.key] ?? 0) - (gingrMetrics[metric.key] ?? 0),
        }))
        .filter((metric) => metric.delta !== 0);

      const status = !matrixDisplay
        ? "missing_matrix"
        : mismatches.length > 0
          ? "mismatch"
          : "match";

      return {
        date: targetDate,
        status,
        mismatch_count: mismatches.length,
        mismatches,
        matrix_computed_at: matrixRow?.computed_at || null,
        gingr_display: liveSnapshot.display,
        matrix_display: matrixDisplay,
      };
    });

    return jsonResponse({
      ok: true,
      audit_source: "gingr_live_api",
      audited_at: new Date().toISOString(),
      date_range: [dateFrom, dateTo],
      summary: {
        total_days: days.length,
        matching_days: days.filter((day) => day.status === "match").length,
        mismatching_days: days.filter((day) => day.status === "mismatch").length,
        missing_days: days.filter((day) => day.status === "missing_matrix").length,
      },
      days,
    });
  } catch (error: any) {
    console.error("scheduling-audit error:", error);
    return jsonResponse({ error: error.message || "Failed to audit scheduling matrix" }, error.status || 500);
  }
});

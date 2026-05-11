import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  addDaysStr,
  computeSchedulingMatrixRows,
  dateStrET,
  normalizeGingrReservationWidgetPayload,
  upsertSchedulingMatrixRows,
} from "../_shared/scheduling-matrix.ts";
import {
  getGingrConfigForLocation,
  upsertAnimalIconsFromGingr,
} from "../_shared/gingr-icons.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Later projected weeks can exceed the Edge worker resource ceiling when we
// compute an entire 7-day slice in one pass. Keep the request surface as a
// range, but process one matrix day at a time server-side so later weeks stay
// reliable without user intervention.
const COMPUTE_CHUNK_DAYS = 1;
const LIVE_HYDRATION_HORIZON_DAYS = 60;
const RESERVATION_RETRY_DELAYS_MS = [250, 750, 1500];
const CHERRY_HILL_LOCATION_ID = "11111111-1111-1111-1111-111111111111";
const LOCATION_ID_ALIASES: Record<string, string> = {
  "cherry-hill": CHERRY_HILL_LOCATION_ID,
  your-gingr-subdomain: CHERRY_HILL_LOCATION_ID,
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function schedulingComputeDisabled() {
  return ["1", "true", "yes", "on"].includes(
    String(Deno.env.get("SCHEDULING_COMPUTE_DISABLED") || "").trim().toLowerCase(),
  );
}

function normalizeLocationId(value: string) {
  const trimmed = String(value || "").trim();
  const alias = LOCATION_ID_ALIASES[trimmed.toLowerCase()];
  return alias || trimmed;
}

function enumerateDates(dateFrom: string, dateTo: string) {
  const dates: string[] = [];
  let current = dateFrom;
  while (current <= dateTo) {
    dates.push(current);
    current = addDaysStr(current, 1);
  }
  return dates;
}

function chunkDateRange(dateFrom: string, dateTo: string, chunkDays = COMPUTE_CHUNK_DAYS) {
  const chunks: Array<{ from: string; to: string }> = [];
  let current = dateFrom;
  while (current <= dateTo) {
    const chunkEnd = addDaysStr(current, chunkDays - 1);
    chunks.push({
      from: current,
      to: chunkEnd < dateTo ? chunkEnd : dateTo,
    });
    current = addDaysStr(chunkEnd, 1);
  }
  return chunks;
}

function getWeekScopeForDate(targetDate: string) {
  const dt = new Date(`${targetDate}T12:00:00Z`);
  const mondayOffset = (dt.getUTCDay() + 6) % 7;
  const from = addDaysStr(targetDate, -mondayOffset);
  return {
    from,
    to: addDaysStr(from, 6),
  };
}

function getProjectionScope(body: Record<string, unknown>, dateFrom: string, dateTo: string) {
  const defaultScope = dateFrom === dateTo
    ? getWeekScopeForDate(dateFrom)
    : { from: dateFrom, to: dateTo };

  return {
    from: String(body.projection_scope_date_from || defaultScope.from),
    to: String(body.projection_scope_date_to || defaultScope.to),
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function fetchReservationsForDateWithRetry(
  subdomain: string,
  apiKey: string,
  targetDate: string,
) {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= RESERVATION_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await gingrFetch(subdomain, "reservations", apiKey, "POST", {
        start_date: targetDate,
        end_date: targetDate,
      });
    } catch (error: any) {
      lastError = error instanceof Error ? error : new Error(String(error || "Unknown reservations hydrate error"));
      if (attempt >= RESERVATION_RETRY_DELAYS_MS.length) break;
      await sleep(RESERVATION_RETRY_DELAYS_MS[attempt]);
    }
  }

  throw lastError || new Error(`Failed to hydrate reservations for ${targetDate}`);
}

async function fetchReservationWidgetForDateWithRetry(
  subdomain: string,
  apiKey: string,
  targetDate: string,
) {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= RESERVATION_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await gingrFetch(subdomain, "reservation_widget_data", apiKey, "GET", {
        timestamp: targetDate,
      });
    } catch (error: any) {
      lastError = error instanceof Error ? error : new Error(String(error || "Unknown reservation widget hydrate error"));
      if (attempt >= RESERVATION_RETRY_DELAYS_MS.length) break;
      await sleep(RESERVATION_RETRY_DELAYS_MS[attempt]);
    }
  }

  throw lastError || new Error(`Failed to hydrate reservation widget data for ${targetDate}`);
}

function normalizeReservationCollection(result: any): any[] {
  if (Array.isArray(result?.data)) return result.data;
  if (result?.data && typeof result.data === "object") return Object.values(result.data);
  if (Array.isArray(result)) return result;
  return [];
}

function mapGingrReservationRow(row: any, locationId: string) {
  return {
    gingr_id: String(row?.reservation_id || ""),
    location_id: locationId,
    owner_gingr_id: row?.owner?.id ? String(row.owner.id) : null,
    animal_gingr_id: row?.animal?.id ? String(row.animal.id) : null,
    reservation_type_id: row?.reservation_type?.id ? String(row.reservation_type.id) : null,
    reservation_type_name: row?.reservation_type?.type || null,
    start_date: row?.start_date || null,
    end_date: row?.end_date || null,
    check_in_date: row?.check_in_date || null,
    check_out_date: row?.check_out_date || null,
    cancelled_date: row?.cancelled_date || null,
    confirmed_date: row?.confirmed_date || null,
    created_date: row?.created_date || null,
    standing_reservation: row?.standing_reservation || false,
    owner_first_name: row?.owner?.first_name?.trim() || null,
    owner_last_name: row?.owner?.last_name?.trim() || null,
    owner_email: row?.owner?.email || null,
    animal_name: row?.animal?.name || null,
    animal_breed: row?.animal?.breed || null,
    notes_reservation: row?.notes?.reservation_notes || null,
    notes_animal: row?.notes?.animal_notes || null,
    notes_owner: row?.notes?.owner_notes || null,
    services: row?.services || null,
    deposit: row?.deposit || null,
    transaction: row?.transaction || null,
    raw_data: row,
    synced_at: new Date().toISOString(),
  };
}

async function hydrateSchedulingReservationsFromGingr(
  serviceClient: any,
  locationId: string,
  gingrConfig: { subdomain: string; apiKey: string } | null,
  dateFrom: string,
  dateTo: string,
) {
  const today = dateStrET();
  const targetDates = enumerateDates(dateFrom, dateTo).filter((date) => date >= today);
  if (!gingrConfig || !targetDates.length) {
    return { hydrated: 0, skipped: true };
  }

  const results = [];
  for (const targetDate of targetDates) {
    try {
      const result = await fetchReservationsForDateWithRetry(
        gingrConfig.subdomain,
        gingrConfig.apiKey,
        targetDate,
      );
      results.push(result);
    } catch (error) {
      console.error(`compute-scheduling-matrix reservation hydrate failed for ${targetDate}:`, error);
      results.push({ data: {} });
    }
  }

  const reservationsById = new Map<string, any>();
  for (const result of results) {
    for (const reservation of normalizeReservationCollection(result)) {
      if (!reservation || typeof reservation !== "object") continue;
      const reservationId = String(reservation.reservation_id || "").trim();
      if (!reservationId) continue;
      reservationsById.set(reservationId, reservation);
    }
  }

  const rows = Array.from(reservationsById.values()).map((reservation) =>
    mapGingrReservationRow(reservation, locationId),
  );

  if (!rows.length) {
    return { hydrated: 0, skipped: false };
  }

  const { error } = await serviceClient
    .from("gingr_reservations")
    .upsert(rows, { onConflict: "location_id,gingr_id" });

  if (error) throw error;
  return { hydrated: rows.length, skipped: false };
}

async function hydrateSchedulingWidgetSourceFromGingr(
  serviceClient: any,
  locationId: string,
  gingrConfig: { subdomain: string; apiKey: string } | null,
  dateFrom: string,
  dateTo: string,
) {
  const today = dateStrET();
  const targetDates = enumerateDates(dateFrom, dateTo).filter((date) => date >= today);
  if (!gingrConfig || !targetDates.length) {
    return { hydrated: 0, skipped: true };
  }

  const rows = [];
  for (const targetDate of targetDates) {
    try {
      const result = await fetchReservationWidgetForDateWithRetry(
        gingrConfig.subdomain,
        gingrConfig.apiKey,
        targetDate,
      );
      rows.push(normalizeGingrReservationWidgetPayload({
        locationId,
        widgetDate: targetDate,
        payload: result,
      }));
    } catch (error) {
      console.error(`compute-scheduling-matrix reservation widget hydrate failed for ${targetDate}:`, error);
    }
  }

  if (!rows.length) {
    return { hydrated: 0, skipped: false };
  }

  const { error } = await serviceClient
    .from("gingr_reservation_widget_daily")
    .upsert(rows, { onConflict: "location_id,widget_date" });

  if (error) throw error;
  return { hydrated: rows.length, skipped: false };
}

async function syncSchedulingIconsForRange(
  serviceClient: any,
  locationId: string,
  gingrConfig: { subdomain: string; apiKey: string } | null,
  dateFrom: string,
  dateTo: string,
) {
  if (!gingrConfig) {
    return { synced: 0, animals: 0, skipped: true };
  }

  const { data: reservations, error } = await serviceClient
    .from("gingr_reservations")
    .select("animal_gingr_id")
    .eq("location_id", locationId)
    .is("cancelled_date", null)
    .lt("start_date", `${addDaysStr(dateTo, 1)}T00:00:00`)
    .gte("end_date", `${dateFrom}T00:00:00`);

  if (error) throw error;

  const animalIds = [...new Set(
    (reservations || [])
      .map((row: any) => String(row.animal_gingr_id || "").trim())
      .filter(Boolean),
  )];

  return upsertAnimalIconsFromGingr({
    supabase: serviceClient,
    locationId,
    gingrConfig,
    animalIds,
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
    const requestedLocationId = String(body.location_id || "").trim();
    if (!requestedLocationId) {
      return jsonResponse({ error: "location_id required" }, 400);
    }
    const locationId = normalizeLocationId(requestedLocationId);

    const dateFrom = String(body.date_from || dateStrET());
    const dateTo = String(body.date_to || addDaysStr(dateFrom, 6));
    const projectionScope = getProjectionScope(body, dateFrom, dateTo);
    const projectionScopeDateFrom = projectionScope.from;
    const projectionScopeDateTo = projectionScope.to;
    const liveHydrationThrough = addDaysStr(dateStrET(), LIVE_HYDRATION_HORIZON_DAYS);
    const shouldLiveHydrate = dateFrom <= liveHydrationThrough;

    const serviceClient = await assertLocationAccess(req, locationId);
    if (schedulingComputeDisabled()) {
      return jsonResponse({
        ok: true,
        disabled: true,
        location_id: locationId,
        requested_location_id: requestedLocationId !== locationId ? requestedLocationId : undefined,
        date_range: [dateFrom, dateTo],
        projection_scope_date_range: [projectionScopeDateFrom, projectionScopeDateTo],
        source: "compute_disabled",
      }, 202);
    }
    const gingrConfig = await getGingrConfigForLocation(serviceClient, locationId);

    const reservationHydration = shouldLiveHydrate
      ? await hydrateSchedulingReservationsFromGingr(
        serviceClient,
        locationId,
        gingrConfig,
        dateFrom,
        dateTo,
      )
      : { hydrated: 0, skipped: true, mode: "synced_reservations_only" };

    const widgetHydration = await hydrateSchedulingWidgetSourceFromGingr(
      serviceClient,
      locationId,
      gingrConfig,
      dateFrom,
      dateTo,
    );

    const iconSync = shouldLiveHydrate
      ? await syncSchedulingIconsForRange(
        serviceClient,
        locationId,
        gingrConfig,
        dateFrom,
        dateTo,
      )
      : { synced: 0, animals: 0, skipped: true, mode: "synced_icons_only" };

    let rowsUpserted = 0;
    const chunkFailures: Array<{ from: string; to: string; error: string }> = [];
    const chunks = chunkDateRange(dateFrom, dateTo);
    for (const chunk of chunks) {
      try {
        const rows = await computeSchedulingMatrixRows({
          supabase: serviceClient,
          locationId,
          dateFrom: chunk.from,
          dateTo: chunk.to,
          projectionScopeDateFrom,
          projectionScopeDateTo,
        });
        const result = await upsertSchedulingMatrixRows(serviceClient, rows);
        rowsUpserted += Number(result.count || 0);
      } catch (chunkError: any) {
        console.error(`compute-scheduling-matrix chunk failed for ${chunk.from}..${chunk.to}:`, chunkError);
        chunkFailures.push({
          from: chunk.from,
          to: chunk.to,
          error: chunkError?.message || String(chunkError || "Unknown chunk error"),
        });
      }
    }

    const responseStatus = chunkFailures.length
      ? (rowsUpserted > 0 ? 207 : 500)
      : 200;

    return jsonResponse({
      ok: chunkFailures.length === 0,
      location_id: locationId,
      requested_location_id: requestedLocationId !== locationId ? requestedLocationId : undefined,
      date_range: [dateFrom, dateTo],
      projection_scope_date_range: [projectionScopeDateFrom, projectionScopeDateTo],
      rows_upserted: rowsUpserted,
      chunks_processed: chunks.length,
      chunk_failures: chunkFailures,
      reservation_hydration: reservationHydration,
      widget_hydration: widgetHydration,
      icon_sync: iconSync,
      source: "canonical_supabase",
    }, responseStatus);
  } catch (error: any) {
    console.error("compute-scheduling-matrix error:", error);
    return jsonResponse({ error: error.message || "Failed to compute scheduling matrix" }, error.status || 500);
  }
});

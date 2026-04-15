import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function nowEtDate() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function ageMinutes(value: string | null | undefined) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return null;
  return Math.max(0, Math.round((Date.now() - timestamp) / 60000));
}

function freshnessStatus(age: number | null, warnMinutes: number, failMinutes: number) {
  if (age == null) return "unknown";
  if (age >= failMinutes) return "critical";
  if (age >= warnMinutes) return "warning";
  return "healthy";
}

async function fetchLatestAndCount(
  sb: any,
  table: string,
  locationId: string,
  columns: string,
  orderColumn: string,
) {
  const [{ data: latestRow, error: latestError }, { count, error: countError }] = await Promise.all([
    sb.from(table).select(columns).eq("location_id", locationId).order(orderColumn, { ascending: false }).limit(1).maybeSingle(),
    sb.from(table).select("id", { count: "exact", head: true }).eq("location_id", locationId),
  ]);

  if (latestError) throw latestError;
  if (countError) throw countError;

  return {
    latest: latestRow || null,
    count: count ?? 0,
  };
}

async function fetchSupabaseStatus() {
  try {
    const response = await fetch("https://status.supabase.com/api/v2/status.json");
    if (!response.ok) {
      throw new Error(`Status page returned ${response.status}`);
    }
    const payload = await response.json();
    return {
      indicator: payload?.status?.indicator || "unknown",
      description: payload?.status?.description || "Unknown",
      page_url: "https://status.supabase.com/",
    };
  } catch (error: any) {
    return {
      indicator: "unknown",
      description: error?.message || "Unable to reach Supabase status page.",
      page_url: "https://status.supabase.com/",
    };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { location_id = "cherry-hill", date = nowEtDate() } = await req.json().catch(() => ({}));
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const todayNotesId = `ops_gingr_notes_${date}`;
    const [
      syncStateRes,
      ownersMetric,
      animalsMetric,
      reservationsMetric,
      latestOpsMetric,
      todayNotesMetric,
      supabaseStatus,
    ] = await Promise.all([
      sb.from("gingr_sync_state").select("*").eq("location_id", location_id).order("entity_type", { ascending: true }),
      fetchLatestAndCount(sb, "gingr_owners", location_id, "updated_at, synced_at, first_name, last_name", "updated_at"),
      fetchLatestAndCount(sb, "gingr_animals", location_id, "updated_at, synced_at, name", "updated_at"),
      fetchLatestAndCount(sb, "gingr_reservations", location_id, "updated_at, synced_at, animal_name, start_date, end_date", "updated_at"),
      sb.from("lite_daily_ops").select("id, type_sub, updated_at, date").eq("location_id", location_id).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      sb.from("lite_daily_ops").select("id, updated_at, date").eq("location_id", location_id).eq("id", todayNotesId).maybeSingle(),
      fetchSupabaseStatus(),
    ]);

    if (syncStateRes.error) throw syncStateRes.error;
    if (latestOpsMetric.error) throw latestOpsMetric.error;
    if (todayNotesMetric.error) throw todayNotesMetric.error;

    const syncState = (syncStateRes.data || []).map((row: any) => {
      const age = ageMinutes(row.last_sync_at);
      return {
        entity_type: row.entity_type,
        status: row.status || "idle",
        records_synced: row.records_synced ?? 0,
        last_sync_at: row.last_sync_at || null,
        last_full_sync_at: row.last_full_sync_at || null,
        sync_duration_ms: row.sync_duration_ms ?? null,
        error_message: row.error_message || null,
        age_minutes: age,
        freshness_status: row.status === "error" ? "critical" : freshnessStatus(age, 45, 120),
      };
    });

    const freshness = {
      owners: {
        count: ownersMetric.count,
        updated_at: ownersMetric.latest?.updated_at || null,
        synced_at: ownersMetric.latest?.synced_at || null,
        age_minutes: ageMinutes(ownersMetric.latest?.updated_at || ownersMetric.latest?.synced_at || null),
        freshness_status: freshnessStatus(ageMinutes(ownersMetric.latest?.updated_at || ownersMetric.latest?.synced_at || null), 60, 180),
      },
      animals: {
        count: animalsMetric.count,
        updated_at: animalsMetric.latest?.updated_at || null,
        synced_at: animalsMetric.latest?.synced_at || null,
        age_minutes: ageMinutes(animalsMetric.latest?.updated_at || animalsMetric.latest?.synced_at || null),
        freshness_status: freshnessStatus(ageMinutes(animalsMetric.latest?.updated_at || animalsMetric.latest?.synced_at || null), 60, 180),
      },
      reservations: {
        count: reservationsMetric.count,
        updated_at: reservationsMetric.latest?.updated_at || null,
        synced_at: reservationsMetric.latest?.synced_at || null,
        age_minutes: ageMinutes(reservationsMetric.latest?.updated_at || reservationsMetric.latest?.synced_at || null),
        freshness_status: freshnessStatus(ageMinutes(reservationsMetric.latest?.updated_at || reservationsMetric.latest?.synced_at || null), 20, 60),
      },
      daily_ops: {
        latest_id: latestOpsMetric.data?.id || null,
        latest_type_sub: latestOpsMetric.data?.type_sub || null,
        updated_at: latestOpsMetric.data?.updated_at || null,
        date: latestOpsMetric.data?.date || null,
        age_minutes: ageMinutes(latestOpsMetric.data?.updated_at || null),
        freshness_status: freshnessStatus(ageMinutes(latestOpsMetric.data?.updated_at || null), 45, 180),
      },
      gingr_notes_today: {
        id: todayNotesMetric.data?.id || null,
        updated_at: todayNotesMetric.data?.updated_at || null,
        date: todayNotesMetric.data?.date || date,
        age_minutes: ageMinutes(todayNotesMetric.data?.updated_at || null),
        freshness_status: freshnessStatus(ageMinutes(todayNotesMetric.data?.updated_at || null), 90, 240),
      },
    };

    const alerts: Array<{ severity: string; message: string }> = [];
    for (const row of syncState) {
      if (row.status === "error") {
        alerts.push({
          severity: "critical",
          message: `${row.entity_type} sync is in error: ${row.error_message || "No error text returned."}`,
        });
      } else if (row.freshness_status === "critical") {
        alerts.push({
          severity: "warning",
          message: `${row.entity_type} sync is stale (${row.age_minutes} minutes since the last successful sync).`,
        });
      }
    }

    if (freshness.gingr_notes_today.freshness_status === "critical") {
      alerts.push({
        severity: "warning",
        message: `Today's Gingr notes have not refreshed recently for ${date}.`,
      });
    }

    if (!["none", "minor"].includes(supabaseStatus.indicator)) {
      alerts.push({
        severity: "warning",
        message: `Supabase status page is reporting ${supabaseStatus.description}.`,
      });
    }

    const overall_status = alerts.some((alert) => alert.severity === "critical")
      ? "critical"
      : alerts.length > 0
        ? "warning"
        : "healthy";

    return new Response(JSON.stringify({
      generated_at: new Date().toISOString(),
      location_id,
      today: date,
      overall_status,
      alerts,
      supabase_status: supabaseStatus,
      sync_state: syncState,
      freshness,
      pitr: {
        status: "manual-check-required",
        note: "PITR is configured at the Supabase project level. This app can monitor data freshness and Supabase public status, but it cannot confirm restore points without separate management credentials.",
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("ops-platform-health error:", error);
    return new Response(JSON.stringify({
      error: error?.message || "Failed to load platform health.",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

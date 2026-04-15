import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { gingrFetchV1 } from "../_shared/gingr-operational-details.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function nowEtDate() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function normalizeReservationCollection(result: any): any[] {
  if (Array.isArray(result?.data)) return result.data;
  if (result?.data && typeof result.data === "object") return Object.values(result.data);
  if (Array.isArray(result)) return result;
  return [];
}

function normalizeText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value).trim();
  if (Array.isArray(value)) return value.map(normalizeText).filter(Boolean).join(" ");
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).map(normalizeText).filter(Boolean).join(" ");
  return "";
}

function buildStableId(parts: string[]) {
  const payload = parts.join("|");
  const bytes = new TextEncoder().encode(payload);
  return crypto.subtle.digest("SHA-256", bytes).then((hash) => {
    const digest = Array.from(new Uint8Array(hash)).slice(0, 10).map((byte) => byte.toString(16).padStart(2, "0")).join("");
    return `gingr_note_${digest}`;
  });
}

function buildSummary(entries: any[]) {
  const ownerCount = entries.filter((entry) => entry.note_source === "owner_note").length;
  const dogCount = entries.filter((entry) => entry.note_source === "dog_note").length;
  return {
    total: entries.length,
    owner_notes: ownerCount,
    dog_notes: dogCount,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { location_id, date = nowEtDate() } = await req.json().catch(() => ({}));
    if (!location_id) {
      return new Response(JSON.stringify({ error: "location_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: settingRow, error: settingError } = await sb
      .from("lite_settings")
      .select("setting_value")
      .eq("location_id", location_id)
      .eq("setting_key", "gingr_config")
      .maybeSingle();

    if (settingError) throw settingError;
    const gingrConfig = settingRow?.setting_value || {};
    if (!gingrConfig?.api_key || !gingrConfig?.subdomain) {
      return new Response(JSON.stringify({ error: "Gingr is not configured for this location." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const liveReservations = normalizeReservationCollection(
      await gingrFetchV1(
        { subdomain: String(gingrConfig.subdomain), apiKey: String(gingrConfig.api_key) },
        "reservations",
        "POST",
        { start_date: date, end_date: date },
      ),
    );

    const noteEntries: any[] = [];
    for (const reservation of liveReservations) {
      const reservationId = String(reservation?.reservation_id || "");
      const ownerId = String(reservation?.owner?.id || "");
      const animalId = String(reservation?.animal?.id || "");
      const ownerName = [normalizeText(reservation?.owner?.first_name), normalizeText(reservation?.owner?.last_name)].filter(Boolean).join(" ").trim();
      const dogName = normalizeText(reservation?.animal?.name) || "Dog";
      const notes = reservation?.notes || {};
      const ownerNote = normalizeText(notes?.owner_notes);
      const dogNote = normalizeText(notes?.animal_notes);

      if (ownerNote) {
        noteEntries.push({
          id: await buildStableId([String(location_id), date, "owner", ownerId, ownerNote]),
          note_source: "owner_note",
          subject_kind: "owner",
          subject_gingr_id: ownerId,
          subject_name: ownerName || "Owner",
          note_text: ownerNote,
          reservation_gingr_id: reservationId,
          dog_name: dogName,
          owner_name: ownerName,
          raw_data: reservation,
        });
      }

      if (dogNote) {
        noteEntries.push({
          id: await buildStableId([String(location_id), date, "dog", animalId, dogNote]),
          note_source: "dog_note",
          subject_kind: "dog",
          subject_gingr_id: animalId,
          subject_name: dogName,
          note_text: dogNote,
          reservation_gingr_id: reservationId,
          dog_name: dogName,
          owner_name: ownerName,
          raw_data: reservation,
        });
      }
    }

    const uniqueEntries = Array.from(new Map(noteEntries.map((entry) => [entry.id, entry])).values())
      .sort((left, right) => left.subject_name.localeCompare(right.subject_name));
    const payload = {
      refreshed_at: new Date().toISOString(),
      summary: buildSummary(uniqueEntries),
      entries: uniqueEntries,
    };

    const { error: upsertError } = await sb.from("lite_daily_ops").upsert({
      id: `ops_gingr_notes_${date}`,
      location_id,
      type: "report",
      type_sub: "gingr_notes",
      date,
      locked: false,
      items: {},
      computed_items: payload,
    }, { onConflict: "id" });

    if (upsertError) throw upsertError;

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("gingr-today-notes error:", error);
    return new Response(JSON.stringify({ error: error.message || "Failed to sync Gingr notes" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

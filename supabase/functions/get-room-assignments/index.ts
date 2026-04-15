// © 2026 K9 Operations LLC. All Rights Reserved.
// Supabase Edge Function: get-room-assignments
// Returns canonical room assignments from the shared room-occupancy model.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildRoomOccupancyLookup,
  fetchRoomOccupancySnapshotForDate,
  ROOM_OCCUPANCY_LODGING_CATEGORIES,
} from "../_shared/room-occupancy.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { date, location_id: locationId } = await req.json();
    if (!date || !locationId) {
      return new Response(JSON.stringify({ error: "date and location_id are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const entryId = `ops_room_occupancy_${date}`;
    let computedItems: any = null;
    const { data: existingRow } = await supabase
      .from("lite_daily_ops")
      .select("computed_items")
      .eq("id", entryId)
      .maybeSingle();
    computedItems = existingRow?.computed_items || null;

    if (!computedItems) {
      const snapshot = await fetchRoomOccupancySnapshotForDate({
        supabase,
        locationId,
        date,
        includeCategories: ROOM_OCCUPANCY_LODGING_CATEGORIES,
      });
      const lookup = buildRoomOccupancyLookup(snapshot);
      const rooms: Record<string, string> = {};
      const roomsByAnimalId: Record<string, string> = {};

      for (const entry of lookup.byReservationId.values()) {
        if (!entry.room_label) continue;
        const normalizedName = entry.animal_name.trim();
        if (normalizedName) {
          rooms[normalizedName] = entry.room_label;
          rooms[normalizedName.toLowerCase()] = entry.room_label;
        }
        if (entry.animal_id) {
          roomsByAnimalId[entry.animal_id] = entry.room_label;
        }
      }

      return new Response(
        JSON.stringify({
          date,
          location_id: locationId,
          rooms,
          rooms_by_animal_id: roomsByAnimalId,
          count: Object.keys(roomsByAnimalId).length,
          source: "shared_room_occupancy_helper",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const rooms: Record<string, string> = {};
    const roomsByAnimalId: Record<string, string> = {};
    for (const assignment of computedItems.assignments || []) {
      const roomLabel = String(assignment.room_label || "").trim();
      const animalName = String(assignment.animal_name || "").trim();
      const animalId = String(assignment.animal_id || "").trim();
      if (!roomLabel) continue;
      if (animalName) {
        rooms[animalName] = roomLabel;
        rooms[animalName.toLowerCase()] = roomLabel;
      }
      if (animalId) {
        roomsByAnimalId[animalId] = roomLabel;
      }
    }

    return new Response(
      JSON.stringify({
        date,
        location_id: locationId,
        rooms,
        rooms_by_animal_id: roomsByAnimalId,
        count: Object.keys(roomsByAnimalId).length,
        source: "lite_daily_ops.room_occupancy",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Failed to fetch room assignments", details: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

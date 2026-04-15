// ============================================================================
// Ops Reports Edge Function — K9 Operations Lite
// Handles MOD Roll Call, MOD Departing, and CSR Emergency Contact reports.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getRollCallWorkflowTitle,
  loadRollCallSessionRow,
  normalizeRollCallSession,
} from "../_shared/roll-call-logic.ts";
import {
  buildPlaygroupAssignmentMap,
  fetchPlaygroupAssignments,
  getCanonicalPlaygroupTags,
} from "../_shared/playgroup-assignments.ts";
import {
  buildRoomOccupancyLookup,
  fetchRoomOccupancySnapshotForDate,
  resolveRoomOccupancyLookupEntry,
} from "../_shared/room-occupancy.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ─── Gingr API helper (matches ops-compute pattern) ────────────────────────
async function gingrFetch(
  subdomain: string,
  apiKey: string,
  endpoint: string,
  method: "GET" | "POST" = "GET",
  body?: Record<string, string>,
): Promise<any> {
  const baseUrl = `https://${subdomain}.gingrapp.com/api/v1/${endpoint}`;
  let resp: Response;
  if (method === "POST") {
    const params = new URLSearchParams();
    params.append("key", apiKey);
    if (body) {
      for (const [k, v] of Object.entries(body)) params.append(k, v);
    }
    resp = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
      body: params.toString(),
    });
  } else {
    const sep = baseUrl.includes("?") ? "&" : "?";
    const params = new URLSearchParams({ key: apiKey });
    if (body) {
      for (const [k, v] of Object.entries(body)) params.append(k, v);
    }
    resp = await fetch(`${baseUrl}${sep}${params.toString()}`);
  }
  if (!resp.ok) throw new Error(`Gingr API error ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

// ─── Date helper (ET timezone) ─────────────────────────────────────────────
function todayET(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

async function fetchOwnersFromCacheOrGingr(
  supabase: any,
  ownerIds: string[],
  gingrSubdomain: string,
  gingrApiKey: string,
  cacheTtlHours: number = 24,
) {
  const uniqueOwnerIds = [...new Set(ownerIds.map(String).filter(Boolean))];
  if (uniqueOwnerIds.length === 0) return {};

  const cutoff = new Date(Date.now() - cacheTtlHours * 60 * 60 * 1000).toISOString();
  const { data: cachedOwners } = await supabase
    .from("gingr_owner_cache")
    .select("*")
    .in("owner_id", uniqueOwnerIds);

  const cachedMap: Record<string, any> = {};
  const staleIds: string[] = [];
  for (const row of cachedOwners || []) {
    if (row.fetched_at && row.fetched_at > cutoff) {
      cachedMap[row.owner_id] = row;
    } else {
      staleIds.push(row.owner_id);
    }
  }

  const missingIds = uniqueOwnerIds.filter((id) => !cachedMap[id] && !staleIds.includes(id));
  const toFetch = [...staleIds, ...missingIds];

  const BATCH_SIZE = 10;
  for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
    const batch = toFetch.slice(i, i + BATCH_SIZE);
    const fetches = batch.map(async (ownerId) => {
      try {
        const result = await gingrFetch(gingrSubdomain, gingrApiKey, "owner", "GET", { id: ownerId });
        const owner = result?.data || result;
        if (!owner) return;
        const emergencyContacts = Array.isArray(owner.emergency_contacts) ? owner.emergency_contacts : [];
        const primaryEmergency = emergencyContacts[0] || null;
        const row = {
          owner_id: ownerId,
          owner_name: [owner.first_name, owner.last_name].filter(Boolean).join(" "),
          phone: owner.cell_phone || owner.home_phone || "",
          email: owner.email || "",
          emergency_contact_name: primaryEmergency
            ? [primaryEmergency.first_name, primaryEmergency.last_name].filter(Boolean).join(" ")
            : (owner.emergency_contact_name || ""),
          emergency_contact_phone: primaryEmergency
            ? (primaryEmergency.cell_phone || primaryEmergency.home_phone || "")
            : (owner.emergency_contact_phone || ""),
          fetched_at: new Date().toISOString(),
        };
        await supabase.from("gingr_owner_cache").upsert(row, { onConflict: "owner_id" });
        cachedMap[ownerId] = row;
      } catch (err) {
        console.error(`Failed to fetch owner ${ownerId}:`, err);
      }
    });
    await Promise.all(fetches);
  }

  return cachedMap;
}

// ─── Parse animal_names from room occupancy ────────────────────────────────
function parseAnimalNames(animalNames: string): Array<{ dogName: string; ownerName: string }> {
  if (!animalNames) return [];
  const entries = animalNames.split(/<br\s*\/?>/i).map(e => e.trim()).filter(Boolean);
  const results: Array<{ dogName: string; ownerName: string }> = [];
  for (const entry of entries) {
    const parenGroups: string[] = [];
    const parenRe = /\(([^)]+)\)/g;
    let m;
    while ((m = parenRe.exec(entry)) !== null) parenGroups.push(m[1].trim());
    let dogName: string;
    let ownerName = "";
    if (parenGroups.length >= 1) {
      ownerName = parenGroups[parenGroups.length - 1];
      const lastParenIdx = entry.lastIndexOf(`(${ownerName})`);
      dogName = entry.substring(0, lastParenIdx).trim();
    } else {
      dogName = entry.trim();
    }
    if (dogName) results.push({ dogName, ownerName });
  }
  return results;
}

// ============================================================================
// REPORT 1: MOD Roll Call
// ============================================================================
async function modRollCall(
  supabase: any,
  locationId: string,
  date: string,
  sessionInput?: string,
) {
  const session = normalizeRollCallSession(sessionInput);
  const row = await loadRollCallSessionRow(supabase, locationId, date, session, {
    createIfMissing: date >= todayET(),
  });
  const computed = row?.computed_items || {
    summary: { session, totalRooms: 0, totalDogs: 0 },
    areas: [],
    rooms: [],
  };
  return {
    type: "mod_roll_call",
    session,
    title: getRollCallWorkflowTitle(session),
    date,
    totalRooms: computed.summary?.totalRooms || 0,
    totalDogs: computed.summary?.totalDogs || 0,
    areas: computed.areas || [],
    rooms: computed.rooms || [],
    items: row?.items || {},
    missingSnapshot: !row,
  };
}

// ============================================================================
// REPORT 2: MOD Departing
// ============================================================================
async function modDeparting(
  supabase: any,
  locationId: string,
  date: string,
  gingrSubdomain: string,
  gingrApiKey: string,
  gingrLocationId: string,
) {
  // Fetch BOH data for departures (omit location_id to get all; Gingr uses its own IDs)
  const bohResult = await gingrFetch(
    gingrSubdomain,
    gingrApiKey,
    `back_of_house?full_day=true`,
    "GET",
  );
  const bohData = bohResult?.data || bohResult;
  const checkingOut = bohData?.checking_out || [];

  const roomOccupancySnapshot = await fetchRoomOccupancySnapshotForDate({
    supabase,
    locationId,
    date,
    includeCategories: ["boarding", "day_boarding", "daycare", "evaluation"],
  });
  const roomLookup = buildRoomOccupancyLookup(roomOccupancySnapshot);

  // Get bathing data from lite_daily_ops
  const bathingId = `ops_bathing_${date}`;
  const { data: bathingOps } = await supabase
    .from("lite_daily_ops")
    .select("computed_items, items")
    .eq("id", bathingId)
    .maybeSingle();

  const bathItems = bathingOps?.computed_items?.dogs || bathingOps?.items?.dogs || [];
  const bathStatusMap: Record<string, string> = {};
  for (const b of bathItems) {
    const name = (b.name || b.dogName || "").toLowerCase();
    if (name) {
      bathStatusMap[name] = b.completed ? "completed" : b.suggested ? "suggested" : "none";
    }
  }

  // Filter to boarding-only departures (exclude daycare)
  const boardingDepartures = checkingOut.filter((dog: any) => {
    const t = (dog.type || "").toLowerCase();
    return !t.includes("daycare");
  });

  // Collect animal IDs and owner IDs for batch lookups
  const animalIds = boardingDepartures.map((d: any) => String(d.animal_id || d.id || "")).filter(Boolean);
  const ownerIds = [...new Set(boardingDepartures.map((d: any) => String(d.owner_id || "")).filter(Boolean))];

  // Batch fetch: profile photos, canonical playgroup assignments, and owner full names
  const [{ data: animalPhotos }, playAssignments, { data: ownerRows }] = await Promise.all([
    animalIds.length > 0
      ? supabase.from("gingr_animals").select("gingr_id, image_url, local_photo_url").in("gingr_id", animalIds)
      : { data: [] },
    animalIds.length > 0
      ? fetchPlaygroupAssignments({
          supabase,
          locationId,
          animalIds,
          columns: "animal_gingr_id, playgroup_tags, is_half_and_half",
        })
      : Promise.resolve([]),
    ownerIds.length > 0
      ? supabase.from("gingr_owner_cache").select("owner_id, owner_name").in("owner_id", ownerIds)
      : { data: [] },
  ]);

  // Fetch missing owners from Gingr API and cache them
  const cachedOwnerIds = new Set((ownerRows || []).map((o: any) => o.owner_id));
  const missingOwnerIds = ownerIds.filter(id => !cachedOwnerIds.has(id));
  const freshOwnerRows: any[] = [];
  for (let i = 0; i < missingOwnerIds.length; i += 5) {
    const batch = missingOwnerIds.slice(i, i + 5);
    const fetches = batch.map(async (ownerId: string) => {
      try {
        const result = await gingrFetch(gingrSubdomain, gingrApiKey, "owner", "GET", { id: ownerId });
        const owner = result?.data || result;
        if (owner) {
          const fullName = [owner.first_name, owner.last_name].filter(Boolean).join(" ");
          await supabase.from("gingr_owner_cache").upsert({
            owner_id: ownerId,
            owner_name: fullName,
            phone: owner.cell_phone || owner.home_phone || "",
            email: owner.email || "",
            emergency_contact_name: owner.emergency_contact_name || "",
            emergency_contact_phone: owner.emergency_contact_phone || "",
            fetched_at: new Date().toISOString(),
          }, { onConflict: "owner_id" });
          freshOwnerRows.push({ owner_id: ownerId, owner_name: fullName });
        }
      } catch { /* skip */ }
    });
    await Promise.all(fetches);
  }

  const photoMap: Record<string, string> = {};
  for (const a of animalPhotos || []) {
    photoMap[a.gingr_id] = a.local_photo_url || a.image_url || "";
  }

  const playgroupMap = buildPlaygroupAssignmentMap(playAssignments || []);
  const playIconMap: Record<string, string[]> = {};
  for (const [animalId, assignment] of playgroupMap.entries()) {
    playIconMap[animalId] = getCanonicalPlaygroupTags(assignment, { includeHalfAndHalf: true });
  }

  const ownerNameMap: Record<string, string> = {};
  for (const o of [...(ownerRows || []), ...freshOwnerRows]) {
    ownerNameMap[o.owner_id] = o.owner_name || "";
  }

  const departures = boardingDepartures.map((dog: any) => {
    // BOH fields: a_first (dog name), o_last (owner last), breed_name, type, run_name, area_name
    const dogName = dog.a_first || dog.animal_name || dog.name || "";
    const ownerLast = dog.o_last || "";
    const animalId = String(dog.animal_id || dog.id || "");
    const ownerId = String(dog.owner_id || "");
    // Use room from BOH first, fall back to occupancy lookup
    const bohRoom = dog.run_name || "";
    const bohArea = dog.area_name || "";
    const roomEntry = resolveRoomOccupancyLookupEntry(roomLookup, {
      animalId,
      animalName: dogName,
      ownerLastName: ownerLast,
    });
    const roomInfo = roomEntry?.room_label
      ? { runName: roomEntry.room_label, areaName: roomEntry.area_name || "" }
      : bohRoom
        ? { runName: bohRoom, areaName: bohArea }
        : { runName: "", areaName: "" };
    const bathStatus = bathStatusMap[dogName.toLowerCase()] || "none";

    // Convert unix timestamps to readable dates
    const startTs = dog.start_date ? Number(dog.start_date) : 0;
    const endTs = dog.end_date ? Number(dog.end_date) : 0;
    const fmtTs = (ts: number) => ts ? new Date(ts * 1000).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";

    // Date range: "Apr 6 – Apr 9"
    const fmtDate = (ts: number) => ts ? new Date(ts * 1000).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" }) : "";
    const dateRange = startTs && endTs ? `${fmtDate(startTs)} – ${fmtDate(endTs)}` : "";

    return {
      dogName,
      breed: dog.breed_name || "",
      ownerName: ownerLast,
      ownerFullName: ownerNameMap[ownerId] || ownerLast,
      ownerPhone: "",
      profilePhotoUrl: photoMap[animalId] || "",
      playGroupIcons: playIconMap[animalId] || [],
      dateRange,
      room: roomInfo.runName,
      area: roomInfo.areaName,
      reservationType: dog.type || "",
      startDate: fmtTs(startTs),
      endDate: fmtTs(endTs),
      checkoutTime: fmtTs(endTs),
      belongingCount: parseInt(dog.belonging_count || "0", 10),
      belongingArea: dog.belonging_area || "",
      notes: "",
      bathStatus,
      animalId,
      ownerId,
      statusString: dog.status_string || "",
    };
  });

  // Sort by room then dog name
  departures.sort((a: any, b: any) => {
    if (a.room && b.room) return a.room.localeCompare(b.room, undefined, { numeric: true });
    if (a.room) return -1;
    if (b.room) return 1;
    return a.dogName.localeCompare(b.dogName);
  });

  return {
    type: "mod_departing",
    date,
    totalDepartures: departures.length,
    departures,
  };
}

// ============================================================================
// REPORT 3: CSR Emergency Contact Verification
// ============================================================================
async function csrEmergencyContact(
  supabase: any,
  locationId: string,
  date: string,
  gingrSubdomain: string,
  gingrApiKey: string,
  gingrLocationId: string,
) {
  // Get all in-house animals from BOH (include daycare)
  const bohResult = await gingrFetch(
    gingrSubdomain,
    gingrApiKey,
    `back_of_house?full_day=true&include_daycare=true`,
    "GET",
  );
  const bohData = bohResult?.data || bohResult;
  // All in-house dogs are in checking_out (currently here) + checking_in that are checked in
  const allInHouse = [...(bohData?.checking_out || [])];
  // Also include checking_in dogs that are already checked in (status_id indicates checked in)
  for (const dog of bohData?.checking_in || []) {
    if (dog.check_in_stamp) allInHouse.push(dog);
  }

  // Collect unique owner IDs
  const ownerMap: Record<string, { ownerName: string; dogs: any[] }> = {};
  for (const dog of allInHouse) {
    const ownerId = String(dog.owner_id || "");
    if (!ownerId) continue;
    if (!ownerMap[ownerId]) {
      ownerMap[ownerId] = {
        ownerName: dog.o_last || "",
        dogs: [],
      };
    }
    ownerMap[ownerId].dogs.push({
      dogName: dog.a_first || dog.animal_name || "",
      reservationType: dog.type || "",
      animalId: String(dog.animal_id || dog.id || ""),
    });
  }

  const ownerIds = Object.keys(ownerMap);
  const cachedMap = await fetchOwnersFromCacheOrGingr(supabase, ownerIds, gingrSubdomain, gingrApiKey);

  // Fetch profile photos for all animals
  const allAnimalIds = allInHouse.map((d: any) => String(d.animal_id || d.id || "")).filter(Boolean);
  const { data: animalPhotos } = await supabase
    .from("gingr_animals")
    .select("gingr_id, image_url, local_photo_url")
    .in("gingr_id", allAnimalIds);
  const photoMap: Record<string, string> = {};
  for (const a of animalPhotos || []) {
    photoMap[a.gingr_id] = a.local_photo_url || a.image_url || "";
  }

  // Build result
  const dogs: any[] = [];
  let withContact = 0;
  let withoutContact = 0;

  for (const [ownerId, info] of Object.entries(ownerMap)) {
    const ownerCache = cachedMap[ownerId];
    const ecName = ownerCache?.emergency_contact_name || "";
    const ecPhone = ownerCache?.emergency_contact_phone || "";
    const hasEC = !!(ecName && ecPhone);
    const ownerFullName = ownerCache?.owner_name || info.ownerName;

    for (const dog of info.dogs) {
      dogs.push({
        dogName: dog.dogName,
        animalId: dog.animalId,
        reservationType: dog.reservationType,
        ownerName: info.ownerName,
        ownerFullName,
        ownerId,
        ownerPhone: ownerCache?.phone || "",
        ownerEmail: ownerCache?.email || "",
        profilePhotoUrl: photoMap[dog.animalId] || "",
        emergencyContactName: ecName,
        emergencyContactPhone: ecPhone,
        additionalOwnerName: ecName,
        additionalOwnerPhone: ecPhone,
        hasEmergencyContact: hasEC,
      });
      if (hasEC) withContact++;
      else withoutContact++;
    }
  }

  // Sort: missing contacts first, then alphabetical by dog name
  dogs.sort((a: any, b: any) => {
    if (a.hasEmergencyContact !== b.hasEmergencyContact) return a.hasEmergencyContact ? 1 : -1;
    return a.dogName.localeCompare(b.dogName);
  });

  const total = dogs.length;
  const pct = total > 0 ? Math.round((withContact / total) * 100) : 0;

  return {
    type: "csr_emergency",
    date,
    totalDogs: total,
    withContact,
    withoutContact,
    contactPercentage: pct,
    dogs,
  };
}

async function ownerLookup(
  supabase: any,
  ownerIds: string[],
  gingrSubdomain: string,
  gingrApiKey: string,
) {
  const ownerMap = await fetchOwnersFromCacheOrGingr(supabase, ownerIds, gingrSubdomain, gingrApiKey);
  const owners = ownerIds
    .map((ownerId) => ownerMap[String(ownerId)])
    .filter(Boolean);

  return {
    type: "owner_lookup",
    ownerCount: owners.length,
    owners,
  };
}

// ============================================================================
// Main Handler
// ============================================================================
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      type,
      location_id: locationId,
      date: dateOverride,
      owner_ids: ownerIdsRaw,
      session: sessionInput,
    } = body;

    if (!locationId) {
      return new Response(
        JSON.stringify({ error: "location_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!type || !["mod_roll_call", "mod_departing", "csr_emergency", "owner_lookup"].includes(type)) {
      return new Response(
        JSON.stringify({ error: "type must be mod_roll_call, mod_departing, csr_emergency, or owner_lookup" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const date = dateOverride || todayET();
    const ownerIds = Array.isArray(ownerIdsRaw) ? ownerIdsRaw.map(String).filter(Boolean) : [];
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let result: any;
    switch (type) {
      case "mod_roll_call":
        result = await modRollCall(supabase, locationId, date, sessionInput);
        break;
      case "mod_departing":
      case "csr_emergency":
      case "owner_lookup": {
        // Load Gingr credentials only for report types that still need live Gingr access.
        const { data: settingsRows } = await supabase
          .from("lite_settings")
          .select("setting_value")
          .eq("location_id", locationId)
          .eq("setting_key", "gingr_config")
          .limit(1);

        const gingrConfig = settingsRows?.[0]?.setting_value;
        let gingrSubdomain: string;
        let gingrApiKey: string;
        let gingrLocationId: string;

        if (gingrConfig?.api_key && gingrConfig?.subdomain) {
          gingrSubdomain = gingrConfig.subdomain;
          gingrApiKey = gingrConfig.api_key;
          gingrLocationId = gingrConfig.gingr_location_id || "1";
        } else {
          const { data: creds } = await supabase
            .from("k9_gingr_credentials")
            .select("gingr_subdomain, gingr_api_key, gingr_location_id")
            .eq("location_id", locationId)
            .maybeSingle();

          if (!creds) {
            return new Response(
              JSON.stringify({ error: "No Gingr credentials found for location" }),
              { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }
          gingrSubdomain = creds.gingr_subdomain;
          gingrApiKey = creds.gingr_api_key;
          gingrLocationId = creds.gingr_location_id || "1";
        }

        if (type === "mod_departing") {
          result = await modDeparting(supabase, locationId, date, gingrSubdomain, gingrApiKey, gingrLocationId);
        } else if (type === "csr_emergency") {
          result = await csrEmergencyContact(supabase, locationId, date, gingrSubdomain, gingrApiKey, gingrLocationId);
        } else {
          if (ownerIds.length === 0) {
            return new Response(
              JSON.stringify({ error: "owner_ids is required for owner_lookup" }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }
          result = await ownerLookup(supabase, ownerIds, gingrSubdomain, gingrApiKey);
        }
        break;
      }
    }

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("ops-reports error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

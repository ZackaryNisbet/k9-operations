// K9 Operations — Gingr Data Hook (Supabase + Gingr Sync)

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "../supabaseClient";
import { C, OPERATIONS_CATALOG, idbGet, idbSet, IDB_VERSION, todayStr, addDays, LITE_DEF_PRICING, DEF_OPENING_TEMPLATE, DEF_FE_TEMPLATE, DEF_BE_TEMPLATE, DEF_CLOSING_TEMPLATE, LEAN_ROLES, ROOM_TYPES } from "../shared/theme";
import { classifyReservationType, classifyReservationStatus, extractRoomFromType } from "../shared/opsHelpers";

function useGingrData(locationId) {
  const [clients, setClients] = useState([]);
  const [dogs, setDogs] = useState([]);
  const [reservations, setReservations] = useState(null);
  const [rooms, setRooms] = useState({});
  const [resTypes, setResTypes] = useState([]);
  const [immunizationTypes, setImmunizationTypes] = useState([]);
  const [syncState, setSyncState] = useState(null);
  const [serverStats, setServerStats] = useState(null); // RPC-computed client stats
  const [loading, setLoading] = useState(false);
  const hasLoadedOnce = useRef(false);
  const [error, setError] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState(null);

  // ── Restore cached data instantly on mount (zero network wait) ──
  const cacheRestored = useRef(false);
  useEffect(() => {
    if (!locationId || cacheRestored.current) return;
    cacheRestored.current = true;
    idbGet(`data_v2_${locationId}`).then(cached => {
      if (cached && !hasLoadedOnce.current) {
        if (cached.clients) setClients(cached.clients);
        if (cached.dogs) setDogs(cached.dogs);
        if (cached.serverStats) setServerStats(cached.serverStats);
        if (cached.resTypes) setResTypes(cached.resTypes);
        if (cached.immunizationTypes) setImmunizationTypes(cached.immunizationTypes);
      }
    });
  }, [locationId]);
  const refreshTimerRef = useRef(null);

  // ── Transform Gingr owners → Lite client shape ──
  const transformOwners = useCallback((owners) => {
    return owners.map(o => ({
      id: `g${o.gingr_id}`,
      gingrId: o.gingr_id,
      _rawGingrDbId: o.id, // gingr_owners.id (BIGSERIAL PK) — used for lite_client dedup linking
      createdAt: o.owner_created_at || "2019-10-14T00:00:00", // legacy clients pre-date Gingr tracking
      source: "online",
      sourceData: null,
      fields: {
        phone: (o.cell_phone || o.home_phone || "").replace(/\D/g, ""),
        first_name: (o.first_name || "").trim(),
        last_name: (o.last_name || "").trim(),
        email: o.email || "",
      },
      lifecycleLog: [],
      bookingDrafts: [],
      igniteData: null,
      coldMarkedAt: null,
      revivedAt: null,
      discountUsage: [],
      _lastReservation: o.last_reservation,
      _nextReservation: o.next_reservation,
      _numReservations: o.number_reservations || 0,
      _balance: o.current_balance,
      _animalNames: o.animal_names,
      _emergencyContact: o.emergency_contact_name,
      _emergencyPhone: o.emergency_contact_phone,
      _address: [o.address_1, o.address_2, o.city, o.state, o.zip].filter(Boolean).join(", "),
    }));
  }, []);

  // ── Transform Gingr animals → Lite dog shape ──
  const transformAnimals = useCallback((animals) => {
    return animals.map(a => {
      const bday = a.birthday ? new Date(a.birthday * 1000) : null;
      const ageYears = bday ? Math.floor((Date.now() - bday.getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : null;
      return {
        id: `g${a.gingr_id}`,
        gingrId: a.gingr_id,
        clientId: `g${a.owner_gingr_id}`,
        fields: {
          name: a.name || "Unknown",
          breed: a.breed_name || "",
          age: ageYears !== null ? String(ageYears) : "",
          weight: a.weight || "",
          spayed_neutered: a.fixed || false,
        },
        _image: a.image_url,
        _gender: a.gender,
        _vip: a.vip,
        _banned: a.banned,
        _medicines: a.medicines,
        _allergies: a.allergies,
        _notes: a.notes,
        _groomingNotes: a.grooming_notes,
        _nextImm: a.next_immunization_expiration,
      };
    });
  }, []);

  // ── Transform Gingr reservations → Lite reservation shape ──
  const transformReservations = useCallback((gRes) => {
    return gRes
      .filter(r => !r.cancelled_date) // exclude cancelled
      .map(r => {
        const type = classifyReservationType(r.reservation_type_name);
        const status = classifyReservationStatus(r);
        const startD = r.start_date ? r.start_date.split("T")[0] : todayStr();
        const endD = r.end_date ? r.end_date.split("T")[0] : startD;
        const roomType = extractRoomFromType(r.reservation_type_name);
        const price = r.transaction?.price || r.deposit?.amount || 0;

        return {
          id: `g${r.gingr_id}`,
          gingrId: r.gingr_id,
          clientId: r.owner_gingr_id ? `g${r.owner_gingr_id}` : null,
          dogIds: r.animal_gingr_id ? [`g${r.animal_gingr_id}`] : [],
          dogId: r.animal_gingr_id ? `g${r.animal_gingr_id}` : null,
          type,
          checkIn: startD,
          checkOut: endD,
          checkOutTime: r.check_out_date ? r.check_out_date.split("T")[1]?.slice(0, 5) : null,
          scheduledCheckOutTime: r.end_date ? r.end_date.split("T")[1]?.slice(0, 5) : null,
          status,
          pricing: { total: typeof price === "number" ? price : parseFloat(price) || 0 },
          room: null, // assigned later by assignRoomsIntelligently()
          roomType: roomType, // preserve for room assignment
          _resTypeName: r.reservation_type_name,
          _resTypeId: r.reservation_type_id,
          _services: r.services,
          _animalName: r.animal_name,
          _ownerName: [r.owner_first_name, r.owner_last_name].filter(Boolean).join(" "),
          _notes: r.notes_reservation,
        };
      });
  }, []);

  // ── Intelligent Room Assignment ──
  // Distributes boarding reservations across available rooms by type.
  // Uses greedy interval scheduling: sort by check-in, assign to first non-overlapping room.
  const assignRoomsIntelligently = useCallback((reservations, roomsMap) => {
    if (!reservations || reservations.length === 0) return reservations;
    const boarding = reservations.filter(r => r.type === "boarding" && r.roomType);
    const rest = reservations.filter(r => r.type !== "boarding" || !r.roomType);
    // Group by room type
    const byType = {};
    boarding.forEach(r => {
      if (!byType[r.roomType]) byType[r.roomType] = [];
      byType[r.roomType].push(r);
    });
    const assigned = [];
    Object.entries(byType).forEach(([roomType, group]) => {
      const rooms = roomsMap[roomType] || [];
      if (rooms.length === 0) { group.forEach(r => assigned.push(r)); return; }
      // Sort by check-in date, then ID for stability
      group.sort((a, b) => (a.checkIn || "").localeCompare(b.checkIn || "") || (a.id || "").localeCompare(b.id || ""));
      // Track occupancy per room: array of {checkIn, checkOut}
      const occ = {};
      rooms.forEach(rm => { occ[rm] = []; });
      group.forEach(r => {
        let picked = null;
        for (const rm of rooms) {
          const overlap = occ[rm].some(o => o.checkIn < r.checkOut && r.checkIn < o.checkOut);
          if (!overlap) { picked = rm; break; }
        }
        if (!picked) picked = rooms[0]; // overflow fallback
        occ[picked].push({ checkIn: r.checkIn, checkOut: r.checkOut });
        assigned.push({ ...r, room: picked });
      });
    });
    return [...rest, ...assigned];
  }, []);

  // ── Build rooms from synced reservation types ──
  // Derives room type names from gingr_reservation_types where capacity_by_lodging=1
  // Room counts come from lite_settings "room_counts" config, with sensible defaults
  // Returns arrays of room name strings (matching POS format) e.g. { "Luxury Suite": ["Luxury Suite 1", ...] }
  const [roomCountConfig, setRoomCountConfig] = useState(null);

  const buildRooms = useCallback((resTypes, reservations, roomCounts, roomNames) => {
    const roomMap = {};
    // Extract boarding room types from synced gingr_reservation_types
    // Filter out single_day types (like Day Boarding) — they don't use overnight rooms
    const boardingTypes = (resTypes || []).filter(rt => {
      const raw = rt.raw_data || {};
      const hasLodging = raw.capacity_by_lodging === "1" || raw.capacity_by_lodging === 1;
      const isSingleDay = raw.single_day === "1" || raw.single_day === 1;
      return hasLodging && !isSingleDay;
    });
    // Extract clean room type name from "Boarding | Luxury Suite (All Inclusive)" → "Luxury Suite"
    const extractRoomTypeName = (name) => {
      if (!name) return null;
      let clean = name.replace(/^Boarding\s*\|\s*/i, "").replace(/\s*\(All Inclusive\)\s*$/i, "").trim();
      return clean || null;
    };

    // Default room counts per type (used when no room_names config is saved)
    const defaultCounts = { "Luxury Suite": 4, "Executive Room": 6, "Double Compartment": 8, "Single Compartment": 10 };
    const counts = roomCounts || {};
    const names = roomNames || {};

    // If room_names config exists, use actual room names from config
    const useNames = Object.keys(names).length > 0;

    if (useNames) {
      // Use configured room names (actual Gingr room names)
      Object.entries(names).forEach(([typeName, nameList]) => {
        if (Array.isArray(nameList) && nameList.length > 0) {
          roomMap[typeName] = [...nameList];
        }
      });
    } else if (boardingTypes.length > 0) {
      // Fallback: generate numbered rooms from reservation types + counts
      boardingTypes.forEach(bt => {
        const typeName = extractRoomTypeName(bt.name || bt.type_label);
        if (!typeName) return;
        const count = counts[typeName] ?? defaultCounts[typeName] ?? 6;
        roomMap[typeName] = [];
        for (let i = 1; i <= count; i++) {
          roomMap[typeName].push(`${typeName} ${i}`);
        }
      });
    } else {
      // Final fallback: hardcoded ROOM_TYPES
      ROOM_TYPES.forEach(rt => {
        const count = counts[rt] ?? defaultCounts[rt] ?? 6;
        roomMap[rt] = [];
        for (let i = 1; i <= count; i++) {
          roomMap[rt].push(`${rt} ${i}`);
        }
      });
    }
    return roomMap;
  }, []);

  // ── Paginated fetch helper (Supabase default limit is 1000) ──
  const fetchAll = useCallback(async (table, locationId, orderCol, ascending = true, selectCols = "*") => {
    const PAGE = 1000;
    const PARALLEL = 10;
    // First fetch to get total feel
    const { data: first, error: firstErr, count } = await supabase
      .from(table)
      .select(selectCols, { count: "exact", head: false })
      .eq("location_id", locationId)
      .order(orderCol, { ascending })
      .range(0, PAGE - 1);
    if (firstErr) throw firstErr;
    if (!first || first.length === 0) return [];
    if (first.length < PAGE) return first;
    // We know total count — fire all remaining pages in parallel
    const total = count || first.length;
    const remaining = [];
    for (let from = PAGE; from < total; from += PAGE) {
      remaining.push(
        supabase
          .from(table)
          .select(selectCols)
          .eq("location_id", locationId)
          .order(orderCol, { ascending })
          .range(from, from + PAGE - 1)
      );
    }
    // Execute in parallel batches
    let allRows = [...first];
    for (let i = 0; i < remaining.length; i += PARALLEL) {
      const batch = remaining.slice(i, i + PARALLEL);
      const results = await Promise.all(batch);
      for (const r of results) {
        if (r.error) throw r.error;
        if (r.data) allRows = allRows.concat(r.data);
      }
    }
    return allRows;
  }, []);

  // ── Load all data from Supabase ──
  // Phase 1: owners, animals, RPC stats (fast — renders lifecycle page instantly)
  // Phase 2: reservations loaded in background (needed for ops hub, client detail)
  const loadData = useCallback(async () => {
    if (!locationId) return;
    try {
      setError(null);

      // Phase 1: Fast fetch — everything the lifecycle page needs
      const [rawOwners, rawAnimals, statsRes, typesRes, immTypesRes, syncRes, roomCountRes, roomNamesRes, lcRes, liteClientsRes] = await Promise.all([
        fetchAll("gingr_owners", locationId, "last_name"),
        fetchAll("gingr_animals", locationId, "name"),
        supabase.rpc("get_client_stats", { p_location_id: locationId }),
        supabase.from("gingr_reservation_types").select("*").eq("location_id", locationId),
        supabase.from("gingr_immunization_types").select("*").eq("location_id", locationId),
        supabase.from("gingr_sync_state").select("*").eq("location_id", locationId),
        supabase.from("lite_settings").select("setting_value").eq("location_id", locationId).eq("setting_key", "room_counts").maybeSingle(),
        supabase.from("lite_settings").select("setting_value").eq("location_id", locationId).eq("setting_key", "room_names").maybeSingle(),
        supabase.from("lite_client_lifecycle").select("gingr_id,lifecycle_data").eq("location_id", locationId),
        supabase.from("lite_clients").select("*").eq("location_id", locationId),
      ]);

      const roomCounts = roomCountRes?.data?.setting_value || null;
      const roomNames = roomNamesRes?.data?.setting_value || null;
      if (roomCounts) setRoomCountConfig(roomCounts);

      // Build server stats lookup: owner_gingr_id → stats
      const sMap = {};
      (statsRes.data || []).forEach(s => { sMap[s.owner_gingr_id] = s; });
      setServerStats(sMap);

      // Build lifecycle lookup: gingr_id → lifecycle_data
      const lcMap = {};
      (lcRes.data || []).forEach(r => { lcMap[r.gingr_id] = r.lifecycle_data; });

      const tClients = transformOwners(rawOwners);
      const tDogs = transformAnimals(rawAnimals);
      // Merge persisted lifecycle data onto clients (loaded from lite_client_lifecycle)
      tClients.forEach(c => {
        const lc = lcMap[String(c.gingrId)];
        if (lc) c.lifecycle = lc;
      });

      // ── Lite clients: transform, dedup, merge ──
      const rawLiteClients = liteClientsRes?.data || [];
      // Build phone lookup from Gingr clients for dedup
      const gingrPhoneMap = {};
      tClients.forEach(c => {
        const ph = (c.fields.phone || "").replace(/\D/g, "");
        if (ph) gingrPhoneMap[ph] = c;
      });
      // Phone-match: link unlinked lite clients to Gingr records
      const toLink = [];
      rawLiteClients.forEach(lc => {
        if (lc.gingr_owner_id) return; // already linked
        const ph = (lc.phone || "").replace(/\D/g, "");
        if (ph && gingrPhoneMap[ph]) {
          toLink.push({ id: lc.id, gingr_owner_id: gingrPhoneMap[ph]._rawGingrDbId || null, phone: ph });
          lc._matched = true;
          // Merge lifecycle_data from lite client onto Gingr client
          const gClient = gingrPhoneMap[ph];
          if (lc.lifecycle_data && Object.keys(lc.lifecycle_data).length > 0 && !gClient.lifecycle) {
            gClient.lifecycle = lc.lifecycle_data;
          }
          // Carry over source info
          if (lc.source && lc.source !== "manual") {
            gClient._liteSource = lc.source;
            gClient._liteSourceDate = lc.source_date;
            gClient._liteClientId = lc.id;
          }
        }
      });
      // Persist phone-match links in background
      if (toLink.length > 0) {
        toLink.forEach(({ id, gingr_owner_id }) => {
          if (gingr_owner_id) {
            supabase.from("lite_clients").update({ gingr_owner_id }).eq("id", id).then(({ error }) => {
              if (error) console.log("[K9 Lite] Lite client link error:", error.message);
            });
          }
        });
      }
      // ── Fetch ignite_leads data to enrich lite clients ──
      const igniteLeadIds = rawLiteClients.filter(lc => lc.ignite_lead_id && !lc.gingr_owner_id && !lc._matched).map(lc => lc.ignite_lead_id);
      let igniteLeadsMap = {};
      if (igniteLeadIds.length > 0) {
        const { data: igLeads } = await supabase
          .from("ignite_leads")
          .select("id, lead_type, first_name, last_name, email, phone, source_detail, call_recording_url, form_data, ignite_profile_id, match_status, created_at")
          .in("id", igniteLeadIds);
        (igLeads || []).forEach(il => { igniteLeadsMap[il.id] = il; });
      }

      // Transform remaining unlinked lite clients into client shape
      const liteClientRecords = rawLiteClients
        .filter(lc => !lc.gingr_owner_id && !lc._matched)
        .filter(lc => {
          // Filter out empty Ignite leads with no usable data
          const hasName = (lc.first_name || "").trim() || (lc.last_name || "").trim();
          const hasPhone = (lc.phone || "").trim();
          const hasEmail = (lc.email || "").trim();
          // For ignite leads, also check if the ignite_lead has form_data with name/phone/email
          if (!hasName && !hasPhone && !hasEmail && lc.ignite_lead_id) {
            const il = igniteLeadsMap[lc.ignite_lead_id];
            if (il) {
              const fd = il.form_data || {};
              const fdName = (fd.first_name || "") + (fd.last_name || "");
              const fdPhone = fd.phone || "";
              const fdEmail = fd.email || fd.email_address || "";
              if (!fdName.trim() && !fdPhone.trim() && !fdEmail.trim()) return false;
              // Backfill lite_client fields from form_data (in memory only)
              if (fd.first_name) lc.first_name = fd.first_name;
              if (fd.last_name) lc.last_name = fd.last_name;
              if (fd.phone) lc.phone = fd.phone;
              if (fd.email || fd.email_address) lc.email = fd.email || fd.email_address;
            } else {
              return false; // No ignite lead data at all — filter out
            }
          }
          if (!hasName && !hasPhone && !hasEmail && !lc.ignite_lead_id) return true; // Manual leads always show
          return true;
        })
        .map(lc => {
          // Build enriched igniteData from the actual ignite_leads table
          let igniteData = null;
          if (lc.ignite_lead_id) {
            const il = igniteLeadsMap[lc.ignite_lead_id];
            if (il) {
              const fd = il.form_data || {};
              igniteData = {
                leadId: lc.ignite_lead_id,
                leadType: il.lead_type,
                source: il.source_detail,
                firstName: il.first_name || fd.first_name || null,
                lastName: il.last_name || fd.last_name || null,
                callerName: fd.caller_name || null,
                email: il.email || fd.email || fd.email_address || null,
                phone: il.phone || fd.phone || null,
                trackingNumber: fd.tracking_number || null,
                callDuration: fd.call_duration || null,
                callStatus: fd.answer_status || null,
                zip: fd.zip || fd.zip_code || null,
                city: fd.city || null,
                state: fd.state || null,
                callRecordingUrl: il.call_recording_url || null,
                callTranscription: fd.call_transcription || null,
                igniteProfileId: il.ignite_profile_id || null,
                igniteLeadId: fd.ignite_lead_id || null,
                // Web form specific
                bookingTitle: fd.booking_title || null,
                petName: fd.pet_name || null,
                services: fd.services || null,
                salesValue: fd.sales_value || null,
                dates: fd.dates || null,
                leadPage: fd.lead_page_url || null,
                landingPage: fd.landing_page_url || null,
                details: fd.details || null,
                formName: fd.form_name || null,
                desiredService: fd.desired_service || null,
                desiredDate: fd.desired_date_of_boarding_or_day_care || null,
                createdAt: il.created_at,
              };
            } else {
              igniteData = { leadId: lc.ignite_lead_id };
            }
          }
          return {
            id: `lc_${lc.id}`,
            gingrId: null,
            createdAt: lc.created_at || new Date().toISOString(),
            source: lc.source || "manual",
            sourceData: { sourceDate: lc.source_date, igniteLeadId: lc.ignite_lead_id },
            isLiteClient: true,
            liteClientId: lc.id,
            fields: {
              phone: (lc.phone || "").replace(/\D/g, ""),
              first_name: (lc.first_name || "").trim(),
              last_name: (lc.last_name || "").trim(),
              email: lc.email || "",
            },
            lifecycle: lc.lifecycle_data && Object.keys(lc.lifecycle_data).length > 0 ? lc.lifecycle_data : null,
            lifecycleLog: [],
            bookingDrafts: [],
            igniteData,
            coldMarkedAt: null,
            revivedAt: null,
            discountUsage: [],
            _lastReservation: null,
            _nextReservation: null,
            _numReservations: 0,
            _balance: 0,
            _animalNames: null,
            _emergencyContact: null,
            _emergencyPhone: null,
            _address: null,
            _notes: lc.notes || "",
          };
        });
      // Append lite clients to Gingr clients
      tClients.push(...liteClientRecords);

      // Auto-set follow-up for NEW clients that arrived after the initial DB seed
      const newClientsNeedingLC = tClients.filter(c => !c.lifecycle && c.createdAt);
      if (newClientsNeedingLC.length > 0) {
        const rows = newClientsNeedingLC.map(c => {
          const fuDate = new Date(c.createdAt.split("T")[0] + "T12:00:00");
          fuDate.setDate(fuDate.getDate() + 1);
          const lc = {
            conversion: { notes: "", followUpDate: fuDate.toISOString().split("T")[0], updates: [], source: "", sourceDate: "", sourceReservationId: "" },
            retention: { notes: "", followUpDate: "", updates: [] },
            cold: false, coldDate: "", coldFrom: "",
          };
          c.lifecycle = lc;
          return { location_id: locationId, gingr_id: String(c.gingrId), lifecycle_data: lc, updated_at: new Date().toISOString() };
        });
        supabase.from("lite_client_lifecycle").upsert(rows, { onConflict: "location_id,gingr_id" }).then(({ error }) => {
          if (error) console.log("[K9 Lite] New client lifecycle seed error:", error.message);
        });
      }

      // Auto-set retention follow-up dates for clients missing one
      // Lapse date = last_res_date + threshold (90 daycare / 180 boarding-heavy)
      // Mirrors leads follow-up logic: computed once, persisted to Postgres
      const lapsedNeedingFU = tClients.filter(c => {
        if (c.lifecycle?.retention?.followUpDate) return false; // already set
        const gingrId = String(c.gingrId);
        const srv = sMap[gingrId];
        if (!srv?.last_res_date || !srv.has_real_booking) return false;
        if (srv.has_upcoming) return false; // active, not lapsed
        const totalRes = Number(srv.total_res) || 0;
        if (totalRes === 0) return false;
        const daysSince = Math.floor((Date.now() - new Date(srv.last_res_date).getTime()) / 86400000);
        const bdPct = (Number(srv.boarding_count) || 0) / totalRes;
        const dcThresh = 90, bdThresh = 180;
        const thresh = bdPct > 0.5 ? bdThresh : dcThresh;
        return daysSince >= thresh; // actually lapsed
      });
      if (lapsedNeedingFU.length > 0) {
        const retRows = lapsedNeedingFU.map(c => {
          const gingrId = String(c.gingrId);
          const srv = sMap[gingrId];
          const totalRes = Number(srv.total_res) || 1;
          const bdPct = (Number(srv.boarding_count) || 0) / totalRes;
          const thresh = bdPct > 0.5 ? 180 : 90;
          const lapseDate = new Date(srv.last_res_date + "T12:00:00");
          lapseDate.setDate(lapseDate.getDate() + thresh);
          const lapseDateStr = lapseDate.toISOString().split("T")[0];
          const lc = c.lifecycle || { conversion: { notes:"",followUpDate:"",updates:[],source:"",sourceDate:"",sourceReservationId:"" }, retention: { notes:"",followUpDate:"",updates:[] }, cold:false, coldDate:"", coldFrom:"" };
          const updatedLC = { ...lc, retention: { ...lc.retention, followUpDate: lapseDateStr } };
          c.lifecycle = updatedLC;
          return { location_id: locationId, gingr_id: gingrId, lifecycle_data: updatedLC, updated_at: new Date().toISOString() };
        });
        supabase.from("lite_client_lifecycle").upsert(retRows, { onConflict: "location_id,gingr_id" }).then(({ error }) => {
          if (error) console.log("[K9 Lite] Lapsed follow-up seed error:", error.message);
          else console.log(`[K9 Lite] Seeded ${retRows.length} lapsed follow-up dates`);
        });
      }

      setClients(tClients);
      setDogs(tDogs);
      setResTypes(typesRes.data || []);
      setImmunizationTypes(immTypesRes.data || []);
      setSyncState(syncRes.data || []);

      // Determine last sync
      const ownerSync = (syncRes.data || []).find(s => s.entity_type === "owners");
      if (ownerSync?.last_sync_at) setLastSyncAt(ownerSync.last_sync_at);

      hasLoadedOnce.current = true;

      // Cache for instant loads on next visit (versioned to bust stale caches)
      idbSet(`data_v2_${locationId}`, {
        clients: tClients, dogs: tDogs, serverStats: sMap,
        resTypes: typesRes.data || [], immunizationTypes: immTypesRes.data || [],
      });

      // Phase 2: Background fetch reservations (for ops hub, client detail, etc.)
      fetchAll("gingr_reservations", locationId, "start_date", false,
        "gingr_id,location_id,owner_gingr_id,animal_gingr_id,reservation_type_name,reservation_type_id,start_date,end_date,check_in_date,check_out_date,cancelled_date,transaction,deposit,services,animal_name,owner_first_name,owner_last_name,notes_reservation"
      ).then(rawRes => {
        const tReservations = transformReservations(rawRes);
        const tRooms = buildRooms(typesRes.data || [], tReservations, roomCounts, roomNames);
        const assignedRes = assignRoomsIntelligently(tReservations, tRooms);
        setReservations(assignedRes);
        setRooms(tRooms);
      }).catch(err => console.error("Background reservation fetch failed:", err));

    } catch (err) {
      console.error("Failed to load data:", err);
      setError(err.message);
    }
  }, [locationId, transformOwners, transformAnimals, transformReservations, buildRooms, assignRoomsIntelligently]);

  // ── Helper: extract real error from edge function responses ──
  const extractEdgeFnError = async (fnError) => {
    if (!fnError) return null;
    // FunctionsHttpError has the response context — try to get the body
    try {
      if (fnError.context?.body) {
        const reader = fnError.context.body.getReader?.();
        if (reader) {
          const { value } = await reader.read();
          const text = new TextDecoder().decode(value);
          try { const j = JSON.parse(text); return j.error || j.message || text; } catch (_) { return text; }
        }
      }
      if (typeof fnError.message === "string" && fnError.message !== "Edge Function returned a non-2xx status code") return fnError.message;
    } catch (_) {}
    return fnError.message || "Unknown edge function error";
  };

  // ── Developer error log (copyable) ──
  const [lastErrorLog, setLastErrorLog] = useState(null);

  // ── Trigger sync via Edge Function (auto-retries backfill until complete) ──
  const [syncProgress, setSyncProgress] = useState(null); // { chunksProcessed, chunksRemaining }
  const triggerSync = useCallback(async (syncType = "full") => {
    if (!locationId || syncing) return;
    try {
      setSyncing(true);
      setSyncProgress(null);
      setLastErrorLog(null);
      let backfillComplete = false;
      let totalSynced = 0;
      let iteration = 0;
      while (!backfillComplete) {
        iteration++;
        const { data: fnData, error: fnError } = await supabase.functions.invoke("gingr-sync", {
          body: { location_id: locationId, sync_type: syncType },
        });
        if (fnError) {
          const detail = await extractEdgeFnError(fnError);
          const errObj = new Error(detail);
          errObj._detail = detail;
          errObj._raw = fnError;
          throw errObj;
        }
        console.log(`Gingr sync iteration ${iteration}:`, fnData);
        const resResult = fnData?.results?.reservations;
        totalSynced += resResult?.synced || 0;
        if (resResult && resResult.backfill_complete === false && resResult.chunks_remaining > 0) {
          setSyncProgress({ chunksProcessed: resResult.chunks_processed, chunksRemaining: resResult.chunks_remaining, totalSynced, iteration });
          // Brief pause between backfill runs to avoid hammering
          await new Promise(r => setTimeout(r, 500));
        } else {
          backfillComplete = true;
        }
      }
      // Reload data after full sync
      await loadData();
      setLastSyncAt(new Date().toISOString());
      setSyncing(false);
      setSyncProgress(null);
      return { totalSynced, iterations: iteration };
    } catch (err) {
      console.error("Sync failed:", err);
      const errorLog = { timestamp: new Date().toISOString(), error: err._detail || err.message, location_id: locationId, syncType };
      setLastErrorLog(errorLog);
      setSyncing(false);
      setSyncProgress(null);
      throw err;
    }
  }, [locationId, syncing, loadData]);

  // ── Refresh = reload from Supabase (no API call) ──
  const refresh = useCallback(() => {
    loadData();
  }, [loadData]);

  // ── Auto-load on mount / location change ──
  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Auto-sync every 15 minutes ──
  useEffect(() => {
    if (!locationId) return;
    refreshTimerRef.current = setInterval(() => {
      triggerSync("incremental").catch(() => {});
    }, 15 * 60 * 1000);
    return () => { if (refreshTimerRef.current) clearInterval(refreshTimerRef.current); };
  }, [locationId, triggerSync]);

  // Build daily ops (these are Lite-native, stored in Supabase lite tables, not from Gingr)
  const td = todayStr();
  const dailyOps = useMemo(() => [
    { id: `ops_opening_${td}`, type: "checklist", typeSub: "opening", date: td, locked: false, items: DEF_OPENING_TEMPLATE.map(t => ({ ...t, done: false, completedBy: "", time: "" })) },
    { id: `ops_closing_${td}`, type: "checklist", typeSub: "closing", date: td, locked: false, items: DEF_CLOSING_TEMPLATE.map(t => ({ ...t, done: false, completedBy: "", time: "" })) },
    { id: `ops_fe_checklist_${td}`, type: "checklist", typeSub: "fe_checklist", date: td, locked: false, items: DEF_FE_TEMPLATE.map(t => ({ ...t, done: false, completedBy: "", time: "" })) },
    { id: `ops_be_checklist_${td}`, type: "checklist", typeSub: "be_checklist", date: td, locked: false, items: DEF_BE_TEMPLATE.map(t => ({ ...t, done: false, completedBy: "", time: "" })) },
    { id: `ops_room_cleaning_${td}`, type: "room_cleaning", typeSub: "room_cleaning", date: td, locked: false, items: {} },
    { id: `ops_pp_${td}`, type: "pp", typeSub: "pp", date: td, locked: false, items: {} },
  ], [td]);

  // ── Stable static arrays (created once, never change) ──
  const EMPTY = useRef([]).current;
  const EMPTY_OBJ = useRef({}).current;
  const STATIC_POLICIES = useRef({ retentionDaycareDays: 90, retentionBoardingDays: 180 }).current;

  // ── Memoized return value — only changes when actual data changes ──
  const requiredVaccinesMemo = useMemo(
    () => immunizationTypes.map(t => ({ id: t.gingr_id, name: t.name, required: t.required })),
    [immunizationTypes]
  );

  return useMemo(() => ({
    clients,
    dogs,
    reservations,
    rooms,
    serverStats,
    dailyOps,
    payments: EMPTY,
    messages: EMPTY,
    massTextHistory: EMPTY,
    messageTemplates: EMPTY,
    locationRoles: EMPTY,
    resortPolicies: STATIC_POLICIES,
    lifecycleExplainers: EMPTY_OBJ,
    lifecycleViews: EMPTY,
    closingTemplate: DEF_CLOSING_TEMPLATE,
    evaluations: EMPTY,
    gingr_api_key: "",
    gingr_location_id: "",
    gingr_subdomain: "",
    attendanceRoster: EMPTY,
    attendanceEntries: EMPTY,
    attendanceAuditLog: EMPTY,
    roles: LEAN_ROLES,
    clientFields: EMPTY,
    agreements: EMPTY,
    vets: EMPTY,
    auditLog: EMPTY,
    discounts: EMPTY,
    packageSales: EMPTY,
    eodEntries: EMPTY,
    requiredVaccines: requiredVaccinesMemo,
    dogTags: EMPTY,
    loading,
    error,
    syncing,
    lastSyncAt,
    triggerSync,
    refresh,
    resTypes,
  }), [
    clients, dogs, reservations, rooms, serverStats, dailyOps,
    requiredVaccinesMemo, loading, error, syncing, lastSyncAt,
    triggerSync, refresh, resTypes,
    EMPTY, EMPTY_OBJ, STATIC_POLICIES,
  ]);
}


// ─── Lite Client CRUD ────────────────────────────────────────────────────

export async function insertLiteClient(locationId, fields) {
  const row = {
    location_id: locationId,
    first_name: fields.first_name || null,
    last_name: fields.last_name || null,
    phone: fields.phone || null,
    email: fields.email || null,
    source: fields.source || "manual",
    source_date: fields.source_date || new Date().toISOString(),
    notes: fields.notes || null,
    ignite_lead_id: fields.ignite_lead_id || null,
    lifecycle_data: fields.lifecycle_data || {},
  };
  const { data, error } = await supabase.from("lite_clients").insert(row).select().single();
  if (error) throw error;
  return data;
}

export async function updateLiteClient(liteClientId, fields) {
  const updates = {};
  if (fields.first_name !== undefined) updates.first_name = fields.first_name;
  if (fields.last_name !== undefined) updates.last_name = fields.last_name;
  if (fields.phone !== undefined) updates.phone = fields.phone;
  if (fields.email !== undefined) updates.email = fields.email;
  if (fields.notes !== undefined) updates.notes = fields.notes;
  if (fields.source !== undefined) updates.source = fields.source;
  if (fields.lifecycle_data !== undefined) updates.lifecycle_data = fields.lifecycle_data;
  if (fields.gingr_owner_id !== undefined) updates.gingr_owner_id = fields.gingr_owner_id;
  const { data, error } = await supabase.from("lite_clients").update(updates).eq("id", liteClientId).select().single();
  if (error) throw error;
  return data;
}

// ─── Structured Filters ──────────────────────────────────────────────────

export default useGingrData;

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const { locationId } = await req.json()
    if (!locationId) {
      return new Response(JSON.stringify({ error: "locationId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    const td = new Date().toISOString().split("T")[0]

    // Check cache
    const { data: cached } = await supabase
      .from("lite_settings")
      .select("setting_value,updated_at")
      .eq("location_id", locationId)
      .eq("setting_key", `room_assignments_${td}`)
      .maybeSingle()

    if (cached?.setting_value && cached.updated_at) {
      const age = Date.now() - new Date(cached.updated_at).getTime()
      if (age < 5 * 60 * 1000) {
        return new Response(JSON.stringify({ assignments: cached.setting_value, cached: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }
    }

    // Load configs
    const [roomNamesRes, roomCountsRes, resTypesRes] = await Promise.all([
      supabase.from("lite_settings").select("setting_value").eq("location_id", locationId).eq("setting_key", "room_names").maybeSingle(),
      supabase.from("lite_settings").select("setting_value").eq("location_id", locationId).eq("setting_key", "room_counts").maybeSingle(),
      supabase.from("gingr_reservation_types").select("*").eq("location_id", locationId),
    ])

    const roomNames = roomNamesRes.data?.setting_value || {}
    const roomCounts = roomCountsRes.data?.setting_value || {}
    const ROOM_TYPES = ["Luxury Suite", "Executive Room", "Double Compartment", "Single Compartment"]
    const defaultCounts: Record<string, number> = { "Luxury Suite": 4, "Executive Room": 6, "Double Compartment": 8, "Single Compartment": 10 }

    // Build rooms map
    const roomMap: Record<string, string[]> = {}
    const useNames = Object.keys(roomNames).length > 0

    if (useNames) {
      Object.entries(roomNames).forEach(([typeName, nameList]: [string, any]) => {
        if (Array.isArray(nameList) && nameList.length > 0) roomMap[typeName] = [...nameList]
      })
    } else {
      const boardingTypes = (resTypesRes.data || []).filter((rt: any) => {
        const raw = rt.raw_data || {}
        return (raw.capacity_by_lodging === "1" || raw.capacity_by_lodging === 1) &&
               !(raw.single_day === "1" || raw.single_day === 1)
      })
      if (boardingTypes.length > 0) {
        boardingTypes.forEach((bt: any) => {
          let typeName = (bt.name || bt.type_label || "").replace(/^Boarding\s*\|\s*/i, "").replace(/\s*\(All Inclusive\)\s*$/i, "").trim()
          if (!typeName) return
          const count = (roomCounts as any)[typeName] ?? defaultCounts[typeName] ?? 6
          roomMap[typeName] = Array.from({ length: count }, (_, i) => `${typeName} ${i + 1}`)
        })
      } else {
        ROOM_TYPES.forEach(rt => {
          const count = (roomCounts as any)[rt] ?? defaultCounts[rt] ?? 6
          roomMap[rt] = Array.from({ length: count }, (_, i) => `${rt} ${i + 1}`)
        })
      }
    }

    // Load reservations
    const windowEnd = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0]
    const { data: rawRes } = await supabase
      .from("gingr_reservations")
      .select("gingr_id,reservation_type_name,start_date,end_date,check_in_date,check_out_date,cancelled_date")
      .eq("location_id", locationId)
      .gte("start_date", td + "T00:00:00")
      .lte("start_date", windowEnd + "T23:59:59")

    // Transform
    const reservations = (rawRes || []).map((r: any) => {
      let roomType: string | null = null
      if (r.reservation_type_name) {
        for (const rt of ROOM_TYPES) {
          if (r.reservation_type_name.toLowerCase().includes(rt.toLowerCase())) { roomType = rt; break }
        }
      }
      const startD = (r.start_date || "").split("T")[0]
      const endD = r.end_date ? r.end_date.split("T")[0] : startD
      const isBoardingType = r.reservation_type_name?.toLowerCase().includes("boarding") && !r.reservation_type_name?.toLowerCase().includes("day boarding")
      return { id: `g${r.gingr_id}`, type: isBoardingType ? "boarding" : "other", roomType, checkIn: startD, checkOut: endD }
    })

    // Assign rooms (greedy interval scheduling)
    const boarding = reservations.filter((r: any) => r.type === "boarding" && r.roomType)
    const byType: Record<string, any[]> = {}
    boarding.forEach((r: any) => { if (!byType[r.roomType]) byType[r.roomType] = []; byType[r.roomType].push(r) })

    const assignments: Record<string, string> = {}
    Object.entries(byType).forEach(([roomType, group]) => {
      const rooms = roomMap[roomType] || []
      if (rooms.length === 0) return
      group.sort((a: any, b: any) => (a.checkIn || "").localeCompare(b.checkIn || "") || (a.id || "").localeCompare(b.id || ""))
      const occ: Record<string, { checkIn: string; checkOut: string }[]> = {}
      rooms.forEach(rm => { occ[rm] = [] })
      group.forEach((r: any) => {
        let picked: string | null = null
        for (const rm of rooms) {
          const overlap = occ[rm].some(o => o.checkIn < r.checkOut && r.checkIn < o.checkOut)
          if (!overlap) { picked = rm; break }
        }
        if (!picked) picked = rooms[0]
        occ[picked!].push({ checkIn: r.checkIn, checkOut: r.checkOut })
        assignments[r.id] = picked!
      })
    })

    // Cache result
    await supabase.from("lite_settings").upsert({
      location_id: locationId,
      setting_key: `room_assignments_${td}`,
      setting_value: assignments,
      updated_at: new Date().toISOString(),
    }, { onConflict: "location_id,setting_key" })

    return new Response(JSON.stringify({ assignments, cached: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})

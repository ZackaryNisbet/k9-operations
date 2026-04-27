import {
  resolveRoomOccupancyLookupEntry,
  type RoomOccupancyLookup,
} from "./room-occupancy.ts";
import {
  fetchOperationalAreaOrder,
  operationalAreaSortIndex,
} from "./operational-area-order.ts";

export type CareSession = "am" | "midday" | "pm";
export type CareReportKind = "feeding-meds" | "feeding-report" | "medication-report";

const CARE_SESSIONS: CareSession[] = ["am", "midday", "pm"];

const ROOM_ORDER = [
  "1C", "2C", "3C", "4C", "5C", "6C", "7C", "8C",
  "201", "202", "203", "204", "205", "206", "207", "208", "209", "210", "211", "212",
  "301", "302", "303", "304", "305", "306", "307", "308", "309", "310",
  "401", "402", "403", "404", "405", "406", "407", "408", "409", "410",
  "501", "502", "503", "504", "505",
  "101", "102", "103", "104", "105", "106", "107", "108",
  "1A", "2A", "3A", "4A", "5A", "6A", "7A", "8A",
  "1B", "2B", "3B", "4B", "5B", "6B", "7B", "8B",
];

function normalizeText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value).trim();
  if (Array.isArray(value)) return value.map(normalizeText).filter(Boolean).join(", ");
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).map(normalizeText).filter(Boolean).join(" ");
  return "";
}

function rawPayload(row: any): Record<string, any> {
  return row?.raw_data && typeof row.raw_data === "object" ? row.raw_data : {};
}

function firstIndexedPayload(row: any): Record<string, any> {
  const raw = rawPayload(row);
  const first = raw["0"] || raw[0];
  return first && typeof first === "object" ? first : {};
}

function optionLabel(value: any): string {
  if (value == null) return "";
  if (typeof value === "object") {
    return normalizeText(value.label ?? value.value_string ?? value.name ?? "");
  }
  return normalizeText(value);
}

function dateKey(value: string | null | undefined): string {
  if (!value) return "";
  return String(value).includes("T") ? String(value).split("T")[0] : String(value);
}

function addDays(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatShortDate(value: string | null | undefined): string {
  const key = dateKey(value);
  if (!key) return "";
  const parsed = new Date(`${key}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
}

function ownerName(row: any): string {
  const raw = row?.raw_data || {};
  return [
    normalizeText(row?.owner_first_name || raw?.owner?.first_name),
    normalizeText(row?.owner_last_name || raw?.owner?.last_name),
  ].filter(Boolean).join(" ").trim();
}

function ownerInitial(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  const last = parts[parts.length - 1] || "";
  return last ? `${last.charAt(0).toUpperCase()}.` : "";
}

function lookupName(value: unknown): string {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function occupancyKey(animalName: unknown, owner: unknown): string {
  return `${lookupName(animalName)}|${lookupName(owner)}`;
}

function buildCurrentRoomMap(rows: any[] | null | undefined): Map<string, { roomLabel: string; areaName: string }> {
  const map = new Map<string, { roomLabel: string; areaName: string }>();
  for (const row of rows || []) {
    const room = normalizeText(row?.run_name);
    if (!room) continue;
    const areaName = normalizeText(row?.area_name) || "Other";
    const names = normalizeText(row?.animal_names);
    for (const chunk of names.split(/\s*,\s*/).filter(Boolean)) {
      const parsed = chunk.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
      if (!parsed) continue;
      const animalName = parsed[1];
      const owner = parsed[2];
      const key = occupancyKey(animalName, owner);
      if (key !== "|") map.set(key, { roomLabel: room, areaName });
    }
  }
  return map;
}

function classifyReservationCategory(typeName: string): string {
  const value = String(typeName || "").toLowerCase();
  if (value.includes("evaluation") || value.includes("eval")) return "evaluation";
  if (value.includes("day board")) return "day_boarding";
  if (value.includes("daycare") || value.includes("day care")) return "daycare";
  if (
    value.includes("boarding") ||
    value.includes("suite") ||
    value.includes("villa") ||
    value.includes("executive") ||
    value.includes("compartment")
  ) return "boarding";
  return "other";
}

function normalizeRoomToken(value: string): string {
  const cleaned = String(value || "").toUpperCase();
  const match = cleaned.match(/\b\d+[A-Z]?\b|\b[1-8][ABC]\b/);
  return match?.[0] || cleaned.replace(/\s+/g, "");
}

function roomSortKey(areaName: string, roomLabel: string, configuredAreaOrder: string[]): string {
  const areaIndex = operationalAreaSortIndex(areaName || "Other", configuredAreaOrder);
  const token = normalizeRoomToken(roomLabel);
  const index = ROOM_ORDER.indexOf(token);
  const roomKey = index >= 0 ? `${String(index).padStart(3, "0")}_${token}` : `999_${token}`;
  return `${String(areaIndex).padStart(4, "0")}_${areaName || "Other"}_${roomKey}`;
}

function resolveRoomInfo(
  roomLookup: RoomOccupancyLookup | null | undefined,
  currentRoomMap: Map<string, { roomLabel: string; areaName: string }>,
  reservation: any,
): { roomLabel: string; areaName: string } {
  const raw = reservation?.raw_data || {};
  const animalId = String(reservation?.animal_gingr_id || raw?.animal?.id || "").trim();
  const owner = ownerName(reservation);
  const currentRoom = currentRoomMap.get(occupancyKey(
    normalizeText(reservation?.animal_name || raw?.animal?.name),
    owner,
  ));
  if (currentRoom) return currentRoom;
  const fallback = normalizeText(reservation?.room_assignment || raw?.run?.name || raw?.room?.name || raw?.reservation_type?.type?.split("|")?.at(-1));
  const entry = roomLookup ? resolveRoomOccupancyLookupEntry(roomLookup, {
    reservationId: String(reservation?.gingr_id || reservation?.id || ""),
    animalId,
    animalName: normalizeText(reservation?.animal_name || raw?.animal?.name),
    ownerName: owner,
  }) : null;
  return {
    roomLabel: entry?.room_label || fallback || "—",
    areaName: entry?.area_name || normalizeText(raw?.area_name || raw?.run?.area_name) || "Other",
  };
}

function scheduleText(row: any): string {
  const raw = rawPayload(row);
  return [
    normalizeText(row?.schedule),
    normalizeText(row?.schedule_time),
    normalizeText(row?.frequency),
    normalizeText(raw?.schedule_time),
    normalizeText(raw?.schedule),
    normalizeText(raw?.times),
    normalizeText(raw?.normalized_schedule_label),
    normalizeText(raw?.selected_schedule?.time),
    medicationScheduleLabel(row),
  ].filter(Boolean).join(" ").toLowerCase();
}

export function matchesCareSession(row: any, session: CareSession, type: "feeding" | "medication"): boolean {
  const text = scheduleText(row);
  if (text.includes("as needed")) return false;
  if (text.includes("three") || text.includes("3x") || text.includes("tid")) return true;
  if (session === "midday") {
    return text.includes("midday") || text.includes("noon") || text.includes("12") || text.includes("lunch") || text.includes("afternoon");
  }
  if (session === "am") {
    if (text.includes("am") || text.includes("morning") || text.includes("breakfast") || text.includes("6") || text.includes("7")) return true;
    if (text.includes("twice") || text.includes("2x") || text.includes("bid")) return true;
    return !text && type === "feeding";
  }
  if (text.includes("pm") || text.includes("evening") || text.includes("dinner") || text.includes("night") || text.includes("17") || text.includes("18") || text.includes("19")) return true;
  if (text.includes("twice") || text.includes("2x") || text.includes("bid")) return true;
  return !text && type === "feeding";
}

function foodKindFor(row: any): "food_from_home" | "house_food_chicken" | "house_food_salmon" | "other" {
  const raw = rawPayload(row);
  const first = firstIndexedPayload(row);
  const text = [
    normalizeText(row?.food_type),
    normalizeText(row?.food_brand),
    normalizeText(row?.special_instructions),
    optionLabel(first?.foodType),
    normalizeText(raw?.foodType),
    normalizeText(raw?.food_type),
    normalizeText(raw?.foodBrand),
    normalizeText(raw?.normalized_feeding_method),
  ].join(" ").toLowerCase();
  if (text.includes("food from home") || /\bffh\b/.test(text)) return "food_from_home";
  if (text.includes("salmon")) return "house_food_salmon";
  if (text.includes("chicken")) return "house_food_chicken";
  if (text.includes("house food") || /\bhf\b/.test(text)) return "house_food_chicken";
  return "other";
}

function friendlyFoodLabel(row: any): string {
  const raw = rawPayload(row);
  const first = firstIndexedPayload(row);
  return [
    normalizeText(row?.food_type),
    normalizeText(row?.food_brand),
    optionLabel(first?.foodType),
    normalizeText(raw?.foodType),
    normalizeText(raw?.food_type),
    normalizeText(raw?.foodBrand),
  ].find(Boolean) || "Feeding";
}

function feedingMethod(row: any): string {
  const raw = rawPayload(row);
  const first = firstIndexedPayload(row);
  const method = [
    normalizeText(raw?.normalized_feeding_method),
    optionLabel(first?.feedingMethod),
    normalizeText(raw?.feedingMethod),
    normalizeText(raw?.feeding_method),
  ].find(Boolean) || "";
  const notes = normalizeText(row?.special_instructions || first?.feedingNotes || raw?.feedingNotes || raw?.feeding_notes || raw?.notes);
  if (method && notes && method.toLowerCase() !== notes.toLowerCase()) return method;
  return method;
}

function selectedFeedingSchedule(row: any): any {
  const raw = rawPayload(row);
  const first = firstIndexedPayload(row);
  const schedules = first?.feedingSchedules && typeof first.feedingSchedules === "object" ? first.feedingSchedules : {};
  const selectedId = normalizeText(raw?.selected_schedule?.id);
  if (selectedId && schedules[selectedId]) return schedules[selectedId];
  const selectedTime = normalizeText(raw?.selected_schedule?.time).toLowerCase();
  return Object.values(schedules).find((schedule: any) =>
    normalizeText(schedule?.feedingSchedule?.label).toLowerCase() === selectedTime
  ) || null;
}

function buildFeedingItem(row: any) {
  const raw = rawPayload(row);
  const first = firstIndexedPayload(row);
  const selected = selectedFeedingSchedule(row);
  const foodLabel = friendlyFoodLabel(row);
  const amount = [
    optionLabel(selected?.feedingAmount),
    optionLabel(selected?.feedingUnit),
  ].filter(Boolean).join(" ") || normalizeText(row?.amount || raw?.amount || raw?.quantity);
  const method = feedingMethod(row);
  const schedule = normalizeText(
    optionLabel(selected?.feedingSchedule) ||
      raw?.selected_schedule?.time ||
      row?.schedule_time ||
      raw?.normalized_schedule_label ||
      raw?.schedule_time
  );
  const notes = normalizeText(
    selected?.feedingInstructions ||
      row?.special_instructions ||
      row?.notes ||
      first?.feedingNotes ||
      raw?.feedingNotes ||
      raw?.feeding_notes ||
      raw?.notes
  );
  const kind = foodKindFor(row);
  return {
    id: `feed_${row?.gingr_id || row?.id || first?.animalId || `${foodLabel}_${schedule}`}`,
    summary: [method, foodLabel, amount].filter(Boolean).join(" · ") || foodLabel,
    detail: [foodLabel, amount].filter(Boolean).join(" · ") || foodLabel,
    method,
    foodType: foodLabel,
    foodKind: kind,
    amount,
    schedule,
    notes,
  };
}

function medicationScheduleLabel(row: any): string {
  const raw = rawPayload(row);
  const first = firstIndexedPayload(row);
  const scheduleId = normalizeText(first?.medication_schedule_id || row?.schedule_id || raw?.selected_schedule?.id);
  const schedules = Array.isArray(raw?.source_payload?.medicationSchedules)
    ? raw.source_payload.medicationSchedules
    : Array.isArray(raw?.medicationSchedules)
      ? raw.medicationSchedules
      : [];
  const match = schedules.find((schedule: any) => normalizeText(schedule?.id) === scheduleId);
  return normalizeText(match?.time || raw?.normalized_schedule_label || row?.time_of_day);
}

function buildMedicationItem(row: any, override?: any) {
  const raw = rawPayload(row);
  const first = override && typeof override === "object" ? override : firstIndexedPayload(row);
  const name = optionLabel(first?.medication_type) || normalizeText(row?.medication_name || raw?.medication_name) || "Medication";
  const amount = optionLabel(first?.medication_amount) || normalizeText(row?.dosage || raw?.dosage);
  const unit = optionLabel(first?.medication_unit);
  const dosage = [amount, unit].filter(Boolean).join(" ");
  const route = normalizeText(row?.administration_route || raw?.administration_route || raw?.route);
  const schedule = medicationScheduleLabel(row) || normalizeText(row?.frequency || raw?.schedule_time);
  const notes = normalizeText(first?.medication_notes?.value || row?.special_instructions || row?.notes || raw?.special_instructions || raw?.notes);
  return {
    id: `med_${row?.gingr_id || row?.id || `${name}_${schedule}`}_${normalizeText(first?.id || name).replace(/\s+/g, "_")}`,
    summary: [name, dosage].filter(Boolean).join(" · ") || name,
    detail: [name, dosage, route].filter(Boolean).join(" · ") || name,
    medicationName: name,
    dosage,
    route,
    schedule,
    notes,
  };
}

function buildMedicationItems(row: any) {
  const raw = rawPayload(row);
  const first = firstIndexedPayload(row);
  const scheduleId = normalizeText(first?.medication_schedule_id || row?.schedule_id);
  const scheduleItems = scheduleId
    ? raw?.source_payload?.animal_medication_schedules?.[scheduleId] || raw?.animal_medication_schedules?.[scheduleId]
    : null;
  if (Array.isArray(scheduleItems) && scheduleItems.length > 0) {
    return scheduleItems.map((item) => buildMedicationItem(row, item));
  }
  return [buildMedicationItem(row)];
}

function dedupeInstructionItems(items: any[]) {
  const seen = new Set<string>();
  const result = [];
  for (const item of items) {
    const key = [
      item.schedule,
      item.summary,
      item.notes,
    ].join("|").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function medicationAdminNote(item: any, animalMedicationNotes: string): string {
  if (item?.notes) return item.notes;
  const animalNotes = animalMedicationNotes.toLowerCase();
  if (animalNotes.includes("pill pocket")) return "IN PILL POCKETS";
  if (animalMedicationNotes) return animalMedicationNotes;
  const text = [item?.summary, item?.detail, item?.dosage].filter(Boolean).join(" ");
  if (/\bpill\b/i.test(text)) return "PUT IN FOOD";
  return "";
}

function reservationDates(row: any): string {
  const start = formatShortDate(row?.start_date);
  const end = formatShortDate(row?.end_date);
  return start && end ? `${start} - ${end}` : start || end || "—";
}

function statusBucket(row: any): "checked_in" | "checked_out" | "pending" {
  if (row?.check_out_date) return "checked_out";
  if (row?.check_in_date) return "checked_in";
  return "pending";
}

function isPriorOvernight(row: any, date: string): boolean {
  return dateKey(row?.start_date) < date && dateKey(row?.end_date) >= date;
}

function buildSummary(rows: any[]) {
  const summary = {
    total: rows.length,
    feedingCount: 0,
    medicationCount: 0,
    foodFromHome: 0,
    houseFoodChicken: 0,
    houseFoodSalmon: 0,
    otherFood: 0,
    checkedIn: 0,
    checkedOut: 0,
    pending: 0,
    byCategory: {} as Record<string, number>,
  };
  for (const row of rows) {
    if ((row.feedingItems || []).length > 0) summary.feedingCount += 1;
    summary.medicationCount += (row.medicationItems || []).length;
    const kinds = new Set((row.feedingItems || []).map((item: any) => item.foodKind));
    if (kinds.has("food_from_home")) summary.foodFromHome += 1;
    if (kinds.has("house_food_chicken")) summary.houseFoodChicken += 1;
    if (kinds.has("house_food_salmon")) summary.houseFoodSalmon += 1;
    if (kinds.has("other")) summary.otherFood += 1;
    if (row.statusBucket === "checked_in") summary.checkedIn += 1;
    else if (row.statusBucket === "checked_out") summary.checkedOut += 1;
    else summary.pending += 1;
    summary.byCategory[row.reservationCategory] = (summary.byCategory[row.reservationCategory] || 0) + 1;
  }
  return summary;
}

async function fetchCareContext(
  supabase: any,
  locationId: string,
  date: string,
  roomLookup?: RoomOccupancyLookup | null,
) {
  const nextDay = addDays(date, 1);
  const resSelect = "id, gingr_id, animal_gingr_id, animal_name, owner_first_name, owner_last_name, reservation_type_name, start_date, end_date, check_in_date, check_out_date, cancelled_date, room_assignment, raw_data";
  const { data: reservations, error } = await supabase
    .from("gingr_reservations")
    .select(resSelect)
    .eq("location_id", locationId)
    .is("cancelled_date", null)
    .lte("start_date", `${date}T23:59:59`)
    .gte("end_date", `${date}T00:00:00`)
    .order("start_date", { ascending: true });
  if (error) throw error;

  const animalIds = [...new Set((reservations || [])
    .map((row: any) => String(row?.animal_gingr_id || row?.raw_data?.animal?.id || "").trim())
    .filter(Boolean))];

  const [animalRes, playgroupRes, feedingRes, medicationRes] = animalIds.length > 0
    ? await Promise.all([
        supabase
          .from("gingr_animals")
          .select("gingr_id, breed_name, weight, image_url, local_photo_url, raw_data")
          .eq("location_id", locationId)
          .in("gingr_id", animalIds),
        supabase
          .from("v_dog_playgroups")
          .select("animal_gingr_id, playgroup")
          .in("animal_gingr_id", animalIds),
        supabase
          .from("gingr_feeding_schedules")
          .select("*")
          .eq("location_id", locationId)
          .in("animal_gingr_id", animalIds)
          .eq("is_active", true),
        supabase
          .from("gingr_medications")
          .select("*")
          .eq("location_id", locationId)
          .in("animal_gingr_id", animalIds)
          .eq("is_active", true),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];

  const animalMap = new Map<string, any>();
  for (const animal of animalRes.data || []) animalMap.set(String(animal.gingr_id), animal);

  const playgroupMap = new Map<string, string>();
  for (const row of playgroupRes.data || []) playgroupMap.set(String(row.animal_gingr_id), row.playgroup);

  const feedingMap = new Map<string, any[]>();
  for (const row of feedingRes.data || []) {
    const key = String(row.animal_gingr_id);
    if (!feedingMap.has(key)) feedingMap.set(key, []);
    feedingMap.get(key)!.push(row);
  }

  const medicationMap = new Map<string, any[]>();
  for (const row of medicationRes.data || []) {
    const key = String(row.animal_gingr_id);
    if (!medicationMap.has(key)) medicationMap.set(key, []);
    medicationMap.get(key)!.push(row);
  }

  const { data: occupancyRows } = await supabase
    .from("gingr_room_occupancy")
    .select("animal_names, run_name, area_name")
    .eq("location_id", locationId)
    .eq("occupancy_date", date)
    .eq("occupied", true);

  return {
    reservations: reservations || [],
    animalMap,
    playgroupMap,
    feedingMap,
    medicationMap,
    roomLookup,
    currentRoomMap: buildCurrentRoomMap(occupancyRows),
    nextDay,
  };
}

function buildBaseRows(context: Awaited<ReturnType<typeof fetchCareContext>>, date: string, configuredAreaOrder: string[]) {
  return context.reservations.map((reservation: any) => {
    const raw = reservation?.raw_data || {};
    const animalId = String(reservation?.animal_gingr_id || raw?.animal?.id || "").trim();
    const animal = context.animalMap.get(animalId) || {};
    const owner = ownerName(reservation);
    const typeName = normalizeText(reservation?.reservation_type_name || raw?.reservation_type?.type);
    const { roomLabel, areaName } = resolveRoomInfo(context.roomLookup, context.currentRoomMap, reservation);
    const playgroup = context.playgroupMap.get(animalId) || "";
    const bucket = statusBucket(reservation);
    const animalMedicationNotes = normalizeText(animal?.raw_data?.medicines);
    const medicationItems = dedupeInstructionItems((context.medicationMap.get(animalId) || []).flatMap(buildMedicationItems))
      .map((item) => ({ ...item, notes: medicationAdminNote(item, animalMedicationNotes) }));
    return {
      id: String(reservation?.gingr_id || reservation?.id || animalId),
      reservationId: String(reservation?.gingr_id || reservation?.id || ""),
      gingrReservationId: String(reservation?.gingr_id || ""),
      animalGingrId: animalId,
      dogName: normalizeText(reservation?.animal_name || raw?.animal?.name) || "Dog",
      ownerName: owner,
      ownerInitial: ownerInitial(owner),
      breed: normalizeText(animal?.breed_name || raw?.animal?.breed),
      roomLabel,
      areaName,
      reservationType: typeName,
      reservationCategory: classifyReservationCategory(typeName),
      reservationDates: reservationDates(reservation),
      dropoffTime: formatTime(reservation?.check_in_date || reservation?.start_date),
      pickupTime: formatTime(reservation?.check_out_date || reservation?.end_date),
      startDate: dateKey(reservation?.start_date),
      endDate: dateKey(reservation?.end_date),
      imageUrl: animal?.local_photo_url || animal?.image_url || null,
      playgroup: playgroup || null,
      hasPrivatePlay: playgroup.toLowerCase().includes("private"),
      weight: animal?.weight == null ? null : Number.parseFloat(String(animal.weight)),
      statusBucket: bucket,
      isCheckedIn: bucket === "checked_in",
      isCheckedOut: bucket === "checked_out",
      isPending: bucket === "pending",
      isPriorOvernight: isPriorOvernight(reservation, date),
      feedingItems: dedupeInstructionItems((context.feedingMap.get(animalId) || []).map(buildFeedingItem)),
      medicationItems,
      reservationNotes: normalizeText(raw?.notes?.reservation_notes || reservation?.notes_reservation),
      ownerNotes: normalizeText(raw?.notes?.owner_notes || reservation?.notes_owner),
      animalNotes: normalizeText(raw?.notes?.animal_notes || reservation?.notes_animal),
      animalMedicationNotes,
      roomSortKey: roomSortKey(areaName, roomLabel, configuredAreaOrder),
    };
  });
}

function withSessionItems(row: any, context: Awaited<ReturnType<typeof fetchCareContext>>, session: CareSession) {
  return {
    ...row,
    feedingItems: row.feedingItems.filter((item: any) => matchesCareSession(item, session, "feeding")),
    medicationItems: row.medicationItems.filter((item: any) => matchesCareSession(item, session, "medication")),
  };
}

function sortRows(rows: any[]) {
  return rows.sort((a, b) => a.roomSortKey.localeCompare(b.roomSortKey) || a.dogName.localeCompare(b.dogName));
}

function buildPayload(rows: any[], kind: CareReportKind, session: CareSession, date: string) {
  const cleanedRows = rows.map(({ roomSortKey: _roomSortKey, ...row }) => row);
  return {
    kind,
    session,
    date,
    rows: cleanedRows,
    dogs: cleanedRows,
    summary: buildSummary(cleanedRows),
    generatedAt: new Date().toISOString(),
    source: "gingr_operational_detail_tables",
  };
}

export function careTypeSub(kind: CareReportKind, session: CareSession): string {
  if (kind === "feeding-meds") return `feeding_meds_${session}`;
  if (kind === "feeding-report") return session === "am" ? "feeding_report" : `feeding_report_${session}`;
  return session === "am" ? "medication_report" : `medication_report_${session}`;
}

export function careEntryId(kind: CareReportKind, session: CareSession, date: string): string {
  return `ops_${careTypeSub(kind, session)}_${date}`;
}

export async function computeCareReportsForDate(
  supabase: any,
  locationId: string,
  date: string,
  roomLookup?: RoomOccupancyLookup | null,
) {
  const context = await fetchCareContext(supabase, locationId, date, roomLookup);
  const configuredAreaOrder = await fetchOperationalAreaOrder(supabase, locationId);
  const baseRows = buildBaseRows(context, date, configuredAreaOrder);
  const entries: Array<{ id: string; type: string; typeSub: string; date: string; computedItems: any }> = [];
  const byKey: Record<string, any> = {};

  for (const session of CARE_SESSIONS) {
    const sessionRows = baseRows.map((row) => withSessionItems(row, context, session));

    const feedingMedsRows = sortRows(
      sessionRows
        .filter((row) => ["boarding", "daycare", "day_boarding", "evaluation"].includes(row.reservationCategory))
        .filter((row) => row.feedingItems.length > 0 || row.medicationItems.length > 0),
    );
    const feedingMeds = buildPayload(feedingMedsRows, "feeding-meds", session, date);
    const feedingMedsTypeSub = careTypeSub("feeding-meds", session);
    entries.push({ id: careEntryId("feeding-meds", session, date), type: "workflow", typeSub: feedingMedsTypeSub, date, computedItems: feedingMeds });
    byKey[feedingMedsTypeSub] = feedingMeds;

    const feedingReportRows = sortRows(
      sessionRows
        .filter((row) => row.reservationCategory === "boarding")
        .filter((row) => session !== "am" || row.isPriorOvernight)
        .filter((row) => row.feedingItems.length > 0)
        .map((row) => ({ ...row, medicationItems: [] })),
    );
    const feedingReport = buildPayload(feedingReportRows, "feeding-report", session, date);
    const feedingTypeSub = careTypeSub("feeding-report", session);
    entries.push({ id: careEntryId("feeding-report", session, date), type: "workflow", typeSub: feedingTypeSub, date, computedItems: feedingReport });
    byKey[feedingTypeSub] = feedingReport;

    const medicationReportRows = sortRows(
      sessionRows
        .filter((row) => row.reservationCategory === "boarding")
        .filter((row) => row.medicationItems.length > 0)
        .map((row) => ({ ...row, feedingItems: [] })),
    );
    const medicationReport = buildPayload(medicationReportRows, "medication-report", session, date);
    const medicationTypeSub = careTypeSub("medication-report", session);
    entries.push({ id: careEntryId("medication-report", session, date), type: "workflow", typeSub: medicationTypeSub, date, computedItems: medicationReport });
    byKey[medicationTypeSub] = medicationReport;
  }

  return { entries, byKey };
}

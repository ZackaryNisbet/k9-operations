export interface GingrCredentials {
  subdomain: string;
  apiKey: string;
}

function normalizeText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value).trim();
  if (Array.isArray(value)) {
    return value.map(normalizeText).filter(Boolean).join(", ");
  }
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).map(normalizeText).filter(Boolean).join(" ");
  }
  return "";
}

function normalizeList<T = any>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object") return Object.values(value as Record<string, T>);
  return [];
}

function buildOptionLookup(value: unknown): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const option of normalizeList<any>(value)) {
    const keys = [
      normalizeText(option?.value),
      normalizeText(option?.id),
      normalizeText(option?.key),
      normalizeText(option),
    ].filter(Boolean);
    const label = normalizeText(option?.label || option?.name || option?.title || option?.time || option?.text || option);
    for (const key of keys) {
      if (label) lookup.set(key, label);
    }
  }
  return lookup;
}

function resolveLookupLabel(value: unknown, lookup: Map<string, string>): string {
  const raw = normalizeText(value);
  if (!raw) return "";
  return lookup.get(raw) || raw;
}

function inferDailyFrequency(count: number): string | null {
  if (count >= 3) return "three times daily";
  if (count === 2) return "twice daily";
  if (count === 1) return "once daily";
  return null;
}

function toDateOnly(value: unknown): string | null {
  const raw = normalizeText(value);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function buildSyntheticId(parts: unknown[]): string {
  const safe = parts
    .map((part) => normalizeText(part).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""))
    .filter(Boolean)
    .slice(0, 6);
  return safe.join("_") || crypto.randomUUID();
}

export async function gingrFetchV1(
  credentials: GingrCredentials,
  endpoint: string,
  method: "GET" | "POST" = "GET",
  body?: Record<string, string>,
) {
  const url = `https://${credentials.subdomain}.gingrapp.com/api/v1/${endpoint}`;

  let response: Response;
  if (method === "POST") {
    const params = new URLSearchParams();
    params.append("key", credentials.apiKey);
    if (body) {
      for (const [key, value] of Object.entries(body)) params.append(key, value);
    }
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
      body: params.toString(),
    });
  } else {
    const params = new URLSearchParams({ key: credentials.apiKey });
    if (body) {
      for (const [key, value] of Object.entries(body)) params.append(key, value);
    }
    response = await fetch(`${url}?${params.toString()}`);
  }

  if (!response.ok) {
    throw new Error(`Gingr ${endpoint} failed with ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

export function parseFeedingInfoRows(locationId: string, animalId: string, result: any) {
  const typeLookup = buildOptionLookup(result?.feedingTypeOptions);
  const methodLookup = buildOptionLookup(result?.feedingMethodOptions);
  const unitLookup = buildOptionLookup(result?.feedingUnitOptions);
  const amountLookup = buildOptionLookup(result?.feedingAmountOptions);

  const selectedSchedules = normalizeList<any>(result?.feedingSchedules);
  const fallbackScheduleText = [
    normalizeText(result?.feedingSchedule),
    normalizeText(result?.feeding_schedule),
    normalizeText(result?.schedule_time),
  ].find(Boolean) || "";
  const scheduleEntries = selectedSchedules.length > 0
    ? selectedSchedules
    : fallbackScheduleText
      ? [{ id: "default", label: fallbackScheduleText }]
      : [{ id: "default", label: "" }];

  const foodType = [
    resolveLookupLabel(result?.foodType, typeLookup),
    normalizeText(result?.food_type),
    normalizeText(result?.foodType),
  ].find(Boolean) || null;
  const foodBrand = [
    normalizeText(result?.foodBrand),
    normalizeText(result?.food_brand),
    normalizeText(result?.brand),
  ].find(Boolean) || null;
  const feedingMethod = [
    resolveLookupLabel(result?.feedingMethod, methodLookup),
    normalizeText(result?.feeding_method),
    normalizeText(result?.feedingMethod),
  ].find(Boolean) || null;
  const amountValue = [
    resolveLookupLabel(result?.feedingAmount, amountLookup),
    normalizeText(result?.amount),
    normalizeText(result?.quantity),
  ].find(Boolean) || "";
  const unitValue = [
    resolveLookupLabel(result?.feedingUnit, unitLookup),
    normalizeText(result?.unit),
    normalizeText(result?.quantity_unit),
  ].find(Boolean) || "";
  const amount = [amountValue, unitValue].filter(Boolean).join(" ").trim() || null;
  const specialInstructions = [
    normalizeText(result?.feedingNotes),
    normalizeText(result?.feeding_notes),
    normalizeText(result?.notes),
  ].find(Boolean) || null;
  const frequency = [
    normalizeText(result?.frequency),
    normalizeText(result?.feedingFrequency),
    inferDailyFrequency(scheduleEntries.filter((entry) => normalizeText(entry)).length),
  ].find(Boolean) || null;

  return scheduleEntries.map((schedule, index) => {
    const scheduleLabel = [
      normalizeText(schedule?.time),
      normalizeText(schedule?.label),
      normalizeText(schedule?.name),
      normalizeText(schedule),
      fallbackScheduleText,
    ].find(Boolean) || "";

    return {
      location_id: locationId,
      gingr_id: buildSyntheticId(["feeding", animalId, schedule?.id, scheduleLabel, index]),
      animal_gingr_id: animalId,
      food_type: foodType,
      food_brand: foodBrand,
      amount,
      frequency,
      schedule_time: scheduleLabel || null,
      special_instructions: specialInstructions || feedingMethod,
      is_active: true,
      raw_data: {
        ...result,
        selected_schedule: schedule,
        normalized_schedule_label: scheduleLabel || null,
        normalized_feeding_method: feedingMethod,
      },
      synced_at: new Date().toISOString(),
    };
  });
}

export function parseMedicationInfoRows(locationId: string, animalId: string, result: any) {
  const scheduleLookup = buildOptionLookup(result?.medicationSchedules);
  const unitLookup = buildOptionLookup(result?.medicationUnitOptions);
  const amountLookup = buildOptionLookup(result?.medicationAmountOptions);
  const typeLookup = buildOptionLookup(result?.medicationTypeOptions);
  const selectedSchedules = normalizeList<any>(result?.animal_medication_schedules);
  const today = new Date().toISOString().slice(0, 10);

  return selectedSchedules.map((item, index) => {
    const medicationName = [
      normalizeText(item?.medication_name),
      normalizeText(item?.name),
      resolveLookupLabel(item?.medication_type_id ?? item?.medication_type ?? item?.type_id ?? item?.type, typeLookup),
    ].find(Boolean) || "Medication";
    const dosageAmount = [
      normalizeText(item?.dosage),
      resolveLookupLabel(item?.amount_id ?? item?.amount ?? item?.dosage_amount, amountLookup),
      normalizeText(item?.amount),
    ].find(Boolean) || "";
    const dosageUnit = [
      resolveLookupLabel(item?.unit_id ?? item?.unit ?? item?.dosage_unit, unitLookup),
      normalizeText(item?.unit_label),
    ].find(Boolean) || "";
    const scheduleText = [
      normalizeText(item?.schedule_time),
      resolveLookupLabel(item?.schedule_id ?? item?.schedule ?? item?.medication_schedule, scheduleLookup),
      normalizeText(item?.time),
    ].find(Boolean) || "";
    const frequency = [
      normalizeText(item?.frequency),
      scheduleText,
    ].find(Boolean) || null;
    const startDate = toDateOnly(item?.start_date ?? item?.date_start);
    const endDate = toDateOnly(item?.end_date ?? item?.date_end);
    const isActive = !endDate || endDate >= today;

    return {
      location_id: locationId,
      gingr_id: buildSyntheticId(["medication", animalId, item?.id, medicationName, scheduleText, index]),
      animal_gingr_id: animalId,
      medication_name: medicationName,
      dosage: [dosageAmount, dosageUnit].filter(Boolean).join(" ").trim() || null,
      frequency,
      administration_route: [
        normalizeText(item?.administration_route),
        normalizeText(item?.route),
      ].find(Boolean) || null,
      start_date: startDate,
      end_date: endDate,
      special_instructions: [
        normalizeText(item?.special_instructions),
        normalizeText(item?.instructions),
        normalizeText(item?.notes),
      ].find(Boolean) || null,
      prescribed_by: [
        normalizeText(item?.prescribed_by),
        normalizeText(item?.vet_name),
      ].find(Boolean) || null,
      is_active: isActive,
      raw_data: {
        ...item,
        source_payload: result,
        normalized_schedule_label: scheduleText || null,
      },
      synced_at: new Date().toISOString(),
    };
  });
}

async function fetchAnimalRowsWithConcurrency<T>(
  animalIds: string[],
  concurrency: number,
  mapper: (animalId: string) => Promise<T[]>,
) {
  const rows: T[] = [];
  let processedAnimals = 0;

  for (let i = 0; i < animalIds.length; i += concurrency) {
    const batch = animalIds.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(async (animalId) => {
      try {
        const nextRows = await mapper(animalId);
        processedAnimals += 1;
        return nextRows;
      } catch (error) {
        console.error(`Operational detail sync failed for animal ${animalId}:`, error);
        return [];
      }
    }));
    batchResults.forEach((nextRows) => rows.push(...nextRows));
  }

  return { rows, processedAnimals };
}

export async function fetchFeedingRowsForAnimals(
  locationId: string,
  animalIds: string[],
  credentials: GingrCredentials,
  concurrency = 6,
) {
  return fetchAnimalRowsWithConcurrency(animalIds, concurrency, async (animalId) => {
    const result = await gingrFetchV1(credentials, "get_feeding_info", "GET", { animal_id: animalId });
    return parseFeedingInfoRows(locationId, animalId, result);
  });
}

export async function fetchMedicationRowsForAnimals(
  locationId: string,
  animalIds: string[],
  credentials: GingrCredentials,
  concurrency = 6,
) {
  return fetchAnimalRowsWithConcurrency(animalIds, concurrency, async (animalId) => {
    const result = await gingrFetchV1(credentials, "get_medication_info", "GET", { animal_id: animalId });
    return parseMedicationInfoRows(locationId, animalId, result);
  });
}

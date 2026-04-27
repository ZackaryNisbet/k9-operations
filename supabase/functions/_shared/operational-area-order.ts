export const DEFAULT_OPERATIONAL_AREA_ORDER = [
  "Executive Rooms",
  "Luxury Suites",
  "Single Compartments",
  "Double Compartments",
  "Temporary Lodging",
  "Unassigned",
  "Other",
];

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeOrderLabel(value: string): string {
  return normalizeWhitespace(value).toLowerCase().replace(/[^a-z0-9]+/g, " ");
}

function readOrderSetting(value: any): string[] {
  const rawOrder = Array.isArray(value)
    ? value
    : Array.isArray(value?.areas)
      ? value.areas
      : Array.isArray(value?.area_order)
        ? value.area_order
        : Array.isArray(value?.operational_area_order)
          ? value.operational_area_order
          : [];
  return rawOrder
    .map((entry: unknown) => normalizeWhitespace(String(entry || "")))
    .filter(Boolean);
}

export function operationalAreaSortIndex(areaName: string, order: string[]): number {
  const normalizedArea = normalizeOrderLabel(areaName || "Other");
  const exact = order.findIndex((entry) => normalizeOrderLabel(entry) === normalizedArea);
  if (exact !== -1) return exact;

  const fuzzy = order.findIndex((entry) => {
    const normalizedEntry = normalizeOrderLabel(entry);
    return normalizedArea.includes(normalizedEntry) || normalizedEntry.includes(normalizedArea);
  });
  return fuzzy === -1 ? Number.MAX_SAFE_INTEGER : fuzzy;
}

export async function fetchOperationalAreaOrder(
  supabase: any,
  locationId: string,
): Promise<string[]> {
  try {
    const { data } = await supabase
      .from("lite_settings")
      .select("setting_key, setting_value")
      .eq("location_id", locationId)
      .in("setting_key", ["operational_area_order", "roll_call_area_order"]);

    const rows = Array.isArray(data) ? data : [];
    const primary = rows.find((row: any) => row.setting_key === "operational_area_order");
    const legacy = rows.find((row: any) => row.setting_key === "roll_call_area_order");
    const cleaned = readOrderSetting(primary?.setting_value).length
      ? readOrderSetting(primary?.setting_value)
      : readOrderSetting(legacy?.setting_value);
    if (cleaned.length) return cleaned;
  } catch (error) {
    console.error("Failed to load operational area order:", error);
  }

  return DEFAULT_OPERATIONAL_AREA_ORDER;
}

import { normalizeBathDisplay, normalizeBathModifierLabel, normalizeBathTypeLabel } from "./bathing-logic.ts";

type SupabaseClient = any;

export interface GingrIconMappingRow {
  id?: string | number;
  location_id?: string;
  capability_key?: string | null;
  icon_template_id?: string | null;
  icon_identity_key?: string | null;
  icon_group?: string | null;
  is_active?: boolean | null;
}

export interface GingrAnimalIconRow {
  animal_gingr_id?: string | null;
  icon_template_id?: string | null;
  icon_identity_key?: string | null;
  icon_title?: string | null;
  icon_group?: string | null;
  icon_comment?: string | null;
  icon_color?: string | null;
  icon_class?: string | null;
}

export interface GingrIconInventoryRow {
  location_id?: string | null;
  inventory_key?: string | null;
  icon_template_id?: string | null;
  icon_identity_key?: string | null;
  icon_group?: string | null;
  current_title?: string | null;
  current_comment?: string | null;
  icon_color?: string | null;
  icon_class?: string | null;
  active_assignment_count?: number | null;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
}

export const PLAY_ICON_CAPABILITIES = [
  "play.private_play",
  "play.large_daycare",
  "play.small_daycare",
  "play.evaluation",
] as const;

export const BATHING_ICON_CAPABILITIES = [
  "bathing.include",
  "bathing.type.standard",
  "bathing.type.premium",
  "bathing.type.medicated",
  "bathing.type.whitening",
  "bathing.type.shampoo_from_home",
  "bathing.type.hypoallergenic",
  "bathing.type.hypoallergenic_no_spray",
  "bathing.type.hypoallergenic_with_spray",
  "bathing.type.water_rinse",
  "bathing.type.fresh_n_clean",
  "bathing.modifier.no_dryer",
  "bathing.modifier.no_crate_dryer",
  "bathing.modifier.no_velocity_dryer",
  "bathing.modifier.towel_dry_only",
  "bathing.modifier.see_account_notes",
] as const;

export const GINGR_ICON_CAPABILITIES = [
  ...PLAY_ICON_CAPABILITIES,
  ...BATHING_ICON_CAPABILITIES,
] as const;

export const GINGR_ICON_CAPABILITY_META: Record<string, { label: string; group: string }> = {
  "play.private_play": { label: "Private Play", group: "Play" },
  "play.large_daycare": { label: "Large Daycare", group: "Play" },
  "play.small_daycare": { label: "Small Daycare", group: "Play" },
  "play.evaluation": { label: "Evaluation", group: "Play" },
  "bathing.include": { label: "Include In Bathing Report", group: "Bathing" },
  "bathing.type.standard": { label: "Bath Type: Standard", group: "Bathing" },
  "bathing.type.premium": { label: "Bath Type: Premium", group: "Bathing" },
  "bathing.type.medicated": { label: "Bath Type: Medicated", group: "Bathing" },
  "bathing.type.whitening": { label: "Bath Type: Whitening", group: "Bathing" },
  "bathing.type.shampoo_from_home": { label: "Bath Type: Shampoo From Home", group: "Bathing" },
  "bathing.type.hypoallergenic": { label: "Bath Type: Hypoallergenic", group: "Bathing" },
  "bathing.type.hypoallergenic_no_spray": { label: "Bath Type: Hypoallergenic - NO SPRAY", group: "Bathing" },
  "bathing.type.hypoallergenic_with_spray": { label: "Bath Type: Hypoallergenic - WITH SPRAY", group: "Bathing" },
  "bathing.type.water_rinse": { label: "Bath Type: Water Rinse", group: "Bathing" },
  "bathing.type.fresh_n_clean": { label: "Bath Type: Fresh N Clean", group: "Bathing" },
  "bathing.modifier.no_dryer": { label: "Bath Modifier: NO DRYER", group: "Bathing" },
  "bathing.modifier.no_crate_dryer": { label: "Bath Modifier: NO CRATE DRYER", group: "Bathing" },
  "bathing.modifier.no_velocity_dryer": { label: "Bath Modifier: NO VELOCITY DRYER", group: "Bathing" },
  "bathing.modifier.towel_dry_only": { label: "Bath Modifier: TOWEL DRY ONLY", group: "Bathing" },
  "bathing.modifier.see_account_notes": { label: "Bath Modifier: *See account notes*", group: "Bathing" },
};

const PLAY_FALLBACK_CAPABILITIES: Record<string, string> = {
  "private play": "play.private_play",
  "large dog playgroup": "play.large_daycare",
  "small dog playgroup": "play.small_daycare",
  "evaluation": "play.evaluation",
};

const BATH_TYPE_CAPABILITY_LABELS: Record<string, string> = {
  "bathing.type.standard": "Standard",
  "bathing.type.premium": "Premium",
  "bathing.type.medicated": "Medicated",
  "bathing.type.whitening": "Whitening",
  "bathing.type.shampoo_from_home": "Shampoo From Home",
  "bathing.type.hypoallergenic": "Hypoallergenic",
  "bathing.type.hypoallergenic_no_spray": "Hypoallergenic - NO SPRAY",
  "bathing.type.hypoallergenic_with_spray": "Hypoallergenic - WITH SPRAY",
  "bathing.type.water_rinse": "Water Rinse",
  "bathing.type.fresh_n_clean": "Fresh N Clean",
};

const BATH_MODIFIER_CAPABILITY_LABELS: Record<string, string> = {
  "bathing.modifier.no_dryer": "NO DRYER",
  "bathing.modifier.no_crate_dryer": "NO CRATE DRYER",
  "bathing.modifier.no_velocity_dryer": "NO VELOCITY DRYER",
  "bathing.modifier.towel_dry_only": "TOWEL DRY ONLY",
  "bathing.modifier.see_account_notes": "*See account notes*",
};

function normalizeString(value: string | null | undefined): string {
  return String(value || "").trim();
}

function toKey(value: string | null | undefined): string {
  return normalizeString(value).toLowerCase();
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => normalizeString(value)).filter(Boolean))];
}

function sortAlpha(values: string[]): string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}

export async function fetchLocationIconMappings({
  supabase,
  locationId,
}: {
  supabase: SupabaseClient;
  locationId: string;
}): Promise<GingrIconMappingRow[]> {
  const { data, error } = await supabase
    .from("gingr_icon_mappings")
    .select("id, location_id, capability_key, icon_template_id, icon_identity_key, icon_group, is_active")
    .eq("location_id", locationId)
    .eq("is_active", true);

  if (error) throw error;
  return (data || []) as GingrIconMappingRow[];
}

export async function fetchLocationIconInventory({
  supabase,
  locationId,
}: {
  supabase: SupabaseClient;
  locationId: string;
}): Promise<GingrIconInventoryRow[]> {
  const { data, error } = await supabase
    .from("v_gingr_icon_inventory_current")
    .select("*")
    .eq("location_id", locationId)
    .order("icon_group")
    .order("current_title");

  if (error) throw error;
  return (data || []) as GingrIconInventoryRow[];
}

function mappingMatchesIcon(mapping: GingrIconMappingRow, icon: GingrAnimalIconRow): boolean {
  const mappingTemplateId = normalizeString(mapping.icon_template_id);
  const iconTemplateId = normalizeString(icon.icon_template_id);
  if (mappingTemplateId && iconTemplateId) {
    return mappingTemplateId === iconTemplateId;
  }

  const mappingIdentityKey = normalizeString(mapping.icon_identity_key);
  const iconIdentityKey = normalizeString(icon.icon_identity_key);
  if (mappingIdentityKey && iconIdentityKey) {
    return mappingIdentityKey === iconIdentityKey;
  }

  return false;
}

function getFallbackCapabilities(icon: GingrAnimalIconRow): string[] {
  const titleKey = toKey(icon.icon_title);
  const groupKey = toKey(icon.icon_group);
  const capabilities: string[] = [];

  if (groupKey === "play" && PLAY_FALLBACK_CAPABILITIES[titleKey]) {
    capabilities.push(PLAY_FALLBACK_CAPABILITIES[titleKey]);
  }

  if (groupKey === "bath" || groupKey === "bathing") {
    capabilities.push("bathing.include");

    const typeLabel = normalizeBathTypeLabel(icon.icon_title);
    const modifierLabel = normalizeBathModifierLabel(icon.icon_title);

    if (typeLabel) {
      const matchedCapability = Object.entries(BATH_TYPE_CAPABILITY_LABELS).find(([, label]) => label === typeLabel)?.[0];
      if (matchedCapability) capabilities.push(matchedCapability);
    }

    if (modifierLabel) {
      const matchedCapability = Object.entries(BATH_MODIFIER_CAPABILITY_LABELS).find(([, label]) => label === modifierLabel)?.[0];
      if (matchedCapability) capabilities.push(matchedCapability);
    }
  }

  return uniqueStrings(capabilities);
}

export function getCapabilitiesForIcon(
  icon: GingrAnimalIconRow,
  mappings: GingrIconMappingRow[] = [],
): string[] {
  const explicitMatches = mappings
    .filter((mapping) => normalizeString(mapping.capability_key) && mappingMatchesIcon(mapping, icon))
    .map((mapping) => normalizeString(mapping.capability_key));

  if (explicitMatches.length > 0) {
    return uniqueStrings(explicitMatches);
  }

  return getFallbackCapabilities(icon);
}

export function resolveBathDisplayFromIconRows(args: {
  iconRows?: GingrAnimalIconRow[] | null;
  mappings?: GingrIconMappingRow[] | null;
  addonType?: string | null;
  serviceName?: string | null;
  rawModifiers?: string[] | null;
  defaultType?: string | null;
}) {
  const iconRows = args.iconRows || [];
  const mappings = args.mappings || [];
  const typeLabels = new Set<string>();
  const modifierLabels = new Set<string>();
  const unmatchedBathTitles: string[] = [];
  const rawTitlesForFallback: string[] = [];

  for (const icon of iconRows) {
    const capabilities = getCapabilitiesForIcon(icon, mappings);
    const iconTitle = normalizeString(icon.icon_title);
    let matched = false;

    for (const capability of capabilities) {
      const typeLabel = BATH_TYPE_CAPABILITY_LABELS[capability];
      const modifierLabel = BATH_MODIFIER_CAPABILITY_LABELS[capability];

      if (typeLabel) {
        typeLabels.add(typeLabel);
        matched = true;
      }
      if (modifierLabel) {
        modifierLabels.add(modifierLabel);
        matched = true;
      }
    }

    if (iconTitle) {
      rawTitlesForFallback.push(iconTitle);
      if (!matched && (toKey(icon.icon_group) === "bath" || toKey(icon.icon_group) === "bathing")) {
        unmatchedBathTitles.push(iconTitle);
      }
    }
  }

  const fallbackDisplay = normalizeBathDisplay({
    iconTitles: rawTitlesForFallback,
    addonType: args.addonType,
    serviceName: args.serviceName,
    rawModifiers: args.rawModifiers,
    defaultType: args.defaultType,
  });

  const mergedBathIcons = uniqueStrings([
    ...fallbackDisplay.bathIcons,
    ...typeLabels,
    ...unmatchedBathTitles,
  ]);
  const mergedBathModifiers = uniqueStrings([
    ...fallbackDisplay.bathModifiers,
    ...modifierLabels,
  ]);

  return {
    bathType: mergedBathIcons[0] || fallbackDisplay.bathType || "Standard",
    bathIcons: sortAlpha(mergedBathIcons),
    bathModifiers: sortAlpha(mergedBathModifiers),
    unmatchedBathTitles: sortAlpha(uniqueStrings(unmatchedBathTitles)),
  };
}

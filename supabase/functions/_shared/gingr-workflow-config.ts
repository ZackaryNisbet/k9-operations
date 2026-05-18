type SupabaseClient = any;

export interface GingrWorkflowMappingRow {
  id?: string | number;
  location_id?: string;
  workflow_key?: string | null;
  source_type?: string | null;
  source_id?: string | null;
  source_identity_key?: string | null;
  source_label?: string | null;
  capability_key?: string | null;
  settings?: Record<string, any> | null;
  is_active?: boolean | null;
}

export interface GingrWorkflowSettingRow {
  location_id?: string;
  workflow_key?: string | null;
  label?: string | null;
  settings?: Record<string, any> | null;
  is_active?: boolean | null;
}

export interface GingrWorkflowConfig {
  locationId: string;
  mappings: GingrWorkflowMappingRow[];
  settings: Record<string, Record<string, any>>;
  hasMappings: boolean;
}

export interface ConfiguredWorkflowService {
  id: string;
  name: string;
  scheduledAt: string;
  completedAt: string;
  capabilities: string[];
  raw: any;
}

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

function clean(value: string | null | undefined): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function key(value: string | null | undefined): string {
  return clean(value).toLowerCase();
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => clean(value)).filter(Boolean))];
}

function sourceLabel(source: any): string {
  if (typeof source === "string") return clean(source);
  return clean(source?.name || source?.service_name || source?.label || source?.title || source?.type || "");
}

function sourceId(source: any): string {
  if (!source || typeof source === "string") return "";
  return clean(source?.id || source?.service_id || source?.addon_id || source?.value || "");
}

export function getBathTypeLabelForCapability(capability: string | null | undefined): string | null {
  return BATH_TYPE_CAPABILITY_LABELS[clean(capability)] || null;
}

export function getBathModifierLabelForCapability(capability: string | null | undefined): string | null {
  return BATH_MODIFIER_CAPABILITY_LABELS[clean(capability)] || null;
}

export async function loadGingrWorkflowConfig({
  supabase,
  locationId,
}: {
  supabase: SupabaseClient;
  locationId: string;
}): Promise<GingrWorkflowConfig> {
  const [{ data: mappingRows, error: mappingError }, { data: settingRows, error: settingError }] = await Promise.all([
    supabase
      .from("gingr_workflow_mappings")
      .select("id, location_id, workflow_key, source_type, source_id, source_identity_key, source_label, capability_key, settings, is_active")
      .eq("location_id", locationId)
      .eq("is_active", true),
    supabase
      .from("gingr_workflow_settings")
      .select("location_id, workflow_key, label, settings, is_active")
      .eq("location_id", locationId)
      .eq("is_active", true),
  ]);

  // During staged deploys the function can briefly run before the migration.
  // Return an empty config instead of falling back to Adair Forsythe assumptions.
  if (mappingError && !String(mappingError.message || "").includes("does not exist")) throw mappingError;
  if (settingError && !String(settingError.message || "").includes("does not exist")) throw settingError;

  const settings: Record<string, Record<string, any>> = {};
  for (const row of (settingRows || []) as GingrWorkflowSettingRow[]) {
    const workflowKey = clean(row.workflow_key);
    if (!workflowKey) continue;
    settings[workflowKey] = {
      ...(settings[workflowKey] || {}),
      ...(row.settings || {}),
    };
  }

  const mappings = ((mappingRows || []) as GingrWorkflowMappingRow[])
    .filter((row) => clean(row.workflow_key) && clean(row.capability_key));

  return {
    locationId,
    mappings,
    settings,
    hasMappings: mappings.length > 0,
  };
}

export function getWorkflowNumberSetting(
  config: GingrWorkflowConfig | null | undefined,
  workflowKey: string,
  settingKey: string,
  fallback: number,
): number {
  const direct = Number(config?.settings?.[workflowKey]?.[settingKey]);
  if (Number.isFinite(direct) && direct > 0) return direct;

  for (const mapping of config?.mappings || []) {
    if (clean(mapping.workflow_key) !== workflowKey) continue;
    const mapped = Number(mapping.settings?.[settingKey]);
    if (Number.isFinite(mapped) && mapped > 0) return mapped;
  }

  return fallback;
}

export function getSourceIdentityKeys(sourceType: string, source: any): string[] {
  const id = sourceId(source);
  const label = sourceLabel(source);
  const labelKey = key(label);
  const keys: string[] = [];

  if (sourceType === "service") {
    if (id) keys.push(`service:${id}`, id);
    if (labelKey) keys.push(`service_name:${labelKey}`, labelKey);
  } else if (sourceType === "service_addon") {
    if (id) keys.push(`service_addon:${id}`, `addon:${id}`, id);
    if (labelKey) keys.push(`service_addon_name:${labelKey}`, `addon_name:${labelKey}`, labelKey);
  } else if (sourceType === "reservation_type") {
    if (id) keys.push(`reservation_type:${id}`, id);
    if (labelKey) keys.push(`reservation_type_name:${labelKey}`, labelKey);
  } else {
    if (id) keys.push(`${sourceType}:${id}`, id);
    if (labelKey) keys.push(`${sourceType}_name:${labelKey}`, labelKey);
  }

  return unique(keys);
}

export function getCapabilitiesForSource({
  config,
  workflowKey,
  sourceType,
  source,
}: {
  config: GingrWorkflowConfig | null | undefined;
  workflowKey: string;
  sourceType: string;
  source: any;
}): string[] {
  if (!config) return [];
  const id = sourceId(source);
  const labelKey = key(sourceLabel(source));
  const identityKeys = new Set(getSourceIdentityKeys(sourceType, source));

  return unique(
    config.mappings
      .filter((mapping) => {
        if (clean(mapping.workflow_key) !== workflowKey) return false;
        if (clean(mapping.source_type) !== sourceType) return false;
        const mappingIdentity = clean(mapping.source_identity_key);
        const mappingSourceId = clean(mapping.source_id);
        const mappingLabel = key(mapping.source_label);
        return (
          (!!mappingIdentity && identityKeys.has(mappingIdentity)) ||
          (!!mappingSourceId && !!id && mappingSourceId === id) ||
          (!!mappingLabel && !!labelKey && mappingLabel === labelKey)
        );
      })
      .map((mapping) => clean(mapping.capability_key)),
  );
}

export function getCapabilitiesForSourceTypes({
  config,
  workflowKey,
  sourceTypes,
  source,
}: {
  config: GingrWorkflowConfig | null | undefined;
  workflowKey: string;
  sourceTypes: string[];
  source: any;
}): string[] {
  return unique(
    sourceTypes.flatMap((sourceType) =>
      getCapabilitiesForSource({ config, workflowKey, sourceType, source })
    ),
  );
}

export function sourceHasCapability(args: {
  config: GingrWorkflowConfig | null | undefined;
  workflowKey: string;
  sourceType: string;
  source: any;
  capabilityKey: string;
}): boolean {
  return getCapabilitiesForSource(args).includes(args.capabilityKey);
}

export function sourceHasCapabilityForSourceTypes(args: {
  config: GingrWorkflowConfig | null | undefined;
  workflowKey: string;
  sourceTypes: string[];
  source: any;
  capabilityKey: string;
}): boolean {
  return getCapabilitiesForSourceTypes(args).includes(args.capabilityKey);
}

export function workflowConfigHasCapability(
  config: GingrWorkflowConfig | null | undefined,
  workflowKey: string,
  capabilityKeyOrPrefix: string,
): boolean {
  const target = clean(capabilityKeyOrPrefix);
  return (config?.mappings || []).some((mapping) => {
    if (clean(mapping.workflow_key) !== workflowKey) return false;
    const capability = clean(mapping.capability_key);
    return capability === target || capability.startsWith(target);
  });
}

export function reservationTypeHasCapability(
  config: GingrWorkflowConfig | null | undefined,
  workflowKey: string,
  reservationType: any,
  capabilityKey: string,
): boolean {
  return sourceHasCapability({
    config,
    workflowKey,
    sourceType: "reservation_type",
    source: reservationType,
    capabilityKey,
  });
}

export function getReservationCategoryFromConfig(
  config: GingrWorkflowConfig | null | undefined,
  reservationType: any,
): string | null {
  const capabilities = getCapabilitiesForSource({
    config,
    workflowKey: "reservation_categories",
    sourceType: "reservation_type",
    source: reservationType,
  });
  const match = capabilities.find((capability) => capability.startsWith("reservation.category."));
  return match ? match.replace("reservation.category.", "") : null;
}

function serviceDateValue(service: any, field: string): string {
  if (!service || typeof service === "string") return "";
  return String(service?.[field] || "");
}

export function extractConfiguredWorkflowServices(
  rawServices: any[] = [],
  topServices: any[] = [],
  config: GingrWorkflowConfig | null | undefined,
  workflowKey: string,
  includeCapability: string | null = null,
  sourceTypes: string[] = ["service", "service_addon"],
): ConfiguredWorkflowService[] {
  const deduped = new Map<string, ConfiguredWorkflowService>();

  for (const service of [...rawServices, ...topServices]) {
    const name = sourceLabel(service);
    if (!name) continue;
    const capabilities = getCapabilitiesForSourceTypes({
      config,
      workflowKey,
      sourceTypes,
      source: service,
    });
    if (includeCapability && !capabilities.includes(includeCapability)) continue;
    if (!includeCapability && capabilities.length === 0) continue;

    const scheduledAt = serviceDateValue(service, "scheduled_at") || serviceDateValue(service, "scheduled_date");
    const completedAt = serviceDateValue(service, "completed_at");
    const id = sourceId(service);
    const dedupeKey = `${id || key(name)}|${scheduledAt}`;

    if (!deduped.has(dedupeKey)) {
      deduped.set(dedupeKey, {
        id,
        name,
        scheduledAt,
        completedAt,
        capabilities,
        raw: service,
      });
    }
  }

  return [...deduped.values()].sort((a, b) => {
    const aDate = a.scheduledAt.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || "9999-12-31";
    const bDate = b.scheduledAt.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || "9999-12-31";
    if (aDate !== bDate) return aDate.localeCompare(bDate);
    return a.name.localeCompare(b.name);
  });
}

export function resolveBathDisplayFromServiceCapabilities(services: ConfiguredWorkflowService[]): {
  addonType: string | null;
  modifiers: string[];
} {
  let addonType: string | null = null;
  const modifiers = new Set<string>();

  for (const service of services) {
    for (const capability of service.capabilities) {
      const typeLabel = getBathTypeLabelForCapability(capability);
      const modifierLabel = getBathModifierLabelForCapability(capability);
      if (typeLabel && !addonType) addonType = typeLabel;
      if (modifierLabel) modifiers.add(modifierLabel);
    }
  }

  return {
    addonType,
    modifiers: [...modifiers].sort((a, b) => a.localeCompare(b)),
  };
}

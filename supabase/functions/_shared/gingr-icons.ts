type SupabaseClient = any;

export type GingrConfig = {
  subdomain: string;
  apiKey: string;
};

const gingrIconBatchSize = 200;
const gingrIconRetryDelaysMs = [250, 750, 1500];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function buildIconIdentityKey({
  iconTemplateId,
  iconGroup,
  iconTitle,
}: {
  iconTemplateId: string | null | undefined;
  iconGroup: string | null | undefined;
  iconTitle: string | null | undefined;
}) {
  return [
    String(iconTemplateId || "").trim(),
    String(iconGroup || "").trim().toLowerCase(),
    String(iconTitle || "").trim().toLowerCase(),
  ].join("::");
}

export async function getGingrConfigForLocation(
  supabase: SupabaseClient,
  locationId: string,
): Promise<GingrConfig | null> {
  const { data: settingsRow, error: settingsError } = await supabase
    .from("lite_settings")
    .select("setting_value")
    .eq("location_id", locationId)
    .eq("setting_key", "gingr_config")
    .maybeSingle();

  if (settingsError) throw settingsError;

  const config = settingsRow?.setting_value || {};
  if (!config?.subdomain || !config?.api_key) {
    return null;
  }

  return {
    subdomain: String(config.subdomain),
    apiKey: String(config.api_key),
  };
}

async function fetchLiveIconsForAnimalBatch(
  subdomain: string,
  apiKey: string,
  animalIds: string[],
) {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= gingrIconRetryDelaysMs.length; attempt += 1) {
    try {
      const params = new URLSearchParams();
      params.append("key", apiKey);
      params.append("animal_ids", JSON.stringify(animalIds.map(Number)));
      params.append("owner_ids", "null");

      const response = await fetch(`https://${subdomain}.gingrapp.com/api/v1/get_icons`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
        body: params.toString(),
      });

      if (!response.ok) {
        throw new Error(`get_icons error ${response.status}: ${await response.text()}`);
      }

      const result = await response.json();
      if (!result?.success) {
        throw new Error(`get_icons failed: ${JSON.stringify(result).slice(0, 200)}`);
      }

      return result?.data?.animals || {};
    } catch (error: any) {
      lastError = error instanceof Error ? error : new Error(String(error || "Unknown get_icons error"));
      if (attempt >= gingrIconRetryDelaysMs.length) break;
      await sleep(gingrIconRetryDelaysMs[attempt]);
    }
  }

  throw lastError || new Error("get_icons failed");
}

export async function upsertAnimalIconsFromGingr({
  supabase,
  locationId,
  gingrConfig,
  animalIds,
}: {
  supabase: SupabaseClient;
  locationId: string;
  gingrConfig: GingrConfig | null;
  animalIds: string[];
}) {
  if (!gingrConfig || !animalIds.length) {
    return { synced: 0, animals: 0, skipped: true };
  }

  const normalizedAnimalIds = [...new Set(
    animalIds
      .map((animalId) => String(animalId || "").trim())
      .filter(Boolean),
  )];

  if (!normalizedAnimalIds.length) {
    return { synced: 0, animals: 0, skipped: true };
  }

  const iconRows: any[] = [];
  const seenAnimalIds = new Set<string>();
  const now = new Date().toISOString();

  for (let i = 0; i < normalizedAnimalIds.length; i += gingrIconBatchSize) {
    const batch = normalizedAnimalIds.slice(i, i + gingrIconBatchSize);
    const animalsData = await fetchLiveIconsForAnimalBatch(
      gingrConfig.subdomain,
      gingrConfig.apiKey,
      batch,
    );

    for (const [animalId, animalEntry] of Object.entries(animalsData) as [string, any][]) {
      seenAnimalIds.add(animalId);
      for (const icon of animalEntry?.icons || []) {
        const iconTemplateId = String(icon?.color_label_template_id || icon?.id || "");
        const iconGroup = icon?.name || null;
        const iconTitle = icon?.title || null;
        iconRows.push({
          location_id: locationId,
          animal_gingr_id: animalId,
          icon_template_id: iconTemplateId,
          icon_identity_key: buildIconIdentityKey({
            iconTemplateId,
            iconGroup,
            iconTitle,
          }),
          icon_title: iconTitle,
          icon_group: iconGroup,
          icon_color: icon?.color || null,
          icon_class: icon?.class || null,
          icon_comment: icon?.comment || null,
          synced_at: now,
          first_seen_at: now,
          last_seen_at: now,
        });
      }
    }
  }

  const deduped = new Map<string, any>();
  for (const row of iconRows) {
    deduped.set(`${row.location_id}|${row.animal_gingr_id}|${row.icon_identity_key}`, row);
  }
  const dedupedRows = [...deduped.values()];

  for (let i = 0; i < dedupedRows.length; i += 500) {
    const chunk = dedupedRows.slice(i, i + 500);
    const { error } = await supabase
      .from("gingr_animal_icons_live")
      .upsert(chunk, { onConflict: "location_id,animal_gingr_id,icon_identity_key" });
    if (error) {
      throw new Error(`gingr_animal_icons_live upsert error: ${error.message}`);
    }
  }

  const freshKeys = new Set(
    dedupedRows.map((row) => `${row.animal_gingr_id}|${row.icon_identity_key}`),
  );

  for (let i = 0; i < normalizedAnimalIds.length; i += 500) {
    const chunk = normalizedAnimalIds.slice(i, i + 500);
    const { data: existing, error } = await supabase
      .from("gingr_animal_icons_live")
      .select("id, animal_gingr_id, icon_identity_key")
      .eq("location_id", locationId)
      .in("animal_gingr_id", chunk);

    if (error) {
      throw new Error(`gingr_animal_icons_live select error: ${error.message}`);
    }

    const staleIds = (existing || [])
      .filter((row: any) => !freshKeys.has(`${row.animal_gingr_id}|${row.icon_identity_key}`))
      .map((row: any) => row.id);

    for (let j = 0; j < staleIds.length; j += 500) {
      const deleteIds = staleIds.slice(j, j + 500);
      const { error: deleteError } = await supabase
        .from("gingr_animal_icons_live")
        .delete()
        .in("id", deleteIds);

      if (deleteError) {
        throw new Error(`gingr_animal_icons_live delete error: ${deleteError.message}`);
      }
    }
  }

  return {
    synced: dedupedRows.length,
    animals: seenAnimalIds.size,
    skipped: false,
  };
}

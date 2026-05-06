import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import {
  ENRICHMENT_PROGRAM_CONFIG_SETTING_KEY,
  normalizeEnrichmentProgramConfig,
  prepareEnrichmentProgramConfigPayload,
} from "../kol/enrichments/enrichmentData";

export function useEnrichmentProgramConfig(locationId, actorName = "Enterprise Admin") {
  const [config, setConfig] = useState(() => normalizeEnrichmentProgramConfig());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const refresh = useCallback(() => setRefreshToken((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!locationId) {
        setConfig(normalizeEnrichmentProgramConfig());
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const { data, error: loadError } = await supabase
          .from("lite_settings")
          .select("setting_value, updated_at")
          .eq("location_id", locationId)
          .eq("setting_key", ENRICHMENT_PROGRAM_CONFIG_SETTING_KEY)
          .maybeSingle();

        if (loadError) throw loadError;
        if (!cancelled) {
          setConfig(normalizeEnrichmentProgramConfig({
            ...(data?.setting_value || {}),
            updatedAt: data?.setting_value?.updatedAt || data?.updated_at || null,
          }));
        }
      } catch (loadError) {
        console.error("[enrichment program config] load failed:", loadError);
        if (!cancelled) {
          setError(loadError);
          setConfig(normalizeEnrichmentProgramConfig());
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [locationId, refreshToken]);

  const saveConfig = useCallback(async (nextConfig) => {
    if (!locationId) throw new Error("Missing location.");
    const payload = prepareEnrichmentProgramConfigPayload(nextConfig, actorName);
    setSaving(true);
    setError(null);
    try {
      const { error: saveError } = await supabase
        .from("lite_settings")
        .upsert({
          location_id: locationId,
          setting_key: ENRICHMENT_PROGRAM_CONFIG_SETTING_KEY,
          setting_value: payload,
        }, { onConflict: "location_id,setting_key" });
      if (saveError) throw saveError;
      setConfig(payload);
      return payload;
    } catch (saveError) {
      setError(saveError);
      throw saveError;
    } finally {
      setSaving(false);
    }
  }, [actorName, locationId]);

  return {
    config,
    loading,
    saving,
    error,
    refresh,
    saveConfig,
  };
}

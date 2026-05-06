import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import { buildPlaygroupAssignmentMap } from "../shared/playgroupAssignments";
import {
  ENRICHMENT_WORKFLOW_REFRESH_MS,
  buildEnrichmentCompletionKey,
  buildEnrichmentOpsRowId,
  deriveWorkflowHealth,
  getWorkflowDogId,
  getWorkflowRefreshState,
  normalizeEnrichmentWorkflow,
} from "../kol/enrichments/enrichmentWorkflowData";

export function useEnrichmentWorkflow(locationId, reportDate, { actorName = "Staff", autoCompute = true } = {}) {
  const [computedItems, setComputedItems] = useState(null);
  const [completions, setCompletions] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [lastSuccessAt, setLastSuccessAt] = useState(null);
  const [lastStartedAt, setLastStartedAt] = useState(null);
  const [dogContextMap, setDogContextMap] = useState({ photos: {}, playgroups: {} });
  const [auditLog, setAuditLog] = useState([]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const autoComputeKeysRef = useRef(new Set());

  const rowId = useMemo(() => reportDate ? buildEnrichmentOpsRowId(reportDate) : "", [reportDate]);
  const completionKey = useMemo(() => reportDate ? buildEnrichmentCompletionKey(reportDate) : "", [reportDate]);

  const appendAudit = useCallback((entry) => {
    setAuditLog((current) => [{
      id: `${entry.startedAt || new Date().toISOString()}-${entry.source || "read"}`,
      ...entry,
    }, ...current].slice(0, 12));
  }, []);

  const loadDogContextMap = useCallback(async (items) => {
    const animalIds = [...new Set((items?.dogs || []).map((dog) => getWorkflowDogId(dog)).filter(Boolean))];
    if (animalIds.length === 0) {
      setDogContextMap({ photos: {}, playgroups: {} });
      return;
    }
    try {
      const [photoResult, playgroupResult] = await Promise.all([
        supabase
          .from("gingr_animals")
          .select("gingr_id, local_photo_url, image_url")
          .in("gingr_id", animalIds),
        locationId
          ? supabase
            .from("v_dog_playgroup_assignments_current")
            .select("animal_gingr_id, size_group, has_private_play, has_evaluation, is_half_and_half, primary_display_playgroup, scheduling_playgroup, playgroup_tags, source_icon_titles, source_icon_comments, half_and_half_note, unresolved_reason")
            .eq("location_id", locationId)
            .in("animal_gingr_id", animalIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      const photos = {};
      if (photoResult.error) {
        console.warn("[enrichment workflow] photo load failed:", photoResult.error?.message || photoResult.error);
      } else {
        for (const animal of photoResult.data || []) {
          photos[String(animal.gingr_id)] = animal.local_photo_url || animal.image_url || "";
        }
      }

      let playgroups = {};
      if (playgroupResult.error) {
        console.warn("[enrichment workflow] playgroup icon load failed:", playgroupResult.error?.message || playgroupResult.error);
      } else {
        playgroups = buildPlaygroupAssignmentMap(playgroupResult.data || []);
      }

      setDogContextMap({ photos, playgroups });
    } catch (dogContextError) {
      console.warn("[enrichment workflow] dog context load failed:", dogContextError?.message || dogContextError);
      setDogContextMap({ photos: {}, playgroups: {} });
    }
  }, [locationId]);

  const load = useCallback(async ({ showLoading = true } = {}) => {
    if (!locationId || !reportDate || !rowId || !completionKey) {
      setComputedItems(null);
      setCompletions({});
      setLoading(false);
      return;
    }
    if (showLoading) setLoading(true);
    setError(null);

    try {
      const [opsResult, completionResult] = await Promise.all([
        supabase
          .from("lite_daily_ops")
          .select("id, computed_items, computed_at, updated_at")
          .eq("location_id", locationId)
          .eq("id", rowId)
          .maybeSingle(),
        supabase
          .from("lite_settings")
          .select("setting_value, updated_at")
          .eq("location_id", locationId)
          .eq("setting_key", completionKey)
          .maybeSingle(),
      ]);

      if (opsResult.error) throw opsResult.error;
      if (completionResult.error) throw completionResult.error;

      const nextComputedItems = opsResult.data?.computed_items || null;
      setComputedItems(nextComputedItems);
      setCompletions(completionResult.data?.setting_value || {});
      await loadDogContextMap(nextComputedItems);
      setLastSuccessAt(nextComputedItems ? (opsResult.data?.computed_at || opsResult.data?.updated_at || new Date().toISOString()) : null);
    } catch (loadError) {
      console.error("[enrichment workflow] load failed:", loadError);
      setError(loadError);
    } finally {
      setLoading(false);
    }
  }, [completionKey, loadDogContextMap, locationId, reportDate, rowId]);

  const refresh = useCallback(async ({ silent = false } = {}) => {
    if (!locationId || !reportDate) return null;
    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    setLastStartedAt(startedAt);
    setRefreshing(true);
    if (!silent) setError(null);

    try {
      const { data, error: invokeError } = await supabase.functions.invoke("ops-compute-ondemand", {
        body: { location_id: locationId, date: reportDate, kind: "enrichment", refresh: true },
      });
      if (invokeError) throw invokeError;
      if (data?.enrichment) {
        setComputedItems(data.enrichment);
        setLastSuccessAt(new Date().toISOString());
        await loadDogContextMap(data.enrichment);
      }
      await load({ showLoading: false });
      const dogs = data?.enrichment?.dogs || [];
      appendAudit({
        source: silent ? "auto refresh" : "manual refresh",
        status: "success",
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startedMs,
        scheduledCount: Number(data?.enrichment?.scheduledCount || dogs.filter((dog) => String(dog.status || "").toLowerCase() !== "needs_review").length || 0),
        needsReviewCount: Number(data?.enrichment?.suggestedCount || dogs.filter((dog) => String(dog.status || "").toLowerCase() === "needs_review" || dog.isSuggested).length || 0),
        rowCount: dogs.length,
      });
      return data;
    } catch (refreshError) {
      console.error("[enrichment workflow] refresh failed:", refreshError);
      setError(refreshError);
      appendAudit({
        source: silent ? "auto refresh" : "manual refresh",
        status: "error",
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startedMs,
        error: refreshError?.message || "Refresh failed",
      });
      if (!silent) throw refreshError;
      return null;
    } finally {
      setRefreshing(false);
    }
  }, [appendAudit, load, loadDogContextMap, locationId, reportDate]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!locationId || !reportDate) return undefined;
    const timer = setInterval(() => load({ showLoading: false }), ENRICHMENT_WORKFLOW_REFRESH_MS);
    return () => clearInterval(timer);
  }, [load, locationId, reportDate]);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!autoCompute || !locationId || !reportDate) return undefined;
    const key = `${locationId}:${reportDate}`;
    if (autoComputeKeysRef.current.has(key)) return undefined;
    autoComputeKeysRef.current.add(key);
    const timer = setTimeout(() => {
      refresh({ silent: true });
    }, 250);
    return () => clearTimeout(timer);
  }, [autoCompute, locationId, refresh, reportDate]);

  useEffect(() => {
    if (!locationId || !reportDate) return undefined;
    const channel = supabase
      .channel(`enrichment-workflow-${locationId}-${reportDate}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "lite_daily_ops",
          filter: `location_id=eq.${locationId}`,
        },
        (payload) => {
          const row = payload?.new || payload?.old;
          if (row?.id === rowId) load({ showLoading: false });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "lite_settings",
          filter: `location_id=eq.${locationId}`,
        },
        (payload) => {
          const row = payload?.new || payload?.old;
          if (row?.setting_key === completionKey) setCompletions(payload?.new?.setting_value || {});
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [completionKey, load, locationId, reportDate, rowId]);

  const workflow = useMemo(
    () => normalizeEnrichmentWorkflow(computedItems, completions, dogContextMap.photos, dogContextMap.playgroups),
    [computedItems, completions, dogContextMap]
  );

  const health = useMemo(
    () => deriveWorkflowHealth({ lastSuccessAt, error, nowMs }),
    [error, lastSuccessAt, nowMs]
  );

  const refreshState = useMemo(() => {
    const state = getWorkflowRefreshState(lastSuccessAt, nowMs);
    return {
      ...state,
      isRefreshing: refreshing || loading,
      label: refreshing || loading ? "Refreshing" : state.label,
      lastStartedAt,
    };
  }, [lastStartedAt, lastSuccessAt, loading, nowMs, refreshing]);

  const toggleDog = useCallback(async (dog, forceValue = null) => {
    const dogId = getWorkflowDogId(dog);
    if (!dogId || !locationId || !completionKey) return;

    const previous = completions;
    const next = { ...completions };
    const shouldComplete = forceValue == null ? !next[dogId] : !!forceValue;
    if (shouldComplete) {
      next[dogId] = { by: actorName || "Staff", at: new Date().toISOString() };
    } else {
      delete next[dogId];
    }

    setCompletions(next);
    const { error: saveError } = await supabase.from("lite_settings").upsert({
      location_id: locationId,
      setting_key: completionKey,
      setting_value: next,
    }, { onConflict: "location_id,setting_key" });

    if (saveError) {
      setCompletions(previous);
      setError(saveError);
      throw saveError;
    }
  }, [actorName, completionKey, completions, locationId]);

  return {
    workflow,
    completions,
    loading,
    refreshing,
    error,
    health,
    refreshState,
    lastSuccessAt,
    lastStartedAt,
    auditLog,
    refresh,
    toggleDog,
  };
}

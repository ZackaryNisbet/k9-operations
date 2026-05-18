import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabaseClient";
import { C } from "../../shared/theme";
import { Card } from "../../shared/ui";
import K9LoadingAnimation from "../../shared/K9LoadingAnimation";
import { useAuth } from "../../AuthProvider";

const PLAY_CAPABILITIES = [
  { key: "play.private_play", label: "Private Play" },
  { key: "play.large_daycare", label: "Large Daycare" },
  { key: "play.small_daycare", label: "Small Daycare" },
  { key: "play.evaluation", label: "Evaluation" },
];

const BATHING_CAPABILITIES = [
  { key: "bathing.include", label: "Include In Bathing" },
  { key: "bathing.type.standard", label: "Bath: Standard" },
  { key: "bathing.type.premium", label: "Bath: Premium" },
  { key: "bathing.type.medicated", label: "Bath: Medicated" },
  { key: "bathing.type.whitening", label: "Bath: Whitening" },
  { key: "bathing.type.shampoo_from_home", label: "Bath: Shampoo From Home" },
  { key: "bathing.type.hypoallergenic", label: "Bath: Hypoallergenic" },
  { key: "bathing.type.hypoallergenic_no_spray", label: "Bath: Hypo - No Spray" },
  { key: "bathing.type.hypoallergenic_with_spray", label: "Bath: Hypo - With Spray" },
  { key: "bathing.type.water_rinse", label: "Bath: Water Rinse" },
  { key: "bathing.type.fresh_n_clean", label: "Bath: Fresh N Clean" },
  { key: "bathing.modifier.no_dryer", label: "Modifier: No Dryer" },
  { key: "bathing.modifier.no_crate_dryer", label: "Modifier: No Crate Dryer" },
  { key: "bathing.modifier.no_velocity_dryer", label: "Modifier: No Velocity Dryer" },
  { key: "bathing.modifier.towel_dry_only", label: "Modifier: Towel Dry Only" },
  { key: "bathing.modifier.see_account_notes", label: "Modifier: See Account Notes" },
];

const RESERVATION_CATEGORY_OPTIONS = [
  { key: "", label: "Unmapped" },
  { key: "boarding", label: "Boarding / Lodging" },
  { key: "daycare", label: "Daycare" },
  { key: "day_boarding", label: "Day Boarding" },
  { key: "evaluation", label: "Evaluation" },
  { key: "grooming", label: "Grooming" },
  { key: "tour", label: "Tour" },
  { key: "other", label: "Other" },
];

const BATH_TYPE_OPTIONS = [
  { key: "", label: "No Bath Type" },
  { key: "bathing.type.standard", label: "Standard" },
  { key: "bathing.type.premium", label: "Premium" },
  { key: "bathing.type.medicated", label: "Medicated" },
  { key: "bathing.type.whitening", label: "Whitening" },
  { key: "bathing.type.shampoo_from_home", label: "Shampoo From Home" },
  { key: "bathing.type.hypoallergenic", label: "Hypoallergenic" },
  { key: "bathing.type.hypoallergenic_no_spray", label: "Hypo - No Spray" },
  { key: "bathing.type.hypoallergenic_with_spray", label: "Hypo - With Spray" },
  { key: "bathing.type.water_rinse", label: "Water Rinse" },
  { key: "bathing.type.fresh_n_clean", label: "Fresh N Clean" },
];

const BATH_TYPE_KEYS = new Set(BATH_TYPE_OPTIONS.map((option) => option.key).filter(Boolean));

function getCapabilitiesForGroup(group) {
  const normalized = String(group || "").trim().toLowerCase();
  if (normalized === "play") return PLAY_CAPABILITIES;
  if (normalized === "bath") return BATHING_CAPABILITIES;
  return [];
}

function formatStamp(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

function getInventoryKey(row) {
  return row.inventory_key || row.icon_template_id || row.icon_identity_key;
}

function summarizeSupabaseError(error) {
  if (!error) return "";
  return String(error.message || error.details || error.hint || "Request failed");
}

function getGingrSyncEntityErrors(data) {
  const results = data?.results || {};
  return Object.entries(results)
    .filter(([, value]) => value?.error)
    .map(([entity, value]) => `${entity}: ${value.error}`);
}

function sourceIdentity(prefix, id, label) {
  const cleanId = String(id || "").trim();
  if (cleanId) return `${prefix}:${cleanId}`;
  return `${prefix}_name:${String(label || "").trim().replace(/\s+/g, " ").toLowerCase()}`;
}

function sourceLabel(row, ...fields) {
  for (const field of fields) {
    const value = String(row?.[field] || "").trim();
    if (value) return value;
  }
  return "Unnamed";
}

export default function GingrIconsTab({ locationId: routedLocationId } = {}) {
  const { profile } = useAuth();
  const locationId = routedLocationId || profile?.location_id || "";
  const [inventory, setInventory] = useState([]);
  const [mappingStatusRows, setMappingStatusRows] = useState([]);
  const [workflowMappingRows, setWorkflowMappingRows] = useState([]);
  const [serviceRows, setServiceRows] = useState([]);
  const [addonRows, setAddonRows] = useState([]);
  const [reservationTypeRows, setReservationTypeRows] = useState([]);
  const [syncStatus, setSyncStatus] = useState(null);
  const [search, setSearch] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [savingKey, setSavingKey] = useState("");
  const [workflowSavingKey, setWorkflowSavingKey] = useState("");
  const [requiredSessionsInput, setRequiredSessionsInput] = useState("3");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshingReference, setRefreshingReference] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionMessage, setActionMessage] = useState(null);

  const loadData = useCallback(async () => {
    if (!locationId || locationId === "enterprise") {
      setInventory([]);
      setMappingStatusRows([]);
      setWorkflowMappingRows([]);
      setServiceRows([]);
      setAddonRows([]);
      setReservationTypeRows([]);
      setSyncStatus(null);
      setLoaded(true);
      setLoadError("Select a resort location before configuring GINGR workflow mappings.");
      return;
    }

    setLoaded(false);
    setLoadError("");
    try {
      const [
        inventoryResult,
        mappingResult,
        workflowResult,
        settingsResult,
        servicesResult,
        addonsResult,
        reservationTypesResult,
        syncResult,
      ] = await Promise.all([
        supabase
          .from("v_gingr_icon_inventory_current")
          .select("*")
          .eq("location_id", locationId)
          .order("icon_group")
          .order("current_title"),
        supabase
          .from("v_gingr_icon_mapping_status")
          .select("*")
          .eq("location_id", locationId)
          .order("capability_key")
          .order("current_title"),
        supabase
          .from("v_gingr_workflow_mapping_status")
          .select("*")
          .eq("location_id", locationId)
          .eq("is_active", true)
          .order("workflow_key")
          .order("capability_key"),
        supabase
          .from("gingr_workflow_settings")
          .select("id, workflow_key, label, settings, is_active")
          .eq("location_id", locationId)
          .eq("is_active", true)
          .order("workflow_key"),
        supabase
          .from("gingr_service_catalog")
          .select("id, service_id, service_name, source_key, reservation_type_name, synced_at")
          .eq("location_id", locationId)
          .order("service_name"),
        supabase
          .from("gingr_service_addon_catalog")
          .select("id, addon_id, addon_name, source_key, reservation_type_name, synced_at")
          .eq("location_id", locationId)
          .order("addon_name"),
        supabase
          .from("gingr_reservation_types")
          .select("id, gingr_id, name, type_label, synced_at")
          .eq("location_id", locationId)
          .order("type_label"),
        supabase
          .from("v_gingr_initial_sync_status")
          .select("*")
          .eq("location_id", locationId)
          .limit(1),
      ]);

      const requiredErrors = [
        ["Icon inventory", inventoryResult.error],
        ["Icon mapping status", mappingResult.error],
      ].filter(([, error]) => error);
      if (requiredErrors.length > 0) {
        throw new Error(requiredErrors.map(([label, error]) => `${label}: ${summarizeSupabaseError(error)}`).join("; "));
      }

      const optionalErrors = [
        ["Workflow mappings", workflowResult.error],
        ["Workflow settings", settingsResult.error],
        ["Service catalog", servicesResult.error],
        ["Service add-ons", addonsResult.error],
        ["Reservation types", reservationTypesResult.error],
        ["Initial sync status", syncResult.error],
      ].filter(([, error]) => error);
      if (optionalErrors.length > 0) {
        setLoadError(optionalErrors.map(([label, error]) => `${label}: ${summarizeSupabaseError(error)}`).join("; "));
      }

      setInventory(inventoryResult.data || []);
      setMappingStatusRows(mappingResult.data || []);
      setWorkflowMappingRows(workflowResult.data || []);
      setServiceRows(servicesResult.data || []);
      setAddonRows(addonsResult.data || []);
      setReservationTypeRows(reservationTypesResult.data || []);
      setSyncStatus(syncResult.data?.[0] || null);
      const privatePlaySettings = (settingsResult.data || []).find((row) => row.workflow_key === "private_play")?.settings || {};
      setRequiredSessionsInput(String(privatePlaySettings.required_sessions || 3));
    } catch (error) {
      setLoadError(summarizeSupabaseError(error));
    } finally {
      setLoaded(true);
    }
  }, [locationId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const mappingsByInventory = useMemo(() => {
    const next = new Map();
    for (const row of mappingStatusRows) {
      const key = row.inventory_key || row.icon_template_id || row.icon_identity_key;
      if (!key) continue;
      if (!next.has(key)) next.set(key, []);
      next.get(key).push(row);
    }
    return next;
  }, [mappingStatusRows]);

  const staleMappings = useMemo(
    () => mappingStatusRows.filter((row) => row.mapping_status === "stale"),
    [mappingStatusRows],
  );

  const staleWorkflowMappings = useMemo(
    () => workflowMappingRows.filter((row) => row.mapping_status === "stale"),
    [workflowMappingRows],
  );

  const workflowGroups = useMemo(() => {
    const groups = new Map();
    for (const row of workflowMappingRows) {
      const key = row.workflow_key || "other";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [workflowMappingRows]);

  const workflowCapabilityMap = useMemo(() => {
    const map = new Map();
    for (const row of workflowMappingRows) {
      if (row.is_active === false || row.mapping_status === "stale") continue;
      const key = `${row.workflow_key}:${row.source_type}:${row.source_identity_key}`;
      if (!map.has(key)) map.set(key, new Set());
      map.get(key).add(row.capability_key);
    }
    return map;
  }, [workflowMappingRows]);

  const getWorkflowCapabilities = useCallback((workflowKey, sourceType, sourceIdentityKey) => {
    return workflowCapabilityMap.get(`${workflowKey}:${sourceType}:${sourceIdentityKey}`) || new Set();
  }, [workflowCapabilityMap]);

  const serviceSourceRows = useMemo(() => [
    ...serviceRows.map((row) => ({
      kind: "service",
      sourceType: "service",
      sourceId: row.service_id || row.id,
      sourceKey: row.source_key || sourceIdentity("service", row.service_id, row.service_name),
      label: sourceLabel(row, "service_name"),
      context: row.reservation_type_name || "Any reservation type",
      syncedAt: row.synced_at,
    })),
    ...addonRows.map((row) => ({
      kind: "service_addon",
      sourceType: "service_addon",
      sourceId: row.addon_id || row.id,
      sourceKey: row.source_key || sourceIdentity("service_addon", row.addon_id, row.addon_name),
      label: sourceLabel(row, "addon_name"),
      context: row.reservation_type_name || "Service add-on",
      syncedAt: row.synced_at,
    })),
  ].sort((a, b) => a.label.localeCompare(b.label)), [addonRows, serviceRows]);

  const filteredInventory = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return inventory;
    return inventory.filter((row) => {
      const haystack = [
        row.icon_group,
        row.current_title,
        row.current_comment,
        row.icon_template_id,
        row.icon_identity_key,
        row.inventory_key,
      ].join(" ").toLowerCase();
      return haystack.includes(needle);
    });
  }, [inventory, search]);

  const toggleCapability = useCallback(async (row, capabilityKey, enabled) => {
    const inventoryKey = getInventoryKey(row);
    const saveKey = `${inventoryKey}:${capabilityKey}`;
    setSavingKey(saveKey);
    setActionMessage(null);

    try {
      const result = enabled
        ? await supabase.from("gingr_icon_mappings").upsert({
            location_id: locationId,
            capability_key: capabilityKey,
            icon_template_id: row.icon_template_id || null,
            icon_identity_key: row.icon_identity_key,
            icon_group: row.icon_group,
            is_active: true,
          }, { onConflict: "location_id,capability_key,icon_identity_key" })
        : await supabase
            .from("gingr_icon_mappings")
            .update({ is_active: false })
            .eq("location_id", locationId)
            .eq("capability_key", capabilityKey)
            .eq("icon_identity_key", row.icon_identity_key);

      if (result.error) throw result.error;
      setActionMessage({ type: "success", text: enabled ? "Mapping enabled." : "Mapping disabled." });
      await loadData();
    } catch (error) {
      setActionMessage({ type: "error", text: summarizeSupabaseError(error) });
    } finally {
      setSavingKey("");
    }
  }, [loadData, locationId]);

  const refreshIcons = useCallback(async () => {
    setRefreshing(true);
    setActionMessage(null);
    try {
      const { data, error } = await supabase.functions.invoke("gingr-sync", {
        body: {
          location_id: locationId,
          sync_type: "full",
          entities: ["animal_icons_all"],
        },
      });
      if (error) throw error;
      const entityErrors = getGingrSyncEntityErrors(data);
      if (entityErrors.length > 0) throw new Error(entityErrors.join("; "));
      setActionMessage({ type: "success", text: "Icon refresh complete." });
      await loadData();
    } catch (error) {
      setActionMessage({ type: "error", text: summarizeSupabaseError(error) });
    } finally {
      setRefreshing(false);
    }
  }, [loadData, locationId]);

  const refreshReferenceData = useCallback(async () => {
    const confirmed = window.confirm(
      "Refresh Reference Data runs a live GINGR sync for this location and updates Supabase reference tables. Continue?",
    );
    if (!confirmed) return;

    setRefreshingReference(true);
    setActionMessage(null);
    try {
      const { data, error } = await supabase.functions.invoke("gingr-sync", {
        body: {
          location_id: locationId,
          sync_type: "full",
          entities: ["reservation_types", "services", "runs_and_occupancy", "animal_icons_all"],
        },
      });
      if (error) throw error;
      const entityErrors = getGingrSyncEntityErrors(data);
      if (entityErrors.length > 0) throw new Error(entityErrors.join("; "));
      setActionMessage({ type: "success", text: "Reference data refresh complete." });
      await loadData();
    } catch (error) {
      setActionMessage({ type: "error", text: summarizeSupabaseError(error) });
    } finally {
      setRefreshingReference(false);
    }
  }, [loadData, locationId]);

  const setWorkflowCapability = useCallback(async ({
    workflowKey,
    sourceType,
    sourceId,
    sourceIdentityKey,
    sourceLabel: label,
    capabilityKey,
    enabled,
    settings = {},
  }) => {
    const saveKey = `${workflowKey}:${sourceType}:${sourceIdentityKey}:${capabilityKey}`;
    setWorkflowSavingKey(saveKey);
    setActionMessage(null);
    try {
      const result = enabled
        ? await supabase.from("gingr_workflow_mappings").upsert({
            location_id: locationId,
            workflow_key: workflowKey,
            source_type: sourceType,
            source_id: sourceId ? String(sourceId) : null,
            source_identity_key: sourceIdentityKey,
            source_label: label,
            capability_key: capabilityKey,
            settings,
            mapping_source: "manual",
            is_active: true,
          }, { onConflict: "location_id,workflow_key,source_type,source_identity_key,capability_key" })
        : await supabase
            .from("gingr_workflow_mappings")
            .update({ is_active: false, mapping_source: "manual" })
            .eq("location_id", locationId)
            .eq("workflow_key", workflowKey)
            .eq("source_type", sourceType)
            .eq("source_identity_key", sourceIdentityKey)
            .eq("capability_key", capabilityKey);

      if (result.error) throw result.error;
      setActionMessage({ type: "success", text: enabled ? "Workflow mapping enabled." : "Workflow mapping disabled." });
      await loadData();
    } catch (error) {
      setActionMessage({ type: "error", text: summarizeSupabaseError(error) });
    } finally {
      setWorkflowSavingKey("");
    }
  }, [loadData, locationId]);

  const setReservationCategory = useCallback(async (row, categoryKey) => {
    const label = sourceLabel(row, "type_label", "name", "gingr_id");
    const sourceKey = sourceIdentity("reservation_type", row.gingr_id, label);
    const saveKey = `category:${sourceKey}`;
    setWorkflowSavingKey(saveKey);
    setActionMessage(null);
    try {
      const deactivate = await supabase
        .rpc("replace_gingr_workflow_mapping", {
          p_location_id: locationId,
          p_workflow_key: "reservation_categories",
          p_source_type: "reservation_type",
          p_source_identity_key: sourceKey,
          p_source_id: row.gingr_id ? String(row.gingr_id) : null,
          p_source_label: label,
          p_capability_key: categoryKey ? `reservation.category.${categoryKey}` : null,
          p_capability_group_prefix: "reservation.category.",
          p_capability_keys: null,
          p_settings: { configured_from: "gingr_icons_page" },
          p_is_required: true,
        });
      if (deactivate.error) throw deactivate.error;

      setActionMessage({ type: "success", text: "Reservation category saved." });
      await loadData();
    } catch (error) {
      setActionMessage({ type: "error", text: summarizeSupabaseError(error) });
    } finally {
      setWorkflowSavingKey("");
    }
  }, [loadData, locationId]);

  const setBathTypeCapability = useCallback(async (sourceRow, capabilityKey) => {
    const sourceKey = sourceRow.sourceKey;
    const saveKey = `bath-type:${sourceKey}`;
    setWorkflowSavingKey(saveKey);
    setActionMessage(null);
    try {
      const deactivate = await supabase
        .rpc("replace_gingr_workflow_mapping", {
          p_location_id: locationId,
          p_workflow_key: "bathing",
          p_source_type: sourceRow.sourceType,
          p_source_identity_key: sourceKey,
          p_source_id: sourceRow.sourceId ? String(sourceRow.sourceId) : null,
          p_source_label: sourceRow.label,
          p_capability_key: capabilityKey || null,
          p_capability_group_prefix: null,
          p_capability_keys: [...BATH_TYPE_KEYS],
          p_settings: { configured_from: "gingr_icons_page" },
          p_is_required: false,
        });
      if (deactivate.error) throw deactivate.error;

      setActionMessage({ type: "success", text: "Bath type saved." });
      await loadData();
    } catch (error) {
      setActionMessage({ type: "error", text: summarizeSupabaseError(error) });
    } finally {
      setWorkflowSavingKey("");
    }
  }, [loadData, locationId]);

  const saveRequiredSessions = useCallback(async () => {
    const requiredSessions = Number(requiredSessionsInput);
    if (!Number.isFinite(requiredSessions) || requiredSessions < 1) {
      setActionMessage({ type: "error", text: "Private play sessions must be at least 1." });
      return;
    }
    setWorkflowSavingKey("private_play:required_sessions");
    setActionMessage(null);
    try {
      const { error } = await supabase.from("gingr_workflow_settings").upsert({
        location_id: locationId,
        workflow_key: "private_play",
        label: "Private Play",
        settings: { required_sessions: requiredSessions },
        is_active: true,
      }, { onConflict: "location_id,workflow_key" });
      if (error) throw error;
      setActionMessage({ type: "success", text: "Private play session count saved." });
      await loadData();
    } catch (error) {
      setActionMessage({ type: "error", text: summarizeSupabaseError(error) });
    } finally {
      setWorkflowSavingKey("");
    }
  }, [loadData, locationId, requiredSessionsInput]);

  if (!locationId || locationId === "enterprise") {
    return (
      <Card style={{ padding: 28, color: C.textSec, fontSize: 14, lineHeight: "22px" }}>
        Select a resort location before configuring GINGR workflow mappings.
      </Card>
    );
  }

  if (!loaded) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <K9LoadingAnimation size={48} message="Loading Gingr icons..." />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: C.text }}>Gingr Icons</h3>
          <p style={{ margin: 0, fontSize: 13, color: C.textSec, lineHeight: 1.5, maxWidth: 700 }}>
            Review the server-synced animal icon inventory and map icons to the canonical capabilities that drive bathing, private play, playgroup classification, and other icon-dependent workflows.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button
            onClick={refreshReferenceData}
            disabled={refreshingReference}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              border: `1px solid ${C.pri}`,
              background: `${C.pri}14`,
              color: C.pri,
              fontSize: 12,
              fontWeight: 700,
              cursor: refreshingReference ? "wait" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {refreshingReference ? "Refreshing..." : "Refresh Reference Data"}
          </button>
          <button
            onClick={refreshIcons}
            disabled={refreshing}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              border: `1px solid ${C.border}`,
              background: C.surface,
              color: C.text,
              fontSize: 12,
              fontWeight: 700,
              cursor: refreshing ? "wait" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {refreshing ? "Refreshing..." : "Refresh Icons"}
          </button>
        </div>
      </div>

      {loadError && (
        <Card style={{ padding: "14px 16px", marginBottom: 16, border: "1px solid #F59E0B66", background: "#FFFBEB" }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#92400E", marginBottom: 4 }}>Configuration Load Warning</div>
          <div style={{ fontSize: 12, color: "#92400E", lineHeight: 1.5 }}>{loadError}</div>
        </Card>
      )}

      {actionMessage && (
        <Card style={{
          padding: "12px 16px",
          marginBottom: 16,
          border: `1px solid ${actionMessage.type === "error" ? "#EF444466" : "#05966944"}`,
          background: actionMessage.type === "error" ? "#FEF2F2" : "#ECFDF5",
        }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: actionMessage.type === "error" ? "#991B1B" : "#047857" }}>
            {actionMessage.text}
          </div>
        </Card>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16, marginBottom: 20 }}>
        <Card style={{ padding: "16px 18px" }}>
          <div style={{ fontSize: 12, color: C.textMut, marginBottom: 6 }}>Discovered Icons</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: C.text }}>{inventory.length}</div>
        </Card>
        <Card style={{ padding: "16px 18px" }}>
          <div style={{ fontSize: 12, color: C.textMut, marginBottom: 6 }}>Active Mappings</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: C.text }}>{mappingStatusRows.filter((row) => row.mapping_status === "active").length}</div>
        </Card>
        <Card style={{ padding: "16px 18px" }}>
          <div style={{ fontSize: 12, color: C.textMut, marginBottom: 6 }}>Stale Mappings</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: staleMappings.length ? "#D97706" : C.text }}>{staleMappings.length}</div>
        </Card>
        <Card style={{ padding: "16px 18px" }}>
          <div style={{ fontSize: 12, color: C.textMut, marginBottom: 6 }}>Services/Add-ons</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: C.text }}>{serviceRows.length + addonRows.length}</div>
        </Card>
        <Card style={{ padding: "16px 18px" }}>
          <div style={{ fontSize: 12, color: C.textMut, marginBottom: 6 }}>Reservation Types</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: C.text }}>{reservationTypeRows.length}</div>
        </Card>
        <Card style={{ padding: "16px 18px" }}>
          <div style={{ fontSize: 12, color: C.textMut, marginBottom: 6 }}>Workflow Mappings</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: staleWorkflowMappings.length ? "#D97706" : C.text }}>{workflowMappingRows.length}</div>
        </Card>
      </div>

      {syncStatus && syncStatus.status !== "complete" && (
        <Card style={{ padding: "16px 18px", marginBottom: 20, border: `1px solid ${C.pri}44` }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>Initial GINGR Sync</div>
              <div style={{ fontSize: 12, color: C.textSec }}>
                {syncStatus.last_message || syncStatus.current_label || syncStatus.current_entity || "Waiting for reference sync status"}
              </div>
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, color: C.pri }}>{Number(syncStatus.percent || 0).toFixed(1)}%</div>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: `${C.pri}14`, overflow: "hidden" }}>
            <div style={{ width: `${Math.min(100, Number(syncStatus.percent || 0))}%`, height: "100%", background: C.pri }} />
          </div>
        </Card>
      )}

      <Card style={{ padding: "18px 20px", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 4 }}>Report Pairing Controls</div>
            <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.5, maxWidth: 760 }}>
              Configure which synced GINGR reservation types, services, and add-ons feed each operational workflow for this location.
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <label style={{ fontSize: 11, fontWeight: 800, color: C.textMut, textTransform: "uppercase" }}>
              PP Sessions
            </label>
            <input
              type="number"
              min="1"
              value={requiredSessionsInput}
              onChange={(event) => setRequiredSessionsInput(event.target.value)}
              style={{
                width: 64,
                padding: "8px 10px",
                borderRadius: 8,
                border: `1px solid ${C.border}`,
                background: C.bg,
                color: C.text,
                fontSize: 13,
                fontWeight: 800,
                fontFamily: "inherit",
              }}
            />
            <button
              onClick={saveRequiredSessions}
              disabled={workflowSavingKey === "private_play:required_sessions"}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: `1px solid ${C.pri}`,
                background: `${C.pri}12`,
                color: C.pri,
                fontSize: 11,
                fontWeight: 800,
                cursor: workflowSavingKey === "private_play:required_sessions" ? "wait" : "pointer",
                fontFamily: "inherit",
              }}
            >
              {workflowSavingKey === "private_play:required_sessions" ? "Saving..." : "Save"}
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gap: 18 }}>
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
            <div style={{ padding: "12px 14px", background: C.bg, borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: C.text }}>Reservation Types</div>
              <div style={{ fontSize: 11, color: C.textMut }}>{reservationTypeRows.length} synced</div>
            </div>
            {reservationTypeRows.length === 0 ? (
              <div style={{ padding: "14px", fontSize: 12, color: C.textMut }}>No reservation types have been synced yet.</div>
            ) : (
              <div style={{ display: "grid" }}>
                {reservationTypeRows.slice(0, 80).map((row) => {
                  const label = sourceLabel(row, "type_label", "name", "gingr_id");
                  const sourceKey = sourceIdentity("reservation_type", row.gingr_id, label);
                  const categoryCaps = getWorkflowCapabilities("reservation_categories", "reservation_type", sourceKey);
                  const privatePlayCaps = getWorkflowCapabilities("private_play", "reservation_type", sourceKey);
                  const currentCategory = [...categoryCaps]
                    .find((capability) => capability.startsWith("reservation.category."))
                    ?.replace("reservation.category.", "") || "";
                  const ppEnabled = privatePlayCaps.has("private_play.include");
                  const categorySaveKey = `category:${sourceKey}`;
                  const ppSaveKey = `private_play:reservation_type:${sourceKey}:private_play.include`;
                  return (
                    <div
                      key={sourceKey}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                        gap: 12,
                        alignItems: "center",
                        padding: "10px 14px",
                        borderBottom: `1px solid ${C.border}`,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
                        <div style={{ fontSize: 11, color: C.textMut }}>{sourceKey}</div>
                      </div>
                      <select
                        value={currentCategory}
                        onChange={(event) => setReservationCategory(row, event.target.value)}
                        disabled={workflowSavingKey === categorySaveKey}
                        style={{
                          minWidth: 0,
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: `1px solid ${C.border}`,
                          background: C.surface,
                          color: C.text,
                          fontSize: 12,
                          fontFamily: "inherit",
                        }}
                      >
                        {RESERVATION_CATEGORY_OPTIONS.map((option) => (
                          <option key={option.key} value={option.key}>{option.label}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => setWorkflowCapability({
                          workflowKey: "private_play",
                          sourceType: "reservation_type",
                          sourceId: row.gingr_id,
                          sourceIdentityKey: sourceKey,
                          sourceLabel: label,
                          capabilityKey: "private_play.include",
                          enabled: !ppEnabled,
                          settings: { required_sessions: Number(requiredSessionsInput) || 3 },
                        })}
                        disabled={workflowSavingKey === ppSaveKey}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: `1px solid ${ppEnabled ? C.pri : C.border}`,
                          background: ppEnabled ? `${C.pri}14` : C.surface,
                          color: ppEnabled ? C.pri : C.textSec,
                          fontSize: 11,
                          fontWeight: 800,
                          cursor: workflowSavingKey === ppSaveKey ? "wait" : "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        {workflowSavingKey === ppSaveKey ? "Saving..." : ppEnabled ? "Private Play On" : "Private Play Off"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
            <div style={{ padding: "12px 14px", background: C.bg, borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: C.text }}>Services And Add-ons</div>
              <div style={{ fontSize: 11, color: C.textMut }}>{serviceSourceRows.length} synced</div>
            </div>
            {serviceSourceRows.length === 0 ? (
              <div style={{ padding: "14px", fontSize: 12, color: C.textMut }}>No services or add-ons have been synced yet.</div>
            ) : (
              <div style={{ display: "grid" }}>
                {serviceSourceRows.slice(0, 120).map((row) => {
                  const privatePlayCaps = getWorkflowCapabilities("private_play", row.sourceType, row.sourceKey);
                  const bathingCaps = getWorkflowCapabilities("bathing", row.sourceType, row.sourceKey);
                  const ppEnabled = privatePlayCaps.has("private_play.include");
                  const bathEnabled = bathingCaps.has("bathing.include");
                  const bathType = [...bathingCaps].find((capability) => BATH_TYPE_KEYS.has(capability)) || "";
                  const ppSaveKey = `private_play:${row.sourceType}:${row.sourceKey}:private_play.include`;
                  const bathSaveKey = `bathing:${row.sourceType}:${row.sourceKey}:bathing.include`;
                  const bathTypeSaveKey = `bath-type:${row.sourceKey}`;
                  return (
                    <div
                      key={`${row.sourceType}:${row.sourceKey}`}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                        gap: 12,
                        alignItems: "center",
                        padding: "10px 14px",
                        borderBottom: `1px solid ${C.border}`,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0 }}>
                          <span style={{ fontSize: 13, fontWeight: 800, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.label}</span>
                          <span style={{ fontSize: 10, fontWeight: 800, color: C.textMut, border: `1px solid ${C.border}`, borderRadius: 999, padding: "2px 6px", flexShrink: 0 }}>
                            {row.kind === "service_addon" ? "Add-on" : "Service"}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: C.textMut }}>{row.context}</div>
                      </div>
                      <button
                        onClick={() => setWorkflowCapability({
                          workflowKey: "private_play",
                          sourceType: row.sourceType,
                          sourceId: row.sourceId,
                          sourceIdentityKey: row.sourceKey,
                          sourceLabel: row.label,
                          capabilityKey: "private_play.include",
                          enabled: !ppEnabled,
                          settings: { required_sessions: Number(requiredSessionsInput) || 3 },
                        })}
                        disabled={workflowSavingKey === ppSaveKey}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: `1px solid ${ppEnabled ? C.pri : C.border}`,
                          background: ppEnabled ? `${C.pri}14` : C.surface,
                          color: ppEnabled ? C.pri : C.textSec,
                          fontSize: 11,
                          fontWeight: 800,
                          cursor: workflowSavingKey === ppSaveKey ? "wait" : "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        {workflowSavingKey === ppSaveKey ? "Saving..." : ppEnabled ? "PP On" : "PP Off"}
                      </button>
                      <button
                        onClick={() => setWorkflowCapability({
                          workflowKey: "bathing",
                          sourceType: row.sourceType,
                          sourceId: row.sourceId,
                          sourceIdentityKey: row.sourceKey,
                          sourceLabel: row.label,
                          capabilityKey: "bathing.include",
                          enabled: !bathEnabled,
                          settings: { configured_from: "gingr_icons_page" },
                        })}
                        disabled={workflowSavingKey === bathSaveKey}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: `1px solid ${bathEnabled ? C.pri : C.border}`,
                          background: bathEnabled ? `${C.pri}14` : C.surface,
                          color: bathEnabled ? C.pri : C.textSec,
                          fontSize: 11,
                          fontWeight: 800,
                          cursor: workflowSavingKey === bathSaveKey ? "wait" : "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        {workflowSavingKey === bathSaveKey ? "Saving..." : bathEnabled ? "Bath On" : "Bath Off"}
                      </button>
                      <select
                        value={bathType}
                        onChange={(event) => setBathTypeCapability(row, event.target.value)}
                        disabled={workflowSavingKey === bathTypeSaveKey}
                        style={{
                          minWidth: 0,
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: `1px solid ${C.border}`,
                          background: C.surface,
                          color: C.text,
                          fontSize: 12,
                          fontFamily: "inherit",
                        }}
                      >
                        {BATH_TYPE_OPTIONS.map((option) => (
                          <option key={option.key} value={option.key}>{option.label}</option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </Card>

      <Card style={{ padding: "16px 18px", marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 12 }}>Active Mapping Summary</div>
        {workflowGroups.length === 0 ? (
          <div style={{ fontSize: 12, color: C.textMut }}>No service or reservation-type workflow mappings have been seeded yet. Refresh reference data, then review required workflow mappings.</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {workflowGroups.map(([workflowKey, rows]) => (
              <div key={workflowKey} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{workflowKey.replaceAll("_", " ")}</div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: rows.some((row) => row.mapping_status === "stale") ? "#D97706" : "#059669" }}>
                    {rows.length} mapping{rows.length === 1 ? "" : "s"}
                  </div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {rows.slice(0, 18).map((row) => (
                    <span
                      key={row.id}
                      title={row.source_identity_key}
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: row.mapping_status === "stale" ? "#92400E" : C.textSec,
                        background: row.mapping_status === "stale" ? "#FEF3C7" : C.bg,
                        border: `1px solid ${row.mapping_status === "stale" ? "#F59E0B55" : C.border}`,
                        borderRadius: 999,
                        padding: "5px 8px",
                      }}
                    >
                      {row.current_label || row.source_label || row.source_identity_key}{" -> "}{row.capability_key}
                    </span>
                  ))}
                  {rows.length > 18 && (
                    <span style={{ fontSize: 11, color: C.textMut, alignSelf: "center" }}>+{rows.length - 18} more</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card style={{ padding: "16px 18px", marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 10 }}>Search Inventory</div>
        <input
          type="text"
          placeholder="Search title, comment, template ID, or stable key..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: "100%",
            padding: "10px 14px",
            borderRadius: 8,
            border: `1.5px solid ${C.border}`,
            background: C.bg,
            color: C.text,
            fontSize: 13,
            fontFamily: "inherit",
            boxSizing: "border-box",
          }}
        />
      </Card>

      {staleMappings.length > 0 && (
        <Card style={{ padding: "16px 18px", marginBottom: 20, border: `1px solid ${C.warn}` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 10 }}>Stale Mappings</div>
          <div style={{ display: "grid", gap: 10 }}>
            {staleMappings.map((row) => (
              <div key={row.id} style={{ padding: "10px 12px", borderRadius: 8, background: `${C.warn}12`, border: `1px solid ${C.warn}33` }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{row.capability_key}</div>
                <div style={{ fontSize: 12, color: C.textSec }}>
                  Last seen title: {row.current_title || "Missing"} | Stable key: {row.icon_identity_key || "-"}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div style={{ display: "grid", gap: 14 }}>
        {filteredInventory.map((row) => {
          const inventoryKey = getInventoryKey(row);
          const mappedRows = mappingsByInventory.get(inventoryKey) || [];
          const groupCapabilities = getCapabilitiesForGroup(row.icon_group);
          const activeCapabilityKeys = new Set(
            mappedRows
              .filter((entry) => entry.mapping_status === "active")
              .map((entry) => entry.capability_key),
          );

          return (
            <Card key={inventoryKey} style={{ padding: "18px 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{row.current_title || "Untitled Icon"}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.pri, background: `${C.pri}14`, borderRadius: 999, padding: "3px 8px" }}>{row.icon_group || "Other"}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: mappedRows.length ? "#059669" : C.textMut }}>
                      {mappedRows.length ? `${mappedRows.length} mapping${mappedRows.length !== 1 ? "s" : ""}` : "Unmapped"}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.6, marginBottom: 10 }}>
                    {row.current_comment || "No comment sample stored for this icon."}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, fontSize: 11, color: C.textMut }}>
                    <div>Template ID: <span style={{ color: C.text }}>{row.icon_template_id || "-"}</span></div>
                    <div>Stable Key: <span style={{ color: C.text }}>{row.icon_identity_key || row.inventory_key || "-"}</span></div>
                    <div>Color / Class: <span style={{ color: C.text }}>{row.icon_color || "-"} / {row.icon_class || "-"}</span></div>
                    <div>Assignments: <span style={{ color: C.text }}>{row.active_assignment_count ?? 0}</span></div>
                    <div>First Seen: <span style={{ color: C.text }}>{formatStamp(row.first_seen_at)}</span></div>
                    <div>Last Seen: <span style={{ color: C.text }}>{formatStamp(row.last_seen_at)}</span></div>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 8 }}>
                {groupCapabilities.length > 0 ? groupCapabilities.map((capability) => {
                  const isActive = activeCapabilityKeys.has(capability.key);
                  const actionKey = `${inventoryKey}:${capability.key}`;
                  return (
                    <button
                      key={capability.key}
                      onClick={() => toggleCapability(row, capability.key, !isActive)}
                      disabled={savingKey === actionKey}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 999,
                        border: `1px solid ${isActive ? C.pri : C.border}`,
                        background: isActive ? `${C.pri}16` : "transparent",
                        color: isActive ? C.pri : C.textSec,
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: savingKey === actionKey ? "wait" : "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      {savingKey === actionKey ? "Saving..." : capability.label}
                    </button>
                  );
                }) : (
                  <span style={{ fontSize: 12, color: C.textMut }}>No configurable capabilities for this icon group in this pass.</span>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

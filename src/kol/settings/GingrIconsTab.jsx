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

function getCapabilitiesForGroup(group) {
  const normalized = String(group || "").trim().toLowerCase();
  if (normalized === "play") return PLAY_CAPABILITIES;
  if (normalized === "bath") return BATHING_CAPABILITIES;
  return [];
}

function formatStamp(value) {
  if (!value) return "—";
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

export default function GingrIconsTab() {
  const { profile } = useAuth();
  const locationId = profile?.location_id || "cherry-hill";
  const [inventory, setInventory] = useState([]);
  const [mappingStatusRows, setMappingStatusRows] = useState([]);
  const [search, setSearch] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [savingKey, setSavingKey] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    setLoaded(false);
    const [{ data: inventoryRows }, { data: mappingRows }] = await Promise.all([
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
    ]);
    setInventory(inventoryRows || []);
    setMappingStatusRows(mappingRows || []);
    setLoaded(true);
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

    if (enabled) {
      await supabase.from("gingr_icon_mappings").upsert({
        location_id: locationId,
        capability_key: capabilityKey,
        icon_template_id: row.icon_template_id || null,
        icon_identity_key: row.icon_identity_key,
        icon_group: row.icon_group,
        is_active: true,
      }, { onConflict: "location_id,capability_key,icon_identity_key" });
    } else {
      await supabase
        .from("gingr_icon_mappings")
        .update({ is_active: false })
        .eq("location_id", locationId)
        .eq("capability_key", capabilityKey)
        .eq("icon_identity_key", row.icon_identity_key);
    }

    await loadData();
    setSavingKey("");
  }, [loadData, locationId]);

  const refreshIcons = useCallback(async () => {
    setRefreshing(true);
    await supabase.functions.invoke("gingr-sync", {
      body: {
        location_id: locationId,
        sync_type: "full",
        entities: ["animal_icons_all"],
      },
    });
    await loadData();
    setRefreshing(false);
  }, [loadData, locationId]);

  if (!loaded) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <K9LoadingAnimation size={48} message="Loading Gingr icons..." />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 20 }}>
        <div>
          <h3 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: C.text }}>Gingr Icons</h3>
          <p style={{ margin: 0, fontSize: 13, color: C.textSec, lineHeight: 1.5, maxWidth: 700 }}>
            Review the server-synced animal icon inventory and map icons to the canonical capabilities that drive bathing, private play, playgroup classification, and other icon-dependent workflows.
          </p>
        </div>
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
            flexShrink: 0,
          }}
        >
          {refreshing ? "Refreshing…" : "Refresh Icons"}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16, marginBottom: 20 }}>
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
      </div>

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
                  Last seen title: {row.current_title || "Missing"} · Stable key: {row.icon_identity_key || "—"}
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
                    <div>Template ID: <span style={{ color: C.text }}>{row.icon_template_id || "—"}</span></div>
                    <div>Stable Key: <span style={{ color: C.text }}>{row.icon_identity_key || row.inventory_key || "—"}</span></div>
                    <div>Color / Class: <span style={{ color: C.text }}>{row.icon_color || "—"} / {row.icon_class || "—"}</span></div>
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
                      {savingKey === actionKey ? "Saving…" : capability.label}
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

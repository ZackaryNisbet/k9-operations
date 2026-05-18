import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabaseClient";
import { C } from "../../shared/theme";
import { Btn } from "../../shared/ui";
import { useAuth } from "../../AuthProvider";
import { SCHEDULE_CONFIG_DEFAULTS } from "../../shared/schedulingEngine";

const STANDARD_CAPACITY_ROWS = [
  { key: "large_daycare_capacity", label: "Large Play", metricKey: "play_yard.large_play_dogs" },
  { key: "small_daycare_capacity", label: "Small Play", metricKey: "play_yard.small_play_dogs" },
  { key: "private_play_capacity", label: "Private Play", metricKey: "play_yard.private_play_dogs" },
  { key: "split_play_capacity", label: "Half & Half / Split Play", metricKey: "play_yard.split_play_dogs" },
  { key: "group_play_capacity", label: "Total Group Play", metricKey: "play_yard.group_play_dogs" },
];

const CAPABILITY_METRIC_KEYS = {
  "play.large_daycare": "play_yard.large_play_dogs",
  "play.small_daycare": "play_yard.small_play_dogs",
  "play.private_play": "play_yard.private_play_dogs",
  "play.evaluation": "daycare.evaluations",
};

function toInputValue(value) {
  return value === null || value === undefined ? "" : String(value);
}

function parseCap(value) {
  if (value === "" || value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function getInventoryKey(row) {
  return row.inventory_key || row.icon_template_id || row.icon_identity_key;
}

export default function SchedulingCapacitySettingsTab({ profile: parentProfile, addGlobalToast }) {
  const { profile: authProfile } = useAuth();
  const profile = parentProfile || authProfile;
  const locationId = profile?.location_id || "cherry-hill";
  const [config, setConfig] = useState(SCHEDULE_CONFIG_DEFAULTS);
  const [standardCaps, setStandardCaps] = useState({});
  const [iconCaps, setIconCaps] = useState({});
  const [inventory, setInventory] = useState([]);
  const [mappingRows, setMappingRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [configRes, inventoryRes, mappingRes] = await Promise.all([
      supabase
        .from("lite_settings")
        .select("setting_value")
        .eq("location_id", locationId)
        .eq("setting_key", "schedule_config")
        .maybeSingle(),
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

    const loadedConfig = { ...SCHEDULE_CONFIG_DEFAULTS, ...(configRes.data?.setting_value || {}) };
    setConfig(loadedConfig);
    setStandardCaps(Object.fromEntries(
      STANDARD_CAPACITY_ROWS.map((row) => [row.key, toInputValue(loadedConfig[row.key])]),
    ));
    setIconCaps(Object.fromEntries(
      Object.entries(loadedConfig.icon_capacity_constraints || {}).map(([key, entry]) => [
        key,
        toInputValue(typeof entry === "object" ? entry.cap ?? entry.capacity : entry),
      ]),
    ));
    setInventory(inventoryRes.data || []);
    setMappingRows(mappingRes.data || []);
    setLoading(false);
  }, [locationId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const iconRows = useMemo(() => {
    const mappedByInventory = new Map();
    for (const row of mappingRows) {
      const key = row.inventory_key || row.icon_template_id || row.icon_identity_key;
      if (!key || row.mapping_status !== "active") continue;
      mappedByInventory.set(key, row);
    }

    return (inventory || [])
      .filter((row) => {
        const group = String(row.icon_group || "").toLowerCase();
        const mapped = mappedByInventory.get(getInventoryKey(row));
        return group.includes("play") || String(mapped?.capability_key || "").startsWith("play.");
      })
      .map((row) => {
        const inventoryKey = getInventoryKey(row);
        const mapped = mappedByInventory.get(inventoryKey);
        const capabilityKey = mapped?.capability_key || "";
        return {
          key: capabilityKey || `inventory:${inventoryKey}`,
          label: row.current_title || row.icon_title || capabilityKey || inventoryKey,
          group: row.icon_group || "Icon",
          capabilityKey,
          metricKey: CAPABILITY_METRIC_KEYS[capabilityKey] || "",
        };
      });
  }, [inventory, mappingRows]);

  const save = async () => {
    setSaving(true);
    try {
      const nextStandardCaps = Object.fromEntries(
        STANDARD_CAPACITY_ROWS.map((row) => [row.key, parseCap(standardCaps[row.key])]),
      );
      const nextIconCaps = {};
      for (const row of iconRows) {
        const cap = parseCap(iconCaps[row.key]);
        if (cap === null) continue;
        nextIconCaps[row.key] = {
          label: row.label,
          cap,
          metric_key: row.metricKey || null,
          capability_key: row.capabilityKey || null,
        };
      }
      const nextConfig = {
        ...config,
        ...nextStandardCaps,
        icon_capacity_constraints: nextIconCaps,
      };

      const { error } = await supabase.from("lite_settings").upsert({
        location_id: locationId,
        setting_key: "schedule_config",
        setting_value: nextConfig,
      }, { onConflict: "location_id,setting_key" });
      if (error) throw error;
      setConfig(nextConfig);
      addGlobalToast?.("Scheduling capacity caps saved.", "success");
    } catch (err) {
      addGlobalToast?.(`Could not save scheduling capacity caps: ${err.message || err}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    width: 110,
    padding: "7px 9px",
    borderRadius: 8,
    border: `1px solid ${C.border}`,
    background: C.surface,
    color: C.text,
    fontSize: 12,
    fontWeight: 800,
    fontFamily: "inherit",
    textAlign: "right",
  };

  if (loading) return <div style={{ padding: 24, color: C.textSec }}>Loading scheduling capacity settings...</div>;

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 800, color: C.text }}>Scheduling Capacity</h3>
        <p style={{ margin: 0, fontSize: 13, color: C.textSec, lineHeight: 1.5, maxWidth: 820 }}>
          Set location-scoped numeric caps for the Scheduling demand matrix. The matrix checks operating-day play demand, not just same-night boarding.
        </p>
      </div>

      <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, background: C.surface, overflow: "hidden", marginBottom: 16 }}>
        <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, background: "#F8FAFC", fontSize: 11, fontWeight: 900, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Core Capacity Caps
        </div>
        {STANDARD_CAPACITY_ROWS.map((row) => (
          <div key={row.key} style={{ display: "grid", gridTemplateColumns: "minmax(180px, 1fr) 160px 130px", gap: 12, alignItems: "center", padding: "10px 14px", borderBottom: `1px solid ${C.borderLight}` }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{row.label}</div>
              <div style={{ fontSize: 11, color: C.textMut, marginTop: 2 }}>{row.metricKey}</div>
            </div>
            <div style={{ fontSize: 11, color: C.textMut }}>Daily cap</div>
            <input
              type="number"
              min="0"
              value={standardCaps[row.key] || ""}
              onChange={(event) => setStandardCaps((current) => ({ ...current, [row.key]: event.target.value }))}
              style={inputStyle}
            />
          </div>
        ))}
      </div>

      <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, background: C.surface, overflow: "hidden", marginBottom: 16 }}>
        <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, background: "#F8FAFC", fontSize: 11, fontWeight: 900, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Gingr Icon-Derived Caps
        </div>
        {iconRows.length === 0 ? (
          <div style={{ padding: "14px", fontSize: 12, color: C.textMut }}>No play-related Gingr icons are currently available for this location.</div>
        ) : iconRows.map((row) => (
          <div key={row.key} style={{ display: "grid", gridTemplateColumns: "minmax(180px, 1fr) 190px 130px", gap: 12, alignItems: "center", padding: "10px 14px", borderBottom: `1px solid ${C.borderLight}` }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{row.label}</div>
              <div style={{ fontSize: 11, color: C.textMut, marginTop: 2 }}>{row.capabilityKey || row.group}</div>
            </div>
            <div style={{ fontSize: 11, color: row.metricKey ? C.textMut : C.warn, lineHeight: 1.35 }}>
              {row.metricKey || "Configurable now; count metric not wired yet"}
            </div>
            <input
              type="number"
              min="0"
              value={iconCaps[row.key] || ""}
              onChange={(event) => setIconCaps((current) => ({ ...current, [row.key]: event.target.value }))}
              style={inputStyle}
            />
          </div>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <Btn variant="secondary" size="sm" onClick={loadData} disabled={saving}>Reset</Btn>
        <Btn variant="primary" size="sm" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save Capacity Caps"}</Btn>
      </div>
    </div>
  );
}

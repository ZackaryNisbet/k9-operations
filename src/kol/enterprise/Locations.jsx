// K9 Operations - Enterprise Location Management

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabaseClient";
import { C } from "../../shared/theme";
import { I } from "../../shared/icons";
import { normalizeLocationRows } from "./enterpriseAggregation";

const INPUT = {
  width: "100%",
  padding: "10px 11px",
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  fontFamily: "inherit",
  fontSize: 13,
  background: C.surface,
  color: C.text,
  boxSizing: "border-box",
};

const BUTTON = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
  borderRadius: 8,
  border: `1px solid ${C.border}`,
  background: C.surface,
  color: C.text,
  padding: "9px 12px",
  fontSize: 12,
  fontWeight: 850,
  cursor: "pointer",
  fontFamily: "inherit",
};

function primaryButton(disabled = false) {
  return {
    ...BUTTON,
    background: C.pri,
    borderColor: C.pri,
    color: "#fff",
    opacity: disabled ? 0.55 : 1,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

async function loadLocationRows(userLocationIds) {
  const rpc = await supabase.rpc("list_locations");
  if (!rpc.error && Array.isArray(rpc.data)) {
    const rows = normalizeLocationRows(rpc.data);
    return Array.isArray(userLocationIds) ? rows.filter((row) => userLocationIds.includes(row.id)) : rows;
  }

  let query = supabase.from("locations").select("id,name,slug").order("name", { ascending: true });
  if (Array.isArray(userLocationIds)) {
    if (!userLocationIds.length) return [];
    query = query.in("id", userLocationIds);
  }
  const { data, error } = await query;
  if (error) throw error;
  return normalizeLocationRows(data || []);
}

export default function EnterpriseLocations({ userLocationIds, addGlobalToast = () => {} }) {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newLocationName, setNewLocationName] = useState("");
  const [newLocationRegion, setNewLocationRegion] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [editName, setEditName] = useState("");
  const [editRegion, setEditRegion] = useState("");
  const [savingId, setSavingId] = useState("");

  const canCreateLocation = userLocationIds === null;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setLocations(await loadLocationRows(userLocationIds));
    } catch (loadError) {
      console.error("Enterprise locations load failed", loadError);
      setError(loadError.message || "Locations could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [userLocationIds]);

  useEffect(() => {
    load();
  }, [load]);

  const beginEdit = useCallback((location) => {
    setEditingId(location.id);
    setEditName(location.name || "");
    setEditRegion(location.region || "");
  }, []);

  const createLocation = useCallback(async () => {
    const name = newLocationName.trim();
    if (!name || !canCreateLocation) return;
    setCreating(true);
    setError("");
    try {
      const { data, error: rpcError } = await supabase.rpc("create_location", {
        p_name: name,
        p_region: newLocationRegion.trim(),
      });
      if (rpcError) throw rpcError;
      if (data?.success === false) throw new Error(data.message || "Location could not be created.");
      addGlobalToast(`Created ${name}`, "success");
      setNewLocationName("");
      setNewLocationRegion("");
      await load();
    } catch (createError) {
      console.error("Location create failed", createError);
      const message = createError.message || "Location could not be created.";
      setError(message);
      addGlobalToast(message, "error");
    } finally {
      setCreating(false);
    }
  }, [addGlobalToast, canCreateLocation, load, newLocationName, newLocationRegion]);

  const saveLocation = useCallback(async (locationId) => {
    const name = editName.trim();
    if (!name || !locationId) return;
    setSavingId(locationId);
    setError("");
    try {
      const { error: updateError } = await supabase
        .from("locations")
        .update({ name, region: editRegion.trim() })
        .eq("id", locationId);
      if (updateError) throw updateError;
      addGlobalToast("Location updated", "success");
      setEditingId("");
      await load();
    } catch (saveError) {
      console.error("Location update failed", saveError);
      const message = saveError.message || "Location could not be updated.";
      setError(message);
      addGlobalToast(message, "error");
    } finally {
      setSavingId("");
    }
  }, [addGlobalToast, editName, editRegion, load]);

  const locationCountLabel = useMemo(() => `${locations.length} resort${locations.length === 1 ? "" : "s"}`, [locations.length]);

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 950, color: C.text }}>Locations</h2>
          <div style={{ marginTop: 5, fontSize: 13, color: C.textMut }}>{locationCountLabel}</div>
        </div>
        <button type="button" onClick={load} style={BUTTON}>
          <I.RefreshCw /> Refresh
        </button>
      </div>

      {error && <div style={{ padding: "11px 13px", borderRadius: 10, background: C.danLt, color: C.dan, fontSize: 12, fontWeight: 850 }}>{error}</div>}

      <section style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
        <h3 style={{ margin: "0 0 14px", color: C.text, fontSize: 17, fontWeight: 900 }}>Create Location</h3>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, 1fr) minmax(180px, 0.65fr) auto", gap: 10, alignItems: "end" }}>
          <label style={{ display: "grid", gap: 6, fontSize: 11, color: C.textMut, fontWeight: 850 }}>
            Resort Name
            <input value={newLocationName} onChange={(event) => setNewLocationName(event.target.value)} disabled={!canCreateLocation} style={INPUT} />
          </label>
          <label style={{ display: "grid", gap: 6, fontSize: 11, color: C.textMut, fontWeight: 850 }}>
            Region
            <input value={newLocationRegion} onChange={(event) => setNewLocationRegion(event.target.value)} disabled={!canCreateLocation} style={INPUT} />
          </label>
          <button type="button" onClick={createLocation} disabled={!canCreateLocation || creating || !newLocationName.trim()} style={primaryButton(!canCreateLocation || creating || !newLocationName.trim())}>
            <I.Plus /> {creating ? "Creating..." : "Create"}
          </button>
        </div>
        {!canCreateLocation && <div style={{ marginTop: 10, fontSize: 12, color: C.textMut }}>Your account is scoped to assigned resorts, so new resort creation is locked here.</div>}
      </section>

      <section style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
        <h3 style={{ margin: "0 0 14px", color: C.text, fontSize: 17, fontWeight: 900 }}>Manage Locations</h3>
        {loading ? (
          <div style={{ padding: 22, color: C.textMut, textAlign: "center" }}>Loading locations...</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 820, borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ padding: "9px 10px", textAlign: "left", color: C.textMut, background: "#F8FAFC", borderBottom: `1px solid ${C.border}` }}>Location</th>
                  <th style={{ padding: "9px 10px", textAlign: "left", color: C.textMut, background: "#F8FAFC", borderBottom: `1px solid ${C.border}` }}>Slug</th>
                  <th style={{ padding: "9px 10px", textAlign: "left", color: C.textMut, background: "#F8FAFC", borderBottom: `1px solid ${C.border}` }}>Region</th>
                  <th style={{ padding: "9px 10px", textAlign: "right", color: C.textMut, background: "#F8FAFC", borderBottom: `1px solid ${C.border}` }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {locations.map((location) => {
                  const editing = editingId === location.id;
                  return (
                    <tr key={location.id}>
                      <td style={{ padding: 10, borderBottom: `1px solid ${C.borderLight}`, fontWeight: 850 }}>
                        {editing ? <input value={editName} onChange={(event) => setEditName(event.target.value)} style={INPUT} /> : location.name}
                      </td>
                      <td style={{ padding: 10, borderBottom: `1px solid ${C.borderLight}`, color: C.textMut }}>{location.slug || "—"}</td>
                      <td style={{ padding: 10, borderBottom: `1px solid ${C.borderLight}` }}>
                        {editing ? <input value={editRegion} onChange={(event) => setEditRegion(event.target.value)} style={INPUT} /> : location.region || "—"}
                      </td>
                      <td style={{ padding: 10, borderBottom: `1px solid ${C.borderLight}`, textAlign: "right" }}>
                        {editing ? (
                          <div style={{ display: "inline-flex", gap: 8 }}>
                            <button type="button" onClick={() => saveLocation(location.id)} disabled={savingId === location.id || !editName.trim()} style={primaryButton(savingId === location.id || !editName.trim())}>{savingId === location.id ? "Saving..." : "Save"}</button>
                            <button type="button" onClick={() => setEditingId("")} style={BUTTON}>Cancel</button>
                          </div>
                        ) : (
                          <button type="button" onClick={() => beginEdit(location)} style={BUTTON}><I.Edit /> Edit</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

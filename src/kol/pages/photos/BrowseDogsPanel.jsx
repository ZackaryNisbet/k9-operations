// K9 Operations — PhotosPage Browse Dogs In House Panel
// Leaf component: slide-up panel to browse/search in-house dogs for a photo's
// date and pair one or more with the photo. Relies on the global k9-photo-*
// keyframes injected by ./photoStyles (loaded via PhotosPage).
// Extracted verbatim from PhotosPage.jsx (props-only; no shared state closure).

import React, { useState, useEffect } from "react";
import { supabase } from "../../../supabaseClient";
import { todayStr, fmtDateShort } from "../../../shared/theme";
import { getDogsOnDate } from "./pairingData";

// ─── Browse Dogs In House Panel ─────────────────────────────────────────────
function BrowseDogsPanel({ photo, locationId, profile, onClose, onUpdate, onPairCheck, pairCheckId }) {
  const [dogs, setDogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set(
    Array.isArray(photo.paired_dog_ids) ? photo.paired_dog_ids : []
  ));
  const [saving, setSaving] = useState(false);
  const [expandedIcon, setExpandedIcon] = useState(null);

  const photoDate = photo.taken_at ? photo.taken_at.split("T")[0] : todayStr();

  // Load dogs on-site for photo date
  useEffect(() => {
    setLoading(true);
    getDogsOnDate(locationId, photoDate)
      .then(setDogs)
      .finally(() => setLoading(false));
  }, [locationId, photoDate]);

  // Search all gingr_animals when term doesn't match in-house dogs
  useEffect(() => {
    if (!searchTerm || searchTerm.length < 2) { setSearchResults([]); return; }
    let cancelled = false;
    const inHouseIds = new Set(dogs.map(d => d.gingr_id));
    setSearching(true);
    supabase
      .from("gingr_animals")
      .select("gingr_id, name, breed_name, weight, gender")
      .eq("location_id", locationId)
      .ilike("name", `%${searchTerm}%`)
      .limit(50)
      .then(({ data }) => {
        if (cancelled) return;
        const filtered = (data || []).filter(a => !inHouseIds.has(a.gingr_id));
        const ids = filtered.map(a => a.gingr_id).filter(Boolean);
        if (ids.length === 0) { setSearchResults([]); setSearching(false); return; }
        supabase
          .from("gingr_animal_icons")
          .select("animal_gingr_id, icon_url, is_primary")
          .eq("location_id", locationId)
          .in("animal_gingr_id", ids)
          .eq("is_primary", true)
          .then(({ data: icons }) => {
            if (cancelled) return;
            const iconMap = {};
            (icons || []).forEach(ic => { iconMap[ic.animal_gingr_id] = ic.icon_url; });
            setSearchResults(filtered.map(a => ({
              ...a, breed: a.breed_name, icon_url: iconMap[a.gingr_id] || null, isCheckedIn: false, notInHouse: true,
            })));
            setSearching(false);
          });
      });
    return () => { cancelled = true; };
  }, [searchTerm, locationId, dogs]);

  const toggleDog = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSavePairing = async () => {
    setSaving(true);
    const ids = [...selectedIds];
    const allDogs = [...dogs, ...searchResults];
    const dogNameMap = {};
    allDogs.forEach(d => { dogNameMap[d.gingr_id] = d.name; });
    const names = ids.map(id => dogNameMap[id] || "Unknown");

    const updateData = {
      paired_dog_ids: ids,
      paired_dog_names: names,
      paired_dog_id: ids.length > 0 ? ids[0] : null,
      paired_dog_name: ids.length > 0 ? names.join(", ") : null,
      paired_at: ids.length > 0 ? new Date().toISOString() : null,
      paired_by: ids.length > 0 ? (profile?.id || null) : null,
    };

    const { error } = await supabase
      .from("photos")
      .update(updateData)
      .eq("id", photo.id);

    if (!error) {
      onUpdate({ ...photo, ...updateData });
      onClose();
    }
    setSaving(false);
  };

  // Filter in-house dogs by search
  const filteredDogs = searchTerm
    ? dogs.filter(d => d.name.toLowerCase().includes(searchTerm.toLowerCase()) || (d.breed || "").toLowerCase().includes(searchTerm.toLowerCase()))
    : dogs;

  const allDisplayDogs = searchTerm ? [...filteredDogs, ...searchResults] : dogs;

  return (
    <div className="k9-browse-panel" style={{
      position: "absolute", inset: 0, zIndex: 10003,
      background: "rgba(15, 15, 15, 0.98)",
      backdropFilter: "blur(20px)",
      display: "flex", flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{
        padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: "1px solid rgba(255,255,255,0.1)",
      }}>
        <div>
          <div style={{ color: "#fff", fontSize: 17, fontWeight: 800, fontFamily: "'Outfit', sans-serif" }}>
            Dogs at K9 on {fmtDateShort(photoDate)}
          </div>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: 2 }}>
            {dogs.length} dogs in house
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 10,
            padding: "8px 16px", color: "#fff", fontSize: 13, fontWeight: 600,
            cursor: "pointer", fontFamily: "'Outfit', sans-serif",
          }}
        >
          Back
        </button>
      </div>

      {/* Search bar */}
      <div style={{ padding: "12px 20px" }}>
        <input
          type="text"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          placeholder="Search by name..."
          autoFocus
          style={{
            width: "100%", padding: "12px 16px", borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.15)",
            background: "rgba(255,255,255,0.08)",
            color: "#fff", fontSize: 15, fontFamily: "'Outfit', sans-serif",
            outline: "none", boxSizing: "border-box",
          }}
        />
      </div>

      {/* Dog list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 20px", WebkitOverflowScrolling: "touch" }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
            Loading dogs...
          </div>
        ) : allDisplayDogs.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
            {searchTerm ? "No dogs found" : "No dogs in house on this date"}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingBottom: 80 }}>
            {allDisplayDogs.map(dog => {
              const isSelected = selectedIds.has(dog.gingr_id);
              return (
                <div key={dog.gingr_id} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 12px", borderRadius: 12,
                  background: isSelected ? "rgba(132, 204, 22, 0.1)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${isSelected ? "rgba(132, 204, 22, 0.3)" : "transparent"}`,
                  transition: "all 0.15s",
                }}>
                  {/* Dog photo - tap to enlarge */}
                  <div
                    onClick={(e) => { e.stopPropagation(); setExpandedIcon(dog.icon_url || null); }}
                    style={{ flexShrink: 0, cursor: dog.icon_url ? "pointer" : "default" }}
                  >
                    {dog.icon_url ? (
                      <img src={dog.icon_url} alt="" style={{ width: 44, height: 44, borderRadius: 11, objectFit: "cover" }} />
                    ) : (
                      <div style={{
                        width: 44, height: 44, borderRadius: 11,
                        background: "rgba(132, 204, 22, 0.15)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 18, fontWeight: 800, color: "#84CC16",
                      }}>
                        {(dog.name || "?")[0]}
                      </div>
                    )}
                  </div>
                  {/* Dog info - tap to select */}
                  <div
                    onClick={() => toggleDog(dog.gingr_id)}
                    style={{ flex: 1, minWidth: 0, cursor: "pointer" }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", fontFamily: "'Outfit', sans-serif" }}>
                      {dog.name}
                      {dog.notInHouse && (
                        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginLeft: 6, fontWeight: 400 }}>
                          (not in house)
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
                      {dog.breed || "Unknown breed"}
                      {dog.isCheckedIn && <span style={{ color: "#84CC16" }}> · Checked in</span>}
                    </div>
                  </div>
                  {/* Checkbox */}
                  <div
                    onClick={() => toggleDog(dog.gingr_id)}
                    style={{
                      width: 24, height: 24, borderRadius: 7, flexShrink: 0, cursor: "pointer",
                      border: `2px solid ${isSelected ? "#84CC16" : "rgba(255,255,255,0.2)"}`,
                      background: isSelected ? "#84CC16" : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "all 0.15s",
                    }}
                  >
                    {isSelected && <span style={{ color: "#14532D", fontSize: 14, fontWeight: 800 }}>✓</span>}
                  </div>
                </div>
              );
            })}
            {searching && (
              <div style={{ padding: 16, textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 12 }}>
                Searching all dogs...
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom bar with pair button */}
      <div style={{
        padding: "12px 20px max(12px, env(safe-area-inset-bottom))",
        borderTop: "1px solid rgba(255,255,255,0.1)",
        background: "rgba(15, 15, 15, 0.98)",
      }}>
        <button
          onClick={handleSavePairing}
          disabled={saving || selectedIds.size === 0}
          style={{
            width: "100%", padding: "14px 20px", borderRadius: 14,
            background: selectedIds.size > 0 ? "#84CC16" : "rgba(255,255,255,0.1)",
            border: "none",
            color: selectedIds.size > 0 ? "#14532D" : "rgba(255,255,255,0.3)",
            fontSize: 16, fontWeight: 800, cursor: selectedIds.size > 0 ? "pointer" : "default",
            fontFamily: "'Outfit', sans-serif",
            transition: "all 0.2s",
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? "Pairing..." : selectedIds.size > 0 ? `Pair Selected (${selectedIds.size})` : "Select Dogs to Pair"}
        </button>
      </div>

      {/* Expanded icon overlay */}
      {expandedIcon && (
        <div
          onClick={() => setExpandedIcon(null)}
          style={{
            position: "absolute", inset: 0, zIndex: 10010,
            background: "rgba(0,0,0,0.9)",
            display: "flex", alignItems: "center", justifyContent: "center",
            animation: "k9PhotoFadeIn 0.2s ease",
          }}
        >
          <img
            src={expandedIcon}
            alt=""
            style={{ maxWidth: "90%", maxHeight: "90%", borderRadius: 16, objectFit: "contain" }}
          />
        </div>
      )}
    </div>
  );
}

export default BrowseDogsPanel;

// K9 Operations — PhotosPage Bulk Pair Modal
// Leaf component: search for a dog and pair it across all selected photos.
// Extracted verbatim from PhotosPage.jsx (props-only; no shared state closure).

import React, { useState, useCallback } from "react";
import { supabase } from "../../../supabaseClient";
import { C } from "../../../shared/theme";
import { Btn, Modal } from "../../../shared/ui";

// ─── Bulk Pair Modal ─────────────────────────────────────────────────────────
function BulkPairModal({ selectedIds, onClose, locationId, profile, onBulkUpdate }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [pairing, setPairing] = useState(false);

  const handleSearch = useCallback(async (term) => {
    setSearchTerm(term);
    if (term.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const { data } = await supabase
      .from("gingr_animals")
      .select("gingr_id, name, breed_name, weight")
      .eq("location_id", locationId)
      .ilike("name", `%${term}%`)
      .limit(10);
    setSearchResults((data || []).map(d => ({ ...d, breed: d.breed_name })));
    setSearching(false);
  }, [locationId]);

  const handleBulkPair = async (dogId, dogName) => {
    setPairing(true);
    const updateData = {
      paired_dog_id: dogId,
      paired_dog_name: dogName,
      paired_dog_ids: [dogId],
      paired_dog_names: [dogName],
      paired_at: new Date().toISOString(),
      paired_by: profile?.id || null,
    };
    const { error } = await supabase
      .from("photos")
      .update(updateData)
      .in("id", selectedIds);
    if (!error) {
      onBulkUpdate(selectedIds, updateData);
    }
    setPairing(false);
    onClose();
  };

  return (
    <Modal title={`Pair ${selectedIds.length} Photo${selectedIds.length > 1 ? "s" : ""}`} onClose={onClose}>
      <p style={{ fontSize: 14, color: C.textSec, margin: "0 0 16px" }}>
        Search for a dog to pair with the selected photo{selectedIds.length > 1 ? "s" : ""}.
      </p>
      <input
        type="text"
        value={searchTerm}
        onChange={e => handleSearch(e.target.value)}
        placeholder="Type dog name..."
        autoFocus
        style={{
          width: "100%", padding: "10px 14px", borderRadius: 10,
          border: `1.5px solid ${C.border}`, fontSize: 14,
          fontFamily: "inherit", color: C.text, background: C.surface,
          outline: "none", boxSizing: "border-box",
        }}
        onFocus={e => { e.target.style.borderColor = C.pri; }}
        onBlur={e => { e.target.style.borderColor = C.border; }}
      />
      {searching && <div style={{ fontSize: 12, color: C.textMut, marginTop: 10, textAlign: "center" }}>Searching...</div>}
      {searchResults.length > 0 && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6, maxHeight: 300, overflowY: "auto" }}>
          {searchResults.map(dog => (
            <div
              key={dog.gingr_id}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "12px 16px", borderRadius: 10,
                background: C.bg, border: `1px solid ${C.borderLight}`,
                cursor: "pointer", transition: "background 0.1s",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = C.priLt; }}
              onMouseLeave={e => { e.currentTarget.style.background = C.bg; }}
            >
              <div style={{ width: 36, height: 36, borderRadius: 10, background: C.priLt, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800, color: C.pri }}>
                {(dog.name || "?")[0]}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{dog.name}</div>
                <div style={{ fontSize: 12, color: C.textSec }}>{dog.breed || "Unknown breed"}{dog.weight ? ` · ${dog.weight} lbs` : ""}</div>
              </div>
              <Btn size="sm" onClick={() => handleBulkPair(dog.gingr_id, dog.name)} disabled={pairing}>
                {pairing ? "Pairing..." : "Pair All"}
              </Btn>
            </div>
          ))}
        </div>
      )}
      {searchTerm.length >= 2 && !searching && searchResults.length === 0 && (
        <div style={{ marginTop: 12, textAlign: "center", fontSize: 13, color: C.textMut, fontStyle: "italic" }}>
          No dogs found matching "{searchTerm}"
        </div>
      )}
    </Modal>
  );
}

export default BulkPairModal;

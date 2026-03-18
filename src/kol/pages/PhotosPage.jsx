// K9 Operations — PhotosPage
// Full photo management: grid display, upload (drag-and-drop + file picker),
// filters (All/Unpaired/By Date), photo detail modal with breed info and pairing,
// bulk actions for multi-select pairing.

import React, { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
import ReactDOM from "react-dom";
import { supabase } from "../../supabaseClient";
import { C, OPERATIONS_CATALOG, OPS_TYPES, LITE_DEF_PRICING, CHART_PTS, DEF_CLIENT_FIELDS, DEF_DOG_FIELDS, DEFAULT_LIFECYCLE_BANNERS, LC_OP_LABELS, LC_FILTER_FIELDS, LITE_ACTION_LABELS, LITE_ACTION_LEVELS, DEF_LITE_EOD_TEMPLATE, DAY_NAMES_SHORT, ROOM_TYPES, K9_LOCATIONS, POS_BASE, PAGE_SLUGS, buildUrl, parseUrl, gid, titleCase, fmtPhone, fmtDate, fmtDateFull, fmtDateShort, fmtTime, fmtInstr, todayStr, addDays, formatTime12hr, countNights, countHours, DEF_OPENING_TEMPLATE, DEF_FE_TEMPLATE, DEF_BE_TEMPLATE, DEF_CLOSING_TEMPLATE, LEAN_PERMISSION_AREAS, LEAN_PERMISSION_MATRIX, LEAN_ROLES, NAV_ITEMS, K9_LOGO_SRC, K9_LOGO_PNG, SLUG_TO_PAGE, ENT_SLUG_TO_PAGE, formatDogNames, fmtPhoneInput, IDB_VERSION, idbGet, idbSet } from "../../shared/theme";
import { I, Icons } from "../../shared/icons";
import { Tip, Badge, Btn, CustomSelect, MiniDatePicker, ComplianceCheckItem, Inp, CalendarPicker, Modal, Card, K9Logo, K9LogoMini, isFieldRequired, validateClientFields } from "../../shared/ui";
import { hasPermission, hasLeanPermission, _resolveRole, LEGACY_ROLE_MAP, ROLE_CODE_MAP } from "../../shared/permissions";
import { classifyReservationType, classifyReservationStatus, extractRoomFromType, getRoomCleaningStats, resSvcIncludes, getPPStats, getOpsCardStatus, getOpsProgress, getOpsCountLabel } from "../../shared/opsHelpers";
import K9LoadingAnimation from "../../shared/K9LoadingAnimation";
import InteractiveLineChart from "../../shared/InteractiveLineChart";
import LocationSelector from "../../shared/LocationSelector";
import { applyStructuredFilters } from "../../hooks/useFilters";

// ─── Constants ───────────────────────────────────────────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const PHOTO_BUCKET = "pet-photos";
const photoPublicUrl = (storagePath) =>
  `${SUPABASE_URL}/storage/v1/object/public/${PHOTO_BUCKET}/${storagePath}`;

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

const COMMON_BREEDS = [
  "Labrador Retriever", "Golden Retriever", "German Shepherd", "Bulldog", "Poodle",
  "Beagle", "Rottweiler", "Dachshund", "Boxer", "Siberian Husky",
  "Great Dane", "Doberman Pinscher", "Australian Shepherd", "Cavalier King Charles Spaniel",
  "Shih Tzu", "Miniature Schnauzer", "Boston Terrier", "Pomeranian", "Havanese",
  "English Springer Spaniel", "Shetland Sheepdog", "Bernese Mountain Dog", "Maltese",
  "French Bulldog", "Cocker Spaniel", "Chihuahua", "Yorkshire Terrier", "Border Collie",
  "Pit Bull", "Mixed Breed",
];

// ─── Fuzzy breed matching ────────────────────────────────────────────────────
function breedMatchScore(detected, dogBreed) {
  if (!detected || !dogBreed) return 0;
  const a = detected.toLowerCase().trim();
  const b = dogBreed.toLowerCase().trim();
  if (a === b) return 50;
  if (a.includes(b) || b.includes(a)) return 40;
  // Check word overlap
  const aWords = a.split(/[\s\-\/]+/);
  const bWords = b.split(/[\s\-\/]+/);
  const overlap = aWords.filter(w => w.length > 2 && bWords.some(bw => bw.includes(w) || w.includes(bw)));
  if (overlap.length > 0) return 30;
  return 0;
}

// ─── Smart Pairing Algorithm ─────────────────────────────────────────────────
async function getSuggestedPairings(photo, locationId) {
  if (!photo?.taken_at || !locationId) return [];

  const takenAt = photo.taken_at.split("T")[0];

  // Query reservations on-site at photo time
  const { data: reservations } = await supabase
    .from("gingr_reservations")
    .select("animal_gingr_id, animal_name, reservation_type, status, start_date, end_date")
    .eq("location_id", locationId)
    .lte("start_date", takenAt)
    .gte("end_date", takenAt)
    .not("status", "eq", "cancelled");

  if (!reservations || reservations.length === 0) return [];

  // Get unique animal IDs
  const animalIds = [...new Set(reservations.map(r => r.animal_gingr_id).filter(Boolean))];
  if (animalIds.length === 0) return [];

  // Fetch animal details
  const { data: animals } = await supabase
    .from("gingr_animals")
    .select("gingr_id, name, breed, weight, gender")
    .eq("location_id", locationId)
    .in("gingr_id", animalIds);

  if (!animals || animals.length === 0) return [];

  // Fetch animal icons for thumbnails
  const { data: icons } = await supabase
    .from("gingr_animal_icons")
    .select("animal_gingr_id, icon_url, is_primary")
    .eq("location_id", locationId)
    .in("animal_gingr_id", animalIds)
    .eq("is_primary", true);

  const iconMap = {};
  (icons || []).forEach(ic => { iconMap[ic.animal_gingr_id] = ic.icon_url; });

  // Count breeds on-site for uniqueness scoring
  const breedCounts = {};
  animals.forEach(a => {
    const b = (a.breed || "").toLowerCase();
    breedCounts[b] = (breedCounts[b] || 0) + 1;
  });

  // Score each candidate
  const candidates = animals.map(animal => {
    let score = 0;

    // Breed match
    const bMatch = breedMatchScore(photo.detected_breed, animal.breed);
    score += bMatch;

    // Check if actively checked in (vs just having reservation)
    const animalRes = reservations.filter(r => r.animal_gingr_id === animal.gingr_id);
    const isCheckedIn = animalRes.some(r => r.status === "checked_in" || r.status === "checked-in");
    if (isCheckedIn) score += 20;

    // Uniqueness: only dog of that breed on-site
    const b = (animal.breed || "").toLowerCase();
    if (b && breedCounts[b] === 1 && bMatch > 0) score += 30;

    return {
      gingr_id: animal.gingr_id,
      name: animal.name,
      breed: animal.breed,
      weight: animal.weight,
      icon_url: iconMap[animal.gingr_id] || null,
      score,
      isCheckedIn,
    };
  });

  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}


// ─── Photo Detail Modal ─────────────────────────────────────────────────────
function PhotoDetailModal({ photo, onClose, locationId, profile, onUpdate }) {
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [pairing, setPairing] = useState(false);
  const [editBreed, setEditBreed] = useState(false);
  const [breedValue, setBreedValue] = useState(photo.detected_breed || "");
  const [savingBreed, setSavingBreed] = useState(false);

  // Load suggestions for unpaired photos
  useEffect(() => {
    if (photo.paired_dog_id) return;
    setLoadingSuggestions(true);
    getSuggestedPairings(photo, locationId)
      .then(setSuggestions)
      .finally(() => setLoadingSuggestions(false));
  }, [photo.id, photo.paired_dog_id, locationId]);

  // Search dogs by name
  const handleSearch = useCallback(async (term) => {
    setSearchTerm(term);
    if (term.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const { data } = await supabase
      .from("gingr_animals")
      .select("gingr_id, name, breed, weight")
      .eq("location_id", locationId)
      .ilike("name", `%${term}%`)
      .limit(10);
    setSearchResults(data || []);
    setSearching(false);
  }, [locationId]);

  // Pair photo with dog
  const handlePair = async (dogId, dogName) => {
    setPairing(true);
    const { error } = await supabase
      .from("photos")
      .update({
        paired_dog_id: dogId,
        paired_dog_name: dogName,
        paired_at: new Date().toISOString(),
        paired_by: profile?.id || null,
      })
      .eq("id", photo.id);
    if (!error) {
      onUpdate({ ...photo, paired_dog_id: dogId, paired_dog_name: dogName, paired_at: new Date().toISOString() });
    }
    setPairing(false);
  };

  // Unpair photo
  const handleUnpair = async () => {
    setPairing(true);
    const { error } = await supabase
      .from("photos")
      .update({ paired_dog_id: null, paired_dog_name: null, paired_at: null, paired_by: null })
      .eq("id", photo.id);
    if (!error) {
      onUpdate({ ...photo, paired_dog_id: null, paired_dog_name: null, paired_at: null, paired_by: null });
    }
    setPairing(false);
  };

  // Save breed
  const handleSaveBreed = async () => {
    setSavingBreed(true);
    const { error } = await supabase
      .from("photos")
      .update({ detected_breed: breedValue || null, breed_confidence: breedValue ? 1.0 : null })
      .eq("id", photo.id);
    if (!error) {
      onUpdate({ ...photo, detected_breed: breedValue || null });
      setEditBreed(false);
    }
    setSavingBreed(false);
  };

  const imgUrl = photo.storage_path ? photoPublicUrl(photo.storage_path) : null;

  return (
    <Modal title="Photo Detail" onClose={onClose} wide>
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        {/* Left: Photo */}
        <div style={{ flex: "1 1 340px", minWidth: 280 }}>
          {imgUrl ? (
            <img
              src={imgUrl}
              alt={photo.original_filename || "Photo"}
              style={{ width: "100%", borderRadius: 12, objectFit: "contain", maxHeight: 500, background: "#F1F5F9" }}
            />
          ) : (
            <div style={{ width: "100%", height: 300, borderRadius: 12, background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", color: C.textMut }}>
              <Icons.Image />
            </div>
          )}
          <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 12, fontSize: 12, color: C.textSec }}>
            {photo.taken_at && <span>Taken: {fmtDateFull(photo.taken_at)}{photo.taken_at.includes("T") ? ` at ${formatTime12hr(photo.taken_at.split("T")[1]?.slice(0, 5))}` : ""}</span>}
            {photo.original_filename && <span>File: {photo.original_filename}</span>}
            {photo.file_size && <span>Size: {(photo.file_size / 1024 / 1024).toFixed(1)} MB</span>}
            {photo.width && photo.height && <span>{photo.width}×{photo.height}</span>}
          </div>
        </div>

        {/* Right: Info & Pairing */}
        <div style={{ flex: "1 1 260px", minWidth: 240 }}>
          {/* Breed info */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
              Breed Detection
            </div>
            {editBreed ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <CustomSelect
                  value={breedValue}
                  onChange={setBreedValue}
                  options={COMMON_BREEDS.map(b => ({ value: b, label: b }))}
                  placeholder="Select breed..."
                  small
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn size="sm" onClick={handleSaveBreed} disabled={savingBreed}>
                    {savingBreed ? "Saving..." : "Save"}
                  </Btn>
                  <Btn size="sm" variant="ghost" onClick={() => { setEditBreed(false); setBreedValue(photo.detected_breed || ""); }}>
                    Cancel
                  </Btn>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {photo.detected_breed ? (
                  <>
                    <Badge color="primary">{photo.detected_breed}</Badge>
                    {photo.breed_confidence != null && (
                      <span style={{ fontSize: 11, color: C.textMut }}>
                        {Math.round(photo.breed_confidence * 100)}% conf.
                      </span>
                    )}
                  </>
                ) : (
                  <span style={{ fontSize: 13, color: C.textMut, fontStyle: "italic" }}>No breed detected</span>
                )}
                <button
                  onClick={() => setEditBreed(true)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: C.pri, fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}
                >
                  {photo.detected_breed ? "Edit" : "Set breed"}
                </button>
              </div>
            )}
          </div>

          {/* Pairing section */}
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
            Dog Pairing
          </div>

          {photo.paired_dog_id ? (
            <div style={{ padding: "14px 16px", borderRadius: 10, background: C.sucLt, border: `1px solid ${C.suc}30`, marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{photo.paired_dog_name || "Paired"}</div>
                  {photo.paired_at && <div style={{ fontSize: 11, color: C.textSec, marginTop: 2 }}>Paired {fmtDateShort(photo.paired_at)}</div>}
                </div>
                <Btn size="sm" variant="ghost" onClick={handleUnpair} disabled={pairing}>
                  Unpair
                </Btn>
              </div>
            </div>
          ) : (
            <>
              {/* Suggestions */}
              {loadingSuggestions ? (
                <div style={{ padding: 16, textAlign: "center", color: C.textMut, fontSize: 12 }}>Finding matches...</div>
              ) : suggestions.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.pri, marginBottom: 4 }}>Suggested Matches</div>
                  {suggestions.map(dog => (
                    <div
                      key={dog.gingr_id}
                      style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "10px 14px", borderRadius: 10,
                        background: C.bg, border: `1px solid ${C.borderLight}`,
                      }}
                    >
                      {dog.icon_url ? (
                        <img src={dog.icon_url} alt="" style={{ width: 32, height: 32, borderRadius: 8, objectFit: "cover" }} />
                      ) : (
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: C.priLt, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: C.pri }}>
                          {(dog.name || "?")[0]}
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {dog.name}
                        </div>
                        <div style={{ fontSize: 11, color: C.textSec }}>
                          {dog.breed}{dog.weight ? ` · ${dog.weight} lbs` : ""}
                          {dog.isCheckedIn && <span style={{ color: C.suc, fontWeight: 600 }}> · Checked in</span>}
                        </div>
                      </div>
                      <Btn size="sm" onClick={() => handlePair(dog.gingr_id, dog.name)} disabled={pairing}>
                        Pair
                      </Btn>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: C.textMut, fontStyle: "italic", marginBottom: 12 }}>
                  No auto-suggestions available
                </div>
              )}

              {/* Manual search */}
              <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 600, color: C.textSec }}>Search by name</div>
              <input
                type="text"
                value={searchTerm}
                onChange={e => handleSearch(e.target.value)}
                placeholder="Type dog name..."
                style={{
                  width: "100%", padding: "8px 12px", borderRadius: 8,
                  border: `1.5px solid ${C.border}`, fontSize: 13,
                  fontFamily: "inherit", color: C.text, background: C.surface,
                  outline: "none", boxSizing: "border-box",
                }}
                onFocus={e => { e.target.style.borderColor = C.pri; }}
                onBlur={e => { e.target.style.borderColor = C.border; }}
              />
              {searching && <div style={{ fontSize: 11, color: C.textMut, marginTop: 6 }}>Searching...</div>}
              {searchResults.length > 0 && (
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4, maxHeight: 180, overflowY: "auto" }}>
                  {searchResults.map(dog => (
                    <div
                      key={dog.gingr_id}
                      style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "8px 12px", borderRadius: 8, cursor: "pointer",
                        background: C.bg, border: `1px solid ${C.borderLight}`,
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = C.priLt; }}
                      onMouseLeave={e => { e.currentTarget.style.background = C.bg; }}
                    >
                      <div style={{ width: 28, height: 28, borderRadius: 7, background: C.priLt, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: C.pri }}>
                        {(dog.name || "?")[0]}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{dog.name}</div>
                        <div style={{ fontSize: 11, color: C.textMut }}>{dog.breed || "Unknown breed"}</div>
                      </div>
                      <Btn size="sm" onClick={() => handlePair(dog.gingr_id, dog.name)} disabled={pairing}>
                        Pair
                      </Btn>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Notes */}
          {photo.notes && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Notes</div>
              <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>{photo.notes}</div>
            </div>
          )}

          {/* Tags */}
          {photo.tags && photo.tags.length > 0 && (
            <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(Array.isArray(photo.tags) ? photo.tags : []).map(tag => (
                <Badge key={tag} color="accent">{tag}</Badge>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}


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
      .select("gingr_id, name, breed, weight")
      .eq("location_id", locationId)
      .ilike("name", `%${term}%`)
      .limit(10);
    setSearchResults(data || []);
    setSearching(false);
  }, [locationId]);

  const handleBulkPair = async (dogId, dogName) => {
    setPairing(true);
    const updateData = {
      paired_dog_id: dogId,
      paired_dog_name: dogName,
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


// ═══════════════════════════════════════════════════════════════════════════════
// MAIN: PhotosPage
// ═══════════════════════════════════════════════════════════════════════════════

function PhotosPage({ data, nav, profile }) {
  const locationId = profile?.location_id;

  // ─── State ──────────────────────────────────────────────────────────────────
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all"); // all | unpaired | date
  const [dateFilter, setDateFilter] = useState("");
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showBulkPair, setShowBulkPair] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // ─── Fetch photos ──────────────────────────────────────────────────────────
  const fetchPhotos = useCallback(async () => {
    if (!locationId) return;
    setLoading(true);
    const { data: rows, error } = await supabase
      .from("photos")
      .select("*")
      .eq("location_id", locationId)
      .order("taken_at", { ascending: false });
    if (!error && rows) setPhotos(rows);
    setLoading(false);
  }, [locationId]);

  useEffect(() => { fetchPhotos(); }, [fetchPhotos]);

  // ─── Filtered photos ───────────────────────────────────────────────────────
  const filteredPhotos = useMemo(() => {
    let list = photos;
    if (filter === "unpaired") {
      list = list.filter(p => !p.paired_dog_id);
    } else if (filter === "date" && dateFilter) {
      list = list.filter(p => p.taken_at && p.taken_at.startsWith(dateFilter));
    }
    return list;
  }, [photos, filter, dateFilter]);

  // ─── Upload handler ────────────────────────────────────────────────────────
  const handleUpload = useCallback(async (files) => {
    if (!locationId || !files || files.length === 0) return;
    setUploading(true);
    setUploadProgress(0);
    const total = files.length;
    let done = 0;

    for (const file of files) {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        done++;
        setUploadProgress(Math.round((done / total) * 100));
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        done++;
        setUploadProgress(Math.round((done / total) * 100));
        continue;
      }

      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const uuid = crypto.randomUUID();
      const dateStr = todayStr();
      const storagePath = `${locationId}/${dateStr}/${uuid}.${ext}`;

      // Get image dimensions
      let width = null;
      let height = null;
      try {
        const dims = await getImageDimensions(file);
        width = dims.width;
        height = dims.height;
      } catch (_) { /* skip */ }

      // Read EXIF date if available (use file lastModified as fallback)
      const takenAt = file.lastModified
        ? new Date(file.lastModified).toISOString()
        : new Date().toISOString();

      // Upload to storage
      const { error: uploadErr } = await supabase.storage
        .from(PHOTO_BUCKET)
        .upload(storagePath, file, { contentType: file.type, upsert: false });

      if (!uploadErr) {
        // Insert row
        await supabase.from("photos").insert({
          location_id: locationId,
          storage_path: storagePath,
          original_filename: file.name,
          taken_at: takenAt,
          uploaded_at: new Date().toISOString(),
          uploaded_by: profile?.id || null,
          file_size: file.size,
          width,
          height,
          sync_source: "desktop",
        });
      }

      done++;
      setUploadProgress(Math.round((done / total) * 100));
    }

    setUploading(false);
    setUploadProgress(0);
    fetchPhotos();
  }, [locationId, profile, fetchPhotos]);

  // ─── Drag and drop handlers ────────────────────────────────────────────────
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(f => ACCEPTED_TYPES.includes(f.type));
    if (files.length > 0) handleUpload(files);
  }, [handleUpload]);

  const handleFileSelect = useCallback((e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) handleUpload(files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [handleUpload]);

  // ─── Selection handlers ────────────────────────────────────────────────────
  const toggleSelect = useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  // ─── Photo update callback ─────────────────────────────────────────────────
  const handlePhotoUpdate = useCallback((updated) => {
    setPhotos(prev => prev.map(p => p.id === updated.id ? updated : p));
    setSelectedPhoto(updated);
  }, []);

  const handleBulkUpdate = useCallback((ids, updateData) => {
    setPhotos(prev => prev.map(p => ids.includes(p.id) ? { ...p, ...updateData } : p));
    setSelectedIds(new Set());
  }, []);

  // ─── Stats ─────────────────────────────────────────────────────────────────
  const totalCount = photos.length;
  const unpairedCount = photos.filter(p => !p.paired_dog_id).length;
  const pairedCount = totalCount - unpairedCount;

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 700, color: C.text, fontFamily: "'Outfit', sans-serif" }}>
            Photos
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: C.textSec }}>
            Upload, tag, and pair photos with dogs
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES.join(",")}
            multiple
            onChange={handleFileSelect}
            style={{ display: "none" }}
          />
          <Btn onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            <I.Camera /> Upload Photos
          </Btn>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <Card style={{ padding: "14px 20px", flex: "1 1 120px", minWidth: 120 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em" }}>Total</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.text, marginTop: 2 }}>{totalCount}</div>
        </Card>
        <Card style={{ padding: "14px 20px", flex: "1 1 120px", minWidth: 120 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.suc, textTransform: "uppercase", letterSpacing: "0.05em" }}>Paired</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.suc, marginTop: 2 }}>{pairedCount}</div>
        </Card>
        <Card style={{ padding: "14px 20px", flex: "1 1 120px", minWidth: 120 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.warn, textTransform: "uppercase", letterSpacing: "0.05em" }}>Unpaired</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.warn, marginTop: 2 }}>{unpairedCount}</div>
        </Card>
      </div>

      {/* Upload zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
        style={{
          padding: uploading ? "20px" : "32px 20px",
          borderRadius: 14,
          border: `2px dashed ${dragOver ? C.pri : C.border}`,
          background: dragOver ? C.priLt : C.bg,
          textAlign: "center",
          cursor: uploading ? "default" : "pointer",
          transition: "all 0.2s",
          marginBottom: 20,
        }}
      >
        {uploading ? (
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.pri, marginBottom: 8 }}>Uploading... {uploadProgress}%</div>
            <div style={{ width: "100%", height: 6, borderRadius: 3, background: C.borderLight, overflow: "hidden" }}>
              <div style={{ width: `${uploadProgress}%`, height: "100%", borderRadius: 3, background: C.pri, transition: "width 0.3s" }} />
            </div>
          </div>
        ) : (
          <>
            <div style={{ color: dragOver ? C.pri : C.textMut, marginBottom: 8 }}><Icons.Camera /></div>
            <div style={{ fontSize: 14, fontWeight: 600, color: dragOver ? C.pri : C.text }}>
              {dragOver ? "Drop photos here" : "Drag & drop photos here"}
            </div>
            <div style={{ fontSize: 12, color: C.textMut, marginTop: 4 }}>
              or click to browse · JPG, PNG, WebP · Max 25MB per file
            </div>
          </>
        )}
      </div>

      {/* Filters + Bulk actions */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {[
            { key: "all", label: "All" },
            { key: "unpaired", label: `Unpaired (${unpairedCount})` },
            { key: "date", label: "By Date" },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => { setFilter(f.key); if (f.key !== "date") setDateFilter(""); }}
              style={{
                padding: "6px 14px", borderRadius: 8, border: "none",
                background: filter === f.key ? C.pri : C.surfaceHover,
                color: filter === f.key ? "#fff" : C.textSec,
                fontSize: 13, fontWeight: 600, cursor: "pointer",
                fontFamily: "inherit", transition: "all 0.15s",
              }}
            >
              {f.label}
            </button>
          ))}
          {filter === "date" && (
            <MiniDatePicker
              value={dateFilter}
              onChange={setDateFilter}
              placeholder="Pick date"
            />
          )}
        </div>

        {/* Bulk actions */}
        {selectedIds.size > 0 && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.pri }}>
              {selectedIds.size} selected
            </span>
            <Btn size="sm" onClick={() => setShowBulkPair(true)}>
              Pair Selected
            </Btn>
            <Btn size="sm" variant="ghost" onClick={clearSelection}>
              Clear
            </Btn>
          </div>
        )}
      </div>

      {/* Photo grid */}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <K9LoadingAnimation />
        </div>
      ) : filteredPhotos.length === 0 ? (
        <Card style={{ padding: "48px 20px", textAlign: "center" }}>
          <div style={{ color: C.textMut, marginBottom: 8 }}><Icons.Photos /></div>
          <div style={{ fontSize: 14, color: C.textSec, fontWeight: 500 }}>
            {filter === "unpaired" ? "All photos are paired!" : filter === "date" && dateFilter ? "No photos for this date" : "No photos yet. Upload some!"}
          </div>
        </Card>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 12,
        }}>
          {filteredPhotos.map(photo => {
            const imgUrl = photo.storage_path ? photoPublicUrl(photo.storage_path) : null;
            const isSelected = selectedIds.has(photo.id);
            return (
              <div
                key={photo.id}
                style={{
                  position: "relative",
                  borderRadius: 12,
                  overflow: "hidden",
                  border: `2px solid ${isSelected ? C.pri : C.border}`,
                  background: C.surface,
                  cursor: "pointer",
                  transition: "all 0.15s",
                  boxShadow: isSelected ? `0 0 0 2px ${C.pri}40` : "0 1px 3px rgba(0,0,0,0.04)",
                }}
              >
                {/* Selection checkbox */}
                <div
                  onClick={(e) => { e.stopPropagation(); toggleSelect(photo.id); }}
                  style={{
                    position: "absolute", top: 8, left: 8, zIndex: 2,
                    width: 22, height: 22, borderRadius: 6,
                    border: `2px solid ${isSelected ? C.pri : "rgba(255,255,255,0.8)"}`,
                    background: isSelected ? C.pri : "rgba(255,255,255,0.5)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer", backdropFilter: "blur(4px)",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                  }}
                >
                  {isSelected && <I.Check />}
                </div>

                {/* Photo thumbnail */}
                <div onClick={() => setSelectedPhoto(photo)}>
                  {imgUrl ? (
                    <img
                      src={imgUrl}
                      alt={photo.original_filename || "Photo"}
                      loading="lazy"
                      style={{ width: "100%", height: 200, objectFit: "cover", display: "block" }}
                    />
                  ) : (
                    <div style={{ width: "100%", height: 200, background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", color: C.textMut }}>
                      <Icons.Image />
                    </div>
                  )}

                  {/* Overlay info */}
                  <div style={{ padding: "10px 12px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {photo.paired_dog_name || (photo.original_filename ? photo.original_filename.replace(/\.[^.]+$/, "") : "Untitled")}
                      </div>
                      {photo.paired_dog_id ? (
                        <span style={{
                          display: "inline-flex", padding: "2px 8px", borderRadius: 5,
                          background: C.sucLt, color: C.suc,
                          fontSize: 9, fontWeight: 700, textTransform: "uppercase", flexShrink: 0,
                        }}>Paired</span>
                      ) : (
                        <span style={{
                          display: "inline-flex", padding: "2px 8px", borderRadius: 5,
                          background: C.warnLt, color: C.warn,
                          fontSize: 9, fontWeight: 700, textTransform: "uppercase", flexShrink: 0,
                        }}>Unpaired</span>
                      )}
                    </div>
                    {photo.taken_at && (
                      <div style={{ fontSize: 11, color: C.textMut, marginTop: 3 }}>
                        {fmtDateShort(photo.taken_at)}
                      </div>
                    )}
                    {photo.detected_breed && (
                      <div style={{ fontSize: 11, color: C.pri, fontWeight: 600, marginTop: 2 }}>
                        {photo.detected_breed}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Photo detail modal */}
      {selectedPhoto && (
        <PhotoDetailModal
          photo={selectedPhoto}
          onClose={() => setSelectedPhoto(null)}
          locationId={locationId}
          profile={profile}
          onUpdate={handlePhotoUpdate}
        />
      )}

      {/* Bulk pair modal */}
      {showBulkPair && selectedIds.size > 0 && (
        <BulkPairModal
          selectedIds={[...selectedIds]}
          onClose={() => setShowBulkPair(false)}
          locationId={locationId}
          profile={profile}
          onBulkUpdate={handleBulkUpdate}
        />
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getImageDimensions(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve({ width: img.naturalWidth, height: img.naturalHeight }); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Failed to load image")); };
    img.src = url;
  });
}

export default PhotosPage;

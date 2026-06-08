// K9 Operations — PhotosPage
// Full photo management: grid display, upload (drag-and-drop + file picker),
// filters (All/Unpaired/By Date), full-screen photo viewer with breed info and pairing,
// bulk actions for multi-select pairing, on-open breed detection.
// HEIC→JPEG conversion on upload, thumbnail generation, multi-dog pairing.

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
import { SUPABASE_URL, PHOTO_BUCKET, photoPublicUrl, ACCEPTED_TYPES, MAX_FILE_SIZE } from "./photos/constants";
import { generateThumbnail, generateAiImage, getImageDimensions } from "./photos/imageUtils";
import { getSuggestedPairings, getDogsOnDate } from "./photos/pairingData";
import "./photos/photoStyles";

// ─── Constants ───────────────────────────────────────────────────────────────
const COMMON_BREEDS = [
  "Labrador Retriever", "Golden Retriever", "German Shepherd", "Bulldog", "Poodle",
  "Beagle", "Rottweiler", "Dachshund", "Boxer", "Siberian Husky",
  "Great Dane", "Doberman Pinscher", "Australian Shepherd", "Cavalier King Charles Spaniel",
  "Shih Tzu", "Miniature Schnauzer", "Boston Terrier", "Pomeranian", "Havanese",
  "English Springer Spaniel", "Shetland Sheepdog", "Bernese Mountain Dog", "Maltese",
  "French Bulldog", "Cocker Spaniel", "Chihuahua", "Yorkshire Terrier", "Border Collie",
  "Pit Bull", "Mixed Breed",
];

// ─── HEIC detection ─────────────────────────────────────────────────────────
function isHeicFile(file) {
  if (file.type === "image/heic" || file.type === "image/heif") return true;
  const ext = file.name.split(".").pop()?.toLowerCase();
  return ext === "heic" || ext === "heif";
}

// ─── Convert HEIC to JPEG ───────────────────────────────────────────────────
async function convertHeicToJpeg(file) {
  const heic2any = (await import("heic2any")).default;
  const blob = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 });
  const converted = Array.isArray(blob) ? blob[0] : blob;
  const newName = file.name.replace(/\.(heic|heif)$/i, ".jpg");
  return new File([converted], newName, { type: "image/jpeg", lastModified: file.lastModified });
}

// ─── Get all checked-in dogs for multi-dog pairing ──────────────────────────
async function getCheckedInDogs(locationId) {
  const today = todayStr();
  const { data: reservations } = await supabase
    .from("gingr_reservations")
    .select("animal_gingr_id, animal_name, check_in_date, check_out_date")
    .eq("location_id", locationId)
    .lte("start_date", today)
    .gte("end_date", today)
    .is("cancelled_date", null);

  if (!reservations || reservations.length === 0) return [];

  const animalIds = [...new Set(reservations.map(r => r.animal_gingr_id).filter(Boolean))];
  if (animalIds.length === 0) return [];

  const { data: animals } = await supabase
    .from("gingr_animals")
    .select("gingr_id, name, breed_name, weight, gender")
    .eq("location_id", locationId)
    .in("gingr_id", animalIds);

  if (!animals) return [];

  const { data: icons } = await supabase
    .from("gingr_animal_icons")
    .select("animal_gingr_id, icon_url, is_primary")
    .eq("location_id", locationId)
    .in("animal_gingr_id", animalIds)
    .eq("is_primary", true);

  const iconMap = {};
  (icons || []).forEach(ic => { iconMap[ic.animal_gingr_id] = ic.icon_url; });

  const checkedInSet = new Set();
  reservations.forEach(r => {
    if (r.check_in_date && !r.check_out_date) checkedInSet.add(r.animal_gingr_id);
  });

  return animals.map(a => ({
    ...a,
    breed: a.breed_name,
    icon_url: iconMap[a.gingr_id] || null,
    isCheckedIn: checkedInSet.has(a.gingr_id),
  })).sort((a, b) => a.name.localeCompare(b.name));
}


// ─── Full-Screen Photo Viewer ───────────────────────────────────────────────
function FullScreenViewer({ photos, initialIndex, onClose, locationId, profile, canEditPairings = true, onUpdate, onDetectBreeds }) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [enterRect, setEnterRect] = useState(null);
  const [animState, setAnimState] = useState("entering"); // entering | open | exiting
  const [fullResLoaded, setFullResLoaded] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showBrowse, setShowBrowse] = useState(false);
  const [pairCheckId, setPairCheckId] = useState(null); // show green check animation
  const touchStartRef = useRef(null);
  const swipeRef = useRef(null);
  const viewerRef = useRef(null);
  const detectionRequestedRef = useRef(new Set());

  const photo = photos[currentIndex];
  if (!photo) { onClose(); return null; }

  const thumbUrl = photo.thumbnail_path ? photoPublicUrl(photo.thumbnail_path) : null;
  const fullUrl = photo.storage_path ? photoPublicUrl(photo.storage_path) : null;
  const displayUrl = photo.ai_image_path ? photoPublicUrl(photo.ai_image_path) : fullUrl;
  const hasPairing = photo.paired_dog_id || (Array.isArray(photo.paired_dog_ids) && photo.paired_dog_ids.length > 0);
  const pairedNames = Array.isArray(photo.paired_dog_names) && photo.paired_dog_names.length > 0
    ? photo.paired_dog_names
    : photo.paired_dog_name ? [photo.paired_dog_name] : [];

  // Enter animation
  useEffect(() => {
    const thumbEl = document.querySelector(`[data-photo-id="${photo.id}"]`);
    if (thumbEl) {
      setEnterRect(thumbEl.getBoundingClientRect());
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setAnimState("open"));
    });
  }, []);

  // Load medium display image with crossfade. Keep the original for sharing,
  // but avoid downloading full camera originals during routine browsing.
  useEffect(() => {
    setFullResLoaded(false);
    if (displayUrl) {
      const img = new Image();
      img.onload = () => setFullResLoaded(true);
      img.src = displayUrl;
    }
  }, [displayUrl]);

  // Trigger single-photo analysis only when a user opens an unpaired pending
  // photo. This keeps the pairing workflow intact without bulk-analyzing the
  // entire library in the background.
  useEffect(() => {
    if (!onDetectBreeds || hasPairing || !photo?.id) return;
    if (photo.breed_detection_status !== "pending") return;
    if (detectionRequestedRef.current.has(photo.id)) return;
    detectionRequestedRef.current.add(photo.id);
    onDetectBreeds(photo.id).then((updatedPhoto) => {
      if (updatedPhoto) onUpdate({ ...photo, ...updatedPhoto });
    });
  }, [photo, hasPairing, onDetectBreeds, onUpdate]);

  // Load breed suggestions
  useEffect(() => {
    if (hasPairing) { setSuggestions([]); return; }
    if (photo.breed_detection_status !== "completed") { setSuggestions([]); return; }
    setLoadingSuggestions(true);
    getSuggestedPairings(photo, locationId)
      .then(setSuggestions)
      .finally(() => setLoadingSuggestions(false));
  }, [photo.id, photo.breed_detection_status, hasPairing, locationId]);

  // Close with reverse animation
  const handleClose = useCallback(() => {
    setAnimState("exiting");
    setTimeout(() => onClose(), 280);
  }, [onClose]);

  // Navigate photos
  const goTo = useCallback((idx) => {
    if (idx >= 0 && idx < photos.length) {
      setCurrentIndex(idx);
      setShowBrowse(false);
      setPairCheckId(null);
    }
  }, [photos.length]);

  // Touch handling for swipe
  const handleTouchStart = useCallback((e) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
  }, []);

  const handleTouchEnd = useCallback((e) => {
    if (!touchStartRef.current) return;
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
    const dt = Date.now() - touchStartRef.current.t;
    touchStartRef.current = null;
    if (dt > 500) return;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      if (dx < 0) goTo(currentIndex + 1);
      else goTo(currentIndex - 1);
    }
  }, [currentIndex, goTo]);

  // One-tap pair
  const handleQuickPair = useCallback(async (dogId, dogName) => {
    if (!canEditPairings) return;
    setPairCheckId(dogId);
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
      .eq("id", photo.id);
    if (!error) {
      onUpdate({ ...photo, ...updateData });
    }
    setTimeout(() => setPairCheckId(null), 1200);
  }, [canEditPairings, photo, profile, onUpdate]);

  // Unpair
  const handleUnpair = useCallback(async () => {
    if (!canEditPairings) return;
    const updateData = {
      paired_dog_id: null, paired_dog_name: null,
      paired_dog_ids: [], paired_dog_names: [],
      paired_at: null, paired_by: null,
    };
    const { error } = await supabase
      .from("photos")
      .update(updateData)
      .eq("id", photo.id);
    if (!error) {
      onUpdate({ ...photo, ...updateData });
    }
  }, [canEditPairings, photo, onUpdate]);

  // Determine viewer opacity for animation
  const isVisible = animState === "open";
  const bgOpacity = animState === "entering" ? 0 : animState === "exiting" ? 0 : 1;

  return ReactDOM.createPortal(
    <div
      ref={viewerRef}
      className="k9-fullscreen-viewer"
      style={{
        opacity: animState === "entering" ? 0 : 1,
        transition: "opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
      onClick={(e) => { if (e.target === viewerRef.current) handleClose(); }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Close button */}
      <button
        onClick={handleClose}
        style={{
          position: "absolute", top: 16, left: 16, zIndex: 10002,
          width: 36, height: 36, borderRadius: 18,
          background: "rgba(0,0,0,0.5)", border: "none",
          color: "#fff", fontSize: 20, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          backdropFilter: "blur(8px)",
        }}
      >
        ✕
      </button>

      {/* Photo counter */}
      <div style={{
        position: "absolute", top: 20, right: 16, zIndex: 10002,
        color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: 600,
        fontFamily: "'Outfit', sans-serif",
      }}>
        {currentIndex + 1} of {photos.length}
      </div>

      {/* Navigation arrows (desktop) */}
      {currentIndex > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); goTo(currentIndex - 1); }}
          style={{
            position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", zIndex: 10002,
            width: 40, height: 40, borderRadius: 20,
            background: "rgba(255,255,255,0.15)", border: "none",
            color: "#fff", fontSize: 22, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            backdropFilter: "blur(8px)",
          }}
        >
          ‹
        </button>
      )}
      {currentIndex < photos.length - 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); goTo(currentIndex + 1); }}
          style={{
            position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", zIndex: 10002,
            width: 40, height: 40, borderRadius: 20,
            background: "rgba(255,255,255,0.15)", border: "none",
            color: "#fff", fontSize: 22, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            backdropFilter: "blur(8px)",
          }}
        >
          ›
        </button>
      )}

      {/* Main photo area */}
      <div style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
        overflow: "hidden", padding: "60px 16px 0",
        minHeight: 0,
      }}>
        <div style={{ position: "relative", maxWidth: "100%", maxHeight: "100%" }}>
          {/* Thumbnail (instant display) */}
          {thumbUrl && (
            <img
              src={thumbUrl}
              alt=""
              style={{
                maxWidth: "100%", maxHeight: "calc(100vh - 280px)", objectFit: "contain",
                borderRadius: 4,
                opacity: fullResLoaded ? 0 : 1,
                transition: "opacity 0.4s ease",
                position: fullResLoaded ? "absolute" : "relative",
                inset: 0,
                width: "100%", height: "100%",
              }}
            />
          )}
          {/* Full-res (crossfade in) */}
          {displayUrl && (
            <img
              src={displayUrl}
              alt={photo.original_filename || "Photo"}
              style={{
                maxWidth: "100%", maxHeight: "calc(100vh - 280px)", objectFit: "contain",
                borderRadius: 4,
                opacity: fullResLoaded ? 1 : 0,
                transition: "opacity 0.4s ease",
              }}
            />
          )}
          {!thumbUrl && !fullUrl && (
            <div style={{ width: 200, height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.3)" }}>
              <Icons.Image />
            </div>
          )}
        </div>
      </div>

      {/* Bottom sheet - breed detection + pairing */}
      {!showBrowse && (
        <div className="k9-bottom-sheet" style={{
          background: "rgba(20, 20, 20, 0.95)",
          backdropFilter: "blur(20px)",
          borderRadius: "20px 20px 0 0",
          padding: "16px 20px max(16px, env(safe-area-inset-bottom))",
          maxHeight: "40vh",
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
        }}>
          {/* Already paired */}
          {hasPairing ? (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: 4, background: "#84CC16", flexShrink: 0,
                }} />
                <span style={{ color: "#fff", fontSize: 15, fontWeight: 700, fontFamily: "'Outfit', sans-serif" }}>
                  {pairedNames.join(", ")}
                </span>
                {pairedNames.length > 1 && (
                  <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>
                    ({pairedNames.length} dogs)
                  </span>
                )}
              </div>
              {canEditPairings && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={handleUnpair}
                    style={{
                      background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 10,
                      padding: "8px 16px", color: "rgba(255,255,255,0.6)", fontSize: 13,
                      fontWeight: 600, cursor: "pointer", fontFamily: "'Outfit', sans-serif",
                    }}
                  >
                    Unpair
                  </button>
                  <button
                    onClick={() => setShowBrowse(true)}
                    style={{
                      background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 10,
                      padding: "8px 16px", color: "rgba(255,255,255,0.6)", fontSize: 13,
                      fontWeight: 600, cursor: "pointer", fontFamily: "'Outfit', sans-serif",
                    }}
                  >
                    Change
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Breed detection status */}
              {photo.breed_detection_status === "completed" && photo.detected_breeds?.length > 0 ? (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                    {photo.detected_breeds.map((b, i) => (
                      <span key={i} style={{
                        background: "rgba(132, 204, 22, 0.2)",
                        color: "#84CC16",
                        fontSize: 13, fontWeight: 700, fontFamily: "'Outfit', sans-serif",
                        padding: "5px 14px", borderRadius: 20,
                        border: "1px solid rgba(132, 204, 22, 0.3)",
                        display: "inline-flex", alignItems: "center", gap: 6,
                      }}>
                        <span>🐕</span> {b.breed} · {Math.round(b.confidence * 100)}%
                      </span>
                    ))}
                  </div>

                  {/* Suggested matches */}
                  {!canEditPairings ? null : loadingSuggestions ? (
                    <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, padding: "8px 0" }}>
                      Finding matches...
                    </div>
                  ) : suggestions.length > 0 ? (
                    <div>
                      <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                        Suggested Matches
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {suggestions.map(dog => (
                          <div
                            key={dog.gingr_id}
                            onClick={() => handleQuickPair(dog.gingr_id, dog.name)}
                            style={{
                              display: "flex", alignItems: "center", gap: 10,
                              padding: "10px 12px", borderRadius: 12,
                              background: pairCheckId === dog.gingr_id ? "rgba(132, 204, 22, 0.15)" : "rgba(255,255,255,0.08)",
                              border: `1px solid ${pairCheckId === dog.gingr_id ? "rgba(132, 204, 22, 0.4)" : "rgba(255,255,255,0.08)"}`,
                              cursor: "pointer",
                              transition: "all 0.2s",
                            }}
                          >
                            {dog.icon_url ? (
                              <img src={dog.icon_url} alt="" style={{ width: 40, height: 40, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
                            ) : (
                              <div style={{
                                width: 40, height: 40, borderRadius: 10,
                                background: "rgba(132, 204, 22, 0.15)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: 16, fontWeight: 800, color: "#84CC16", flexShrink: 0,
                              }}>
                                {(dog.name || "?")[0]}
                              </div>
                            )}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", fontFamily: "'Outfit', sans-serif" }}>
                                {dog.name}
                              </div>
                              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                                {dog.breed}{dog.isCheckedIn ? " · Checked in" : ""}
                              </div>
                            </div>
                            {pairCheckId === dog.gingr_id ? (
                              <div style={{
                                width: 32, height: 32, borderRadius: 16,
                                background: "#84CC16",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                animation: "k9PhotoCheckPop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards",
                              }}>
                                <span style={{ color: "#14532D", fontSize: 18, fontWeight: 800 }}>✓</span>
                              </div>
                            ) : (
                              <div style={{
                                width: 32, height: 32, borderRadius: 16,
                                background: "rgba(255,255,255,0.1)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                color: "rgba(255,255,255,0.4)", fontSize: 14,
                              }}>
                                +
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {canEditPairings && (
                    <button
                      onClick={() => setShowBrowse(true)}
                      style={{
                        width: "100%", marginTop: 12,
                        background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)",
                        borderRadius: 12, padding: "12px 16px",
                        color: "#fff", fontSize: 14, fontWeight: 600,
                        cursor: "pointer", fontFamily: "'Outfit', sans-serif",
                        transition: "background 0.2s",
                      }}
                    >
                      Browse All Dogs In House
                    </button>
                  )}
                </div>
              ) : photo.breed_detection_status === "processing" || photo.breed_detection_status === "pending" ? (
                <div>
                  <div style={{
                    height: 32, borderRadius: 16, marginBottom: 12,
                    background: "linear-gradient(90deg, rgba(255,255,255,0.05) 25%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.05) 75%)",
                    backgroundSize: "200% 100%",
                    animation: "k9PhotoShimmer 1.5s infinite",
                  }} />
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, fontFamily: "'Outfit', sans-serif" }}>
                    Analyzing photo...
                  </div>
                  {canEditPairings && (
                    <button
                      onClick={() => setShowBrowse(true)}
                      style={{
                        width: "100%", marginTop: 12,
                        background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)",
                        borderRadius: 12, padding: "12px 16px",
                        color: "#fff", fontSize: 14, fontWeight: 600,
                        cursor: "pointer", fontFamily: "'Outfit', sans-serif",
                      }}
                    >
                      Browse Dogs In House
                    </button>
                  )}
                </div>
              ) : (
                <div>
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, marginBottom: 12, fontFamily: "'Outfit', sans-serif" }}>
                    No breed detected
                  </div>
                  {canEditPairings && (
                    <button
                      onClick={() => setShowBrowse(true)}
                      style={{
                        width: "100%",
                        background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)",
                        borderRadius: 12, padding: "12px 16px",
                        color: "#fff", fontSize: 14, fontWeight: 600,
                        cursor: "pointer", fontFamily: "'Outfit', sans-serif",
                      }}
                    >
                      Browse Dogs In House
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Browse All Dogs panel (slide-up full screen) */}
      {showBrowse && canEditPairings && (
        <BrowseDogsPanel
          photo={photo}
          locationId={locationId}
          profile={profile}
          onClose={() => setShowBrowse(false)}
          onUpdate={onUpdate}
          onPairCheck={setPairCheckId}
          pairCheckId={pairCheckId}
        />
      )}
    </div>,
    document.body
  );
}


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


// ═══════════════════════════════════════════════════════════════════════════════
// MAIN: PhotosPage
// ═══════════════════════════════════════════════════════════════════════════════

function PhotosPage({ data, nav, profile }) {
  const locationId = profile?.location_id;
  const canUploadPhotos = hasLeanPermission(profile, "Photos Upload");
  const canEditPairings = hasLeanPermission(profile, "Photos Edit Pairings");

  // ─── State ──────────────────────────────────────────────────────────────────
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all"); // all | unpaired | date
  const [dateFilter, setDateFilter] = useState("");
  const [viewerIndex, setViewerIndex] = useState(null); // index into filteredPhotos for full-screen viewer
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showBulkPair, setShowBulkPair] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
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
      list = list.filter(p => !p.paired_dog_id && !(Array.isArray(p.paired_dog_ids) && p.paired_dog_ids.length > 0));
    } else if (filter === "date" && dateFilter) {
      list = list.filter(p => p.taken_at && p.taken_at.startsWith(dateFilter));
    }
    return list;
  }, [photos, filter, dateFilter]);

  // ─── Breed detection (fire-and-forget for single photo) ────────────────────
  const detectBreeds = useCallback(async (photoId) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/breed-detect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ photo_id: photoId }),
      });
      if (!res.ok) return null;
      const result = await res.json();
      if (result?.photo) {
        setPhotos(prev => prev.map(p => p.id === photoId ? { ...p, ...result.photo } : p));
        return result.photo;
      }
      return null;
    } catch (e) {
      console.warn('Breed detection failed:', e);
      return null;
    }
  }, []);

  // ─── Upload handler (with HEIC conversion + thumbnail generation) ─────────
  const handleUpload = useCallback(async (files) => {
    if (!canUploadPhotos) return;
    if (!locationId || !files || files.length === 0) return;
    setUploading(true);
    setUploadProgress({ done: 0, total: files.length });

    let done = 0;

    for (let file of files) {
      const isHeic = isHeicFile(file);
      if (!isHeic && !ACCEPTED_TYPES.includes(file.type)) {
        done++;
        setUploadProgress({ done, total: files.length });
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        done++;
        setUploadProgress({ done, total: files.length });
        continue;
      }

      if (isHeic) {
        try {
          file = await convertHeicToJpeg(file);
        } catch (err) {
          console.warn("HEIC conversion failed:", err);
          done++;
          setUploadProgress({ done, total: files.length });
          continue;
        }
      }

      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const uuid = crypto.randomUUID();
      const dateStr = todayStr();
      const storagePath = `${locationId}/${dateStr}/${uuid}.${ext}`;
      const aiImagePath = `${locationId}/${dateStr}/${uuid}-ai.jpg`;

      let width = null;
      let height = null;
      try {
        const dims = await getImageDimensions(file);
        width = dims.width;
        height = dims.height;
      } catch (_) { /* skip */ }

      const takenAt = file.lastModified
        ? new Date(file.lastModified).toISOString()
        : new Date().toISOString();

      const { error: uploadErr } = await supabase.storage
        .from(PHOTO_BUCKET)
        .upload(storagePath, file, { contentType: file.type || "image/jpeg", upsert: false });

      let uploadedAiImagePath = null;
      if (!uploadErr) {
        try {
          const aiBlob = await generateAiImage(file);
          const { error: aiErr } = await supabase.storage
            .from(PHOTO_BUCKET)
            .upload(aiImagePath, aiBlob, { contentType: "image/jpeg", upsert: false });
          if (!aiErr) uploadedAiImagePath = aiImagePath;
        } catch (_) { /* AI/display image generation failed, continue with original */ }
      }

      let thumbnailPath = null;
      if (!uploadErr) {
        try {
          const thumbBlob = await generateThumbnail(file);
          const thumbPath = `${locationId}/${dateStr}/thumb_${uuid}.jpg`;
          const { error: thumbErr } = await supabase.storage
            .from(PHOTO_BUCKET)
            .upload(thumbPath, thumbBlob, { contentType: "image/jpeg", upsert: false });
          if (!thumbErr) thumbnailPath = thumbPath;
        } catch (_) { /* thumbnail generation failed, continue without */ }
      }

      if (!uploadErr) {
        const { data: insertedRows } = await supabase.from("photos").insert({
          location_id: locationId,
          storage_path: storagePath,
          ai_image_path: uploadedAiImagePath,
          thumbnail_path: thumbnailPath,
          original_filename: file.name,
          taken_at: takenAt,
          uploaded_at: new Date().toISOString(),
          uploaded_by: profile?.id || null,
          file_size: file.size,
          width,
          height,
          sync_source: "desktop",
        }).select("id");

      }

      done++;
      setUploadProgress({ done, total: files.length });
    }

    setUploading(false);
    setUploadProgress({ done: 0, total: 0 });
    fetchPhotos();
  }, [canUploadPhotos, locationId, profile, fetchPhotos]);

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
    const droppedFiles = Array.from(e.dataTransfer.files).filter(f =>
      ACCEPTED_TYPES.includes(f.type) || isHeicFile(f)
    );
    if (canUploadPhotos && droppedFiles.length > 0) handleUpload(droppedFiles);
  }, [canUploadPhotos, handleUpload]);

  const handleFileSelect = useCallback((e) => {
    const files = Array.from(e.target.files || []);
    if (canUploadPhotos && files.length > 0) handleUpload(files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [canUploadPhotos, handleUpload]);

  // ─── Selection handlers ────────────────────────────────────────────────────
  const toggleSelect = useCallback((id) => {
    if (!canEditPairings) return;
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, [canEditPairings]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  // ─── Photo update callback ─────────────────────────────────────────────────
  const handlePhotoUpdate = useCallback((updated) => {
    setPhotos(prev => prev.map(p => p.id === updated.id ? updated : p));
  }, []);

  const handleBulkUpdate = useCallback((ids, updateData) => {
    setPhotos(prev => prev.map(p => ids.includes(p.id) ? { ...p, ...updateData } : p));
    setSelectedIds(new Set());
  }, []);

  // ─── Stats ─────────────────────────────────────────────────────────────────
  const totalCount = photos.length;
  const unpairedCount = photos.filter(p => !p.paired_dog_id && !(Array.isArray(p.paired_dog_ids) && p.paired_dog_ids.length > 0)).length;
  const pairedCount = totalCount - unpairedCount;

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: "0 0 4px", fontSize: 24, fontWeight: 800, color: C.text, fontFamily: "'Outfit', sans-serif", letterSpacing: "-0.02em" }}>
            Photos
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: C.textMut, lineHeight: 1.5 }}>
            {totalCount.toLocaleString()} Photos · {pairedCount} paired · {unpairedCount} unpaired
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES.join(",") + ",.heic,.heif"}
            multiple
            onChange={handleFileSelect}
            style={{ display: "none" }}
          />
          {canUploadPhotos && (
            <Btn onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              <I.Camera /> Upload Photos
            </Btn>
          )}
        </div>
      </div>

      {/* Upload zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => canUploadPhotos && !uploading && fileInputRef.current?.click()}
        style={{
          padding: uploading ? "20px" : "36px 20px",
          borderRadius: 16,
          border: `2px dashed ${dragOver ? C.pri : C.border}`,
          background: dragOver ? C.priLt : C.bg,
          textAlign: "center",
          cursor: uploading || !canUploadPhotos ? "default" : "pointer",
          transition: "all 0.25s cubic-bezier(0.4,0,0.2,1)",
          marginBottom: 20,
        }}
      >
        {uploading ? (
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.pri, marginBottom: 8 }}>
              Uploading {uploadProgress.done}/{uploadProgress.total} photos...
            </div>
            <div style={{ width: "100%", height: 6, borderRadius: 3, background: C.borderLight, overflow: "hidden" }}>
              <div style={{
                width: uploadProgress.total > 0 ? `${Math.round((uploadProgress.done / uploadProgress.total) * 100)}%` : "0%",
                height: "100%", borderRadius: 3, background: C.pri, transition: "width 0.3s",
              }} />
            </div>
            <div style={{ fontSize: 11, color: C.textMut, marginTop: 6 }}>
              {uploadProgress.done < uploadProgress.total ? "Converting & uploading..." : "Finishing up..."}
            </div>
          </div>
        ) : (
          <>
            <div style={{ color: dragOver ? C.pri : C.textMut, marginBottom: 8 }}><Icons.Camera /></div>
            <div style={{ fontSize: 14, fontWeight: 600, color: dragOver ? C.pri : C.text }}>
              {canUploadPhotos ? (dragOver ? "Drop photos here" : "Drag & drop photos here") : "Photo uploads are restricted"}
            </div>
            <div style={{ fontSize: 12, color: C.textMut, marginTop: 4 }}>
              {canUploadPhotos ? "or click to browse · JPG, PNG, WebP, HEIC · Max 25MB per file" : "You can view photos, but cannot upload new files."}
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
                padding: "7px 16px", borderRadius: 10, border: "none",
                background: filter === f.key ? C.pri : C.surfaceHover,
                color: filter === f.key ? "#fff" : C.textSec,
                fontSize: 13, fontWeight: 600, cursor: "pointer",
                fontFamily: "inherit", transition: "all 0.18s cubic-bezier(0.4,0,0.2,1)",
                boxShadow: filter === f.key ? "0 1px 3px rgba(20,83,45,0.25)" : "none",
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
        {canEditPairings && selectedIds.size > 0 && (
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
        <Card style={{ padding: "64px 24px", textAlign: "center" }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: C.priLt, display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
            <Icons.Photos />
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 6 }}>
            {filter === "unpaired" ? "All caught up!" : filter === "date" && dateFilter ? "No photos found" : "No photos yet"}
          </div>
          <div style={{ fontSize: 13, color: C.textMut, maxWidth: 300, margin: "0 auto", lineHeight: 1.5 }}>
            {filter === "unpaired" ? "Every photo has been paired with a dog. Great work!" : filter === "date" && dateFilter ? "There are no photos for the selected date." : "Upload photos to get started. Drag and drop or click the upload button above."}
          </div>
        </Card>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 12,
        }}>
          {filteredPhotos.map((photo, idx) => {
            const thumbUrl = photo.thumbnail_path
              ? photoPublicUrl(photo.thumbnail_path)
              : photo.ai_image_path
                ? photoPublicUrl(photo.ai_image_path)
                : photo.storage_path
                  ? photoPublicUrl(photo.storage_path)
                  : null;
            const isSelected = selectedIds.has(photo.id);

            const dogNames = Array.isArray(photo.paired_dog_names) && photo.paired_dog_names.length > 0
              ? photo.paired_dog_names
              : photo.paired_dog_name ? [photo.paired_dog_name] : [];
            const hasPairing = photo.paired_dog_id ||
              (Array.isArray(photo.paired_dog_ids) && photo.paired_dog_ids.length > 0);

            // Status dot: green (paired), blue (detected not paired), none (pending/failed)
            const hasBreed = photo.breed_detection_status === "completed" && photo.detected_breeds?.length > 0;
            let statusDot = null;
            if (hasPairing) {
              statusDot = "#84CC16"; // Electric Lime = paired
            } else if (hasBreed) {
              statusDot = "#3B82F6"; // Blue = detected, not paired
            }

            return (
              <div
                key={photo.id}
                data-photo-id={photo.id}
                style={{
                  position: "relative",
                  borderRadius: 14,
                  overflow: "hidden",
                  border: `2px solid ${isSelected ? C.pri : C.border}`,
                  background: C.surface,
                  cursor: "pointer",
                  transition: "all 0.2s cubic-bezier(0.4,0,0.2,1)",
                  boxShadow: isSelected ? `0 0 0 3px ${C.pri}25` : "0 1px 4px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.03)",
                }}
              >
                {/* Selection checkbox */}
                {canEditPairings && (
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
                )}

                {/* Status indicator dot */}
                {statusDot && (
                  <div style={{
                    position: "absolute", top: 10, right: 10, zIndex: 2,
                    width: 10, height: 10, borderRadius: 5,
                    background: statusDot,
                    border: "2px solid rgba(255,255,255,0.8)",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                  }} />
                )}

                {/* Photo thumbnail */}
                <div onClick={() => setViewerIndex(idx)}>
                  {thumbUrl ? (
                    <img
                      src={thumbUrl}
                      alt={photo.original_filename || "Photo"}
                      loading="lazy"
                      decoding="async"
                      className="k9-photo-grid-img"
                      style={{ width: "100%", height: 200, objectFit: "cover", display: "block" }}
                    />
                  ) : (
                    <div style={{ width: "100%", height: 200, background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", color: C.textMut }}>
                      <Icons.Image />
                    </div>
                  )}

                  {/* Overlay info */}
                  <div style={{ padding: "10px 12px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {dogNames.length > 0
                          ? dogNames.join(", ")
                          : (photo.original_filename ? photo.original_filename.replace(/\.[^.]+$/, "") : "Untitled")}
                      </div>
                      {hasPairing ? (
                        <span style={{
                          display: "inline-flex", padding: "2px 8px", borderRadius: 5,
                          background: C.sucLt, color: C.suc,
                          fontSize: 9, fontWeight: 700, textTransform: "uppercase", flexShrink: 0,
                        }}>
                          {dogNames.length > 1 ? `${dogNames.length} Dogs` : "Paired"}
                        </span>
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

      {/* Full-screen photo viewer */}
      {viewerIndex !== null && filteredPhotos[viewerIndex] && (
        <FullScreenViewer
          photos={filteredPhotos}
          initialIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
          locationId={locationId}
          profile={profile}
          canEditPairings={canEditPairings}
          onUpdate={handlePhotoUpdate}
          onDetectBreeds={detectBreeds}
        />
      )}

      {/* Bulk pair modal */}
      {showBulkPair && canEditPairings && selectedIds.size > 0 && (
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

export default PhotosPage;

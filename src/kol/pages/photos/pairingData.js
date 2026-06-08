// K9 Operations — PhotosPage pairing data helpers
// Supabase-backed lookups that power the photo→dog pairing UI: fuzzy breed
// scoring, smart pairing suggestions for a photo, and the in-house roster for a
// given date. Self-contained module-level helpers (no React/component state).
// Extracted verbatim from PhotosPage.jsx.

import { supabase } from "../../../supabaseClient";

// ─── Fuzzy breed matching ────────────────────────────────────────────────────
function breedMatchScore(detected, dogBreed) {
  if (!detected || !dogBreed) return 0;
  const a = detected.toLowerCase().trim();
  const b = dogBreed.toLowerCase().trim();
  if (a === b) return 50;
  if (a.includes(b) || b.includes(a)) return 40;
  const aWords = a.split(/[\s\-\/]+/);
  const bWords = b.split(/[\s\-\/]+/);
  const overlap = aWords.filter(w => w.length > 2 && bWords.some(bw => bw.includes(w) || w.includes(bw)));
  if (overlap.length > 0) return 30;
  return 0;
}

// ─── Smart Pairing Algorithm ─────────────────────────────────────────────────
export async function getSuggestedPairings(photo, locationId) {
  if (!photo?.taken_at || !locationId) return [];

  const takenAt = photo.taken_at.split("T")[0];

  const { data: reservations } = await supabase
    .from("gingr_reservations")
    .select("animal_gingr_id, animal_name, animal_breed, reservation_type, start_date, end_date, check_in_date, check_out_date")
    .eq("location_id", locationId)
    .lte("start_date", takenAt)
    .gte("end_date", takenAt)
    .is("cancelled_date", null);

  if (!reservations || reservations.length === 0) return [];

  const animalIds = [...new Set(reservations.map(r => r.animal_gingr_id).filter(Boolean))];
  if (animalIds.length === 0) return [];

  const { data: animals } = await supabase
    .from("gingr_animals")
    .select("gingr_id, name, breed_name, weight, gender")
    .eq("location_id", locationId)
    .in("gingr_id", animalIds);

  if (!animals || animals.length === 0) return [];

  const { data: icons } = await supabase
    .from("gingr_animal_icons")
    .select("animal_gingr_id, icon_url, is_primary")
    .eq("location_id", locationId)
    .in("animal_gingr_id", animalIds)
    .eq("is_primary", true);

  const iconMap = {};
  (icons || []).forEach(ic => { iconMap[ic.animal_gingr_id] = ic.icon_url; });

  const breedCounts = {};
  animals.forEach(a => {
    const b = (a.breed_name || "").toLowerCase();
    breedCounts[b] = (breedCounts[b] || 0) + 1;
  });

  const candidates = animals.map(animal => {
    let score = 0;
    const animalBreed = animal.breed_name || "";

    if (photo.detected_breeds?.length > 0) {
      let bestBreedScore = 0;
      photo.detected_breeds.forEach(db => {
        const bScore = breedMatchScore(db.breed, animalBreed) * db.confidence;
        if (bScore > bestBreedScore) bestBreedScore = bScore;
      });
      score += bestBreedScore;
    } else {
      score += breedMatchScore(photo.detected_breed, animalBreed);
    }

    const animalRes = reservations.filter(r => r.animal_gingr_id === animal.gingr_id);
    const isCheckedIn = animalRes.some(r => r.check_in_date && !r.check_out_date);
    if (isCheckedIn) score += 20;

    const b = (animalBreed || "").toLowerCase();
    if (b && breedCounts[b] === 1 && score > 0) score += 30;

    return {
      gingr_id: animal.gingr_id,
      name: animal.name,
      breed: animalBreed,
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

// ─── Get dogs on-site for a given date ──────────────────────────────────────
export async function getDogsOnDate(locationId, dateStr) {
  if (!locationId || !dateStr) return [];

  const { data: reservations } = await supabase
    .from("gingr_reservations")
    .select("animal_gingr_id, animal_name, animal_breed, check_in_date, check_out_date, start_date, end_date")
    .eq("location_id", locationId)
    .lte("start_date", dateStr)
    .gte("end_date", dateStr)
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

  // Get owner info from reservations
  const ownerMap = {};
  reservations.forEach(r => {
    if (r.animal_gingr_id && r.animal_name) {
      ownerMap[r.animal_gingr_id] = r;
    }
  });

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

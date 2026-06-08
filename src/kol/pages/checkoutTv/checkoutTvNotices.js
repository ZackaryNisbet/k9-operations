// K9 Operations — CheckoutTVPage notice helpers
// Extracted verbatim from CheckoutTVPage.jsx. Pure functions — no behavior change.

import { getDisplayPlaygroup, getOperationalPlaygroup } from "../../../shared/playgroupAssignments";
import { SIZE_THEME, DEFAULT_NOTICE_DURATION_MS } from "./checkoutTvConstants";

export function normalizeAnimalId(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.startsWith("g") ? raw.slice(1) : raw;
}

export function getReservationAnimalId(res, dog) {
  return normalizeAnimalId(dog?.gingrId || res?.animalGingrId || res?.animal_gingr_id || res?.dogId);
}

export function getNoticeAnimalIds(entry) {
  const entries = entry?.dogs || [entry];
  return [...new Set(entries.map(d => normalizeAnimalId(d?.animalGingrId || d?.animal_id || d?.id)).filter(Boolean))];
}

export function noticeTouchesAnimalIds(entry, animalIds) {
  const ids = animalIds instanceof Set ? animalIds : new Set(animalIds);
  return getNoticeAnimalIds(entry).some(id => ids.has(id));
}

export function groupReservationNoticeEntries(records, { firedAt, durationMs }) {
  const byOwner = new Map();
  for (const record of records) {
    const ownerLastName = record.client?.fields?.last_name || record.res?._ownerName?.split(" ").pop() || "";
    const key = ownerLastName || record.animalId || record.res?.id;
    if (!byOwner.has(key)) byOwner.set(key, []);
    byOwner.get(key).push({
      id: record.res?.gingrId || record.res?.id || record.animalId,
      animalGingrId: record.animalId,
      animalName: record.dog?.fields?.name || record.res?._animalName || "Unknown",
      ownerLastName,
      breed: record.dog?.fields?.breed || "",
      room: record.res?.room || record.res?.room_assignment || "",
      resType: record.res?.type || "boarding",
    });
  }

  return [...byOwner.values()].map(group => ({
    id: group.map(d => d.id).join("+"),
    dogs: group,
    ownerLastName: group[0]?.ownerLastName || "",
    firedAt,
    durationMs,
  }));
}

export function normalizeNoticeDog(entry, dogEntry, { dogs, animalIcons, dogPhotoMap, playgroupMap, type }) {
  const dog = dogs.find(dd => dd.gingrId === Number(dogEntry.animalGingrId) || dd.id === `g${dogEntry.animalGingrId}`);
  const animalId = String(dog?.gingrId || dogEntry.animalGingrId || "");
  const assignment = playgroupMap?.[animalId];
  const playgroup = getDisplayPlaygroup(assignment) || getOperationalPlaygroup(assignment) || "unclassified";
  const theme = SIZE_THEME[playgroup] || SIZE_THEME.unclassified;
  const iconData = animalIcons[dog?.gingrId] || animalIcons[animalId];
  return {
    noticeId: `${type}-${entry.id}-${animalId || dogEntry.id || dogEntry.animalName || "dog"}`,
    entryId: entry.id,
    animalGingrId: animalId,
    type,
    name: dog?.fields?.name || dogEntry.animalName || "Unknown",
    breed: dog?.fields?.breed || dogEntry.breed || "",
    ownerLastName: entry.ownerLastName || dogEntry.ownerLastName || "",
    image: dogPhotoMap[dog?.gingrId] || dogPhotoMap[animalId] || iconData?.icon_url || dog?._image || "",
    playgroup,
    room: dogEntry.room || dogEntry.area || "",
    theme,
    firedAt: entry.firedAt,
    remaining: entry.remaining,
    durationMs: entry.durationMs || DEFAULT_NOTICE_DURATION_MS,
    fading: entry.fading,
  };
}

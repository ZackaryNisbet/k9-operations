// K9 Operations — Scheduling location-name resolution helpers
// Pure helpers extracted verbatim from SchedulingPage.jsx.

import { K9_LOCATIONS } from "../../../shared/theme";

const KNOWN_LOCATION_DISPLAY_NAMES = new Map([
  ["8ea382b0-63f7-44ac-b6f8-83243c03d946", "Cherry Hill"],
]);

export function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || "").trim());
}

function humanizeLocationKey(value) {
  return String(value || "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function cleanReadableLocationName(value) {
  const text = String(value || "").trim();
  if (!text || isUuid(text)) return "";
  return text;
}

export function resolveSchedulingLocationName({ profile, locationMeta, locationId }) {
  const staticLocation = K9_LOCATIONS.find((location) => location.id === locationId || location.slug === locationId);
  return cleanReadableLocationName(locationMeta?.name)
    || cleanReadableLocationName(locationMeta?.display_name)
    || cleanReadableLocationName(locationMeta?.data?.name)
    || cleanReadableLocationName(locationMeta?.data?.display_name)
    || cleanReadableLocationName(locationMeta?.data?.location_name)
    || cleanReadableLocationName(profile?.location_name)
    || cleanReadableLocationName(profile?.locationName)
    || cleanReadableLocationName(profile?.resort_name)
    || cleanReadableLocationName(profile?.location)
    || cleanReadableLocationName(staticLocation?.name)
    || KNOWN_LOCATION_DISPLAY_NAMES.get(String(locationId || "").trim())
    || (locationId && !isUuid(locationId) ? humanizeLocationKey(locationId) : "K9 Operations Location");
}

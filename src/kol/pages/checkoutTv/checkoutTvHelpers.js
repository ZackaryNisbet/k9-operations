// K9 Operations — CheckoutTVPage misc helpers
// Extracted verbatim from CheckoutTVPage.jsx. Pure functions — no behavior change.

import { todayStr } from "../../../shared/theme";
import { getOperationalPlaygroup } from "../../../shared/playgroupAssignments";
import { DEFAULT_TV_SETTINGS } from "./checkoutTvConstants";

/* ── Playgroup classification via Gingr Icons ────────────────────────── *
 * Icons from gingr_animal_icons_live are the source of truth for which
 * playgroup a dog belongs to. Title-based matching for multi-location
 * resilience. No fallback to weight — unclassified dogs are surfaced
 * so staff can fix the missing icon in Gingr.
 * ──────────────────────────────────────────────────────────────────────── */
export function getDogPlaygroup(dog, res, playgroupMap, allDogTags) {
  const animalId = String(dog?.gingrId || res?.animalGingrId || "");
  const assignment = playgroupMap?.[animalId];
  const operational = getOperationalPlaygroup(assignment);
  if (operational) {
    return operational;
  }
  return null; // unclassified
}

export function sanitizeCheckoutTvSettings(value) {
  const source = value && typeof value === "object" ? value : {};
  const duration = Number(source.noticeDurationSec);
  return {
    notificationStyle: source.notificationStyle === "rows" ? "rows" : "spotlight",
    noticeDurationSec: Number.isFinite(duration) ? Math.min(180, Math.max(20, Math.round(duration))) : DEFAULT_TV_SETTINGS.noticeDurationSec,
    showNoticeDetails: source.showNoticeDetails === false ? false : true,
    photoDensity: ["compact", "balanced", "large"].includes(source.photoDensity) ? source.photoDensity : DEFAULT_TV_SETTINGS.photoDensity,
  };
}

export function isFirstDayDaycareType(typeName) {
  const value = String(typeName || "").toLowerCase();
  if (!value || value.includes("tour")) return false;
  return (
    value.includes("daycare")
    || value.includes("day care")
    || value.includes("dayboarding")
    || value.includes("day boarding")
    || value.includes("evaluation")
    || value.includes("eval")
  );
}

export function isReservationInPlaygroupPrewarmWindow(res, today = todayStr()) {
  if (res?.status === "checked-in") return true;
  const checkIn = String(res?.checkIn || "").slice(0, 10);
  if (!checkIn) return false;
  const dayMs = new Date(`${today}T00:00:00`).getTime();
  const checkInMs = new Date(`${checkIn}T00:00:00`).getTime();
  if (Number.isNaN(dayMs) || Number.isNaN(checkInMs)) return false;
  const windowStartMs = dayMs - (30 * 24 * 60 * 60 * 1000);
  const windowEndMs = dayMs + (14 * 24 * 60 * 60 * 1000);
  return checkInMs >= windowStartMs && checkInMs <= windowEndMs;
}

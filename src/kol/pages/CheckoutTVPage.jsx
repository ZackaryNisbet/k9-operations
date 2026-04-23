// K9 Operations — CheckoutTVPage
// Isolated page component. See AGENTS.md for development contract.
// Fixes: TV-001 (daycare count), TV-003 (large/small dog differentiation),
//        TV-004 (room numbers), TV-005 (TV navigation with filtered views), TV-006 (checkout highlight animation),
//        TV-010 (Gingr BOH poll for daycare dogs), TV-011 (view-dependent hero cards),
//        TV-012 (unified BOH transition detection — replaced TV-002 Supabase poll + TV-007 edge function sync),
//        TV-013 (persistent timestamp-based notices — immune to re-renders and poll cycles)
//
// TV-005 NOTE: In KolApp.jsx, the nav item for this page should be renamed from "Checkout TV" to "TV".
// We cannot edit KolApp.jsx per AGENTS.md rules — only page files. This rename should be done separately.

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "../../supabaseClient";
import { PRESENCE_NOTICE_WINDOW_MS, mapPresenceEventToNoticeGroup, useFacilityPresence } from "../../hooks/useFacilityPresence";
import { getEffectivePresenceCadence, usePresenceSyncConfig } from "../../hooks/presenceSyncConfig";
import { idbGet, idbSet, todayStr } from "../../shared/theme";
import K9LoadingAnimation from "../../shared/K9LoadingAnimation";
import {
  buildPlaygroupAssignmentMap,
  derivePlaygroupAssignmentsFromIcons,
  getDisplayPlaygroup,
  getDisplayTags,
  getOperationalPlaygroup,
} from "../../shared/playgroupAssignments";

/* ── CSS Keyframes (injected once) ────────────────────────────────────── */
const STYLE_ID = "checkout-tv-styles";
if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes dogCardSkeleton {
      0%, 100% { opacity: 0.4; }
      50% { opacity: 1; }
    }
    @keyframes checkoutPulse {
      0%, 100% { box-shadow: 0 0 20px 4px rgba(132,204,22,0.4), 0 0 60px 8px rgba(132,204,22,0.15); }
      50% { box-shadow: 0 0 30px 8px rgba(132,204,22,0.7), 0 0 80px 16px rgba(132,204,22,0.3); }
    }
    @keyframes checkoutSlideIn {
      from { opacity: 0; transform: translateY(-30px) scale(0.92); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes checkoutFadeOut {
      from { opacity: 1; transform: scale(1); }
      to { opacity: 0; transform: scale(0.92) translateY(-10px); }
    }
    @keyframes heroEnter {
      0% { opacity: 0; transform: scale(0.7) translateY(40px); }
      60% { opacity: 1; transform: scale(1.02) translateY(-4px); }
      100% { opacity: 1; transform: scale(1) translateY(0); }
    }
    @keyframes heroFadeOut {
      from { opacity: 1; transform: scale(1); }
      to { opacity: 0; transform: scale(0.85) translateY(-20px); }
    }
    @keyframes heroPulse {
      0%, 100% { box-shadow: 0 0 40px 10px rgba(132,204,22,0.35), 0 0 120px 30px rgba(132,204,22,0.1), inset 0 1px 0 rgba(255,255,255,0.08); }
      50% { box-shadow: 0 0 60px 20px rgba(132,204,22,0.55), 0 0 160px 50px rgba(132,204,22,0.2), inset 0 1px 0 rgba(255,255,255,0.08); }
    }
    @keyframes heroCountdownPulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.06); }
    }
    @keyframes queueSlideIn {
      from { opacity: 0; transform: translateX(20px); }
      to { opacity: 1; transform: translateX(0); }
    }
    @keyframes urgentShake {
      0%, 100% { transform: translateX(0); }
      20% { transform: translateX(-2px); }
      40% { transform: translateX(2px); }
      60% { transform: translateX(-1px); }
      80% { transform: translateX(1px); }
    }
    @keyframes tvNavFadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes tvGridFadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes checkinPulse {
      0%, 100% { box-shadow: 0 0 40px 10px rgba(56,189,248,0.35), 0 0 120px 30px rgba(56,189,248,0.1), inset 0 1px 0 rgba(255,255,255,0.08); }
      50% { box-shadow: 0 0 60px 20px rgba(56,189,248,0.55), 0 0 160px 50px rgba(56,189,248,0.2), inset 0 1px 0 rgba(255,255,255,0.08); }
    }
    @keyframes spotlightEnter {
      0% { opacity: 0; transform: translateY(26px) scale(0.82); }
      62% { opacity: 1; transform: translateY(-5px) scale(1.02); }
      100% { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes spotlightExit {
      from { opacity: 1; transform: translateY(0) scale(1); }
      to { opacity: 0; transform: translateY(-18px) scale(0.86); }
    }
    @keyframes tvModalIn {
      from { opacity: 0; transform: translateY(14px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes tvHealthRefreshPulse {
      0%, 100% { transform: scale(1); box-shadow: 0 0 14px currentColor; }
      50% { transform: scale(1.3); box-shadow: 0 0 26px currentColor; }
    }
    @keyframes tvHealthRefreshSweep {
      0% { transform: translateX(-100%); opacity: 0.15; }
      45% { opacity: 0.75; }
      100% { transform: translateX(100%); opacity: 0.15; }
    }
  `;
  document.head.appendChild(style);
}

/* ── Playgroup classification via Gingr Icons ────────────────────────── *
 * Icons from gingr_animal_icons_live are the source of truth for which
 * playgroup a dog belongs to. Title-based matching for multi-location
 * resilience. No fallback to weight — unclassified dogs are surfaced
 * so staff can fix the missing icon in Gingr.
 * ──────────────────────────────────────────────────────────────────────── */
function getDogPlaygroup(dog, res, playgroupMap, allDogTags) {
  const animalId = String(dog?.gingrId || res?.animalGingrId || "");
  const assignment = playgroupMap?.[animalId];
  const operational = getOperationalPlaygroup(assignment);
  if (operational) {
    return operational;
  }
  return null; // unclassified
}

/* ── Playgroup theme colors ───────────────────────────────────────────── */
const SIZE_THEME = {
  large: {
    accent: "#84CC16",     // Green (brand accent)
    accentRgb: "132,204,22",
    label: "Large Dog Daycare",
    badge: "LG",
    icon: "L",
  },
  small: {
    accent: "#0EA5E9",     // Blue
    accentRgb: "14,165,233",
    label: "Small Dog Daycare",
    badge: "SM",
    icon: "S",
  },
  private_play: {
    accent: "#EF4444",     // Red
    accentRgb: "239,68,68",
    label: "Private Play",
    badge: "PP",
    icon: "P",
  },
  half_and_half: {
    accent: "#A855F7",     // Purple
    accentRgb: "168,85,247",
    label: "Half & Half",
    badge: "H&H",
    icon: "H",
  },
  both_daycares: {
    accent: "#14B8A6",     // Teal
    accentRgb: "20,184,166",
    label: "Both Daycares",
    badge: "BOTH",
    icon: "B",
  },
  evaluation: {
    accent: "#EAB308",     // Yellow
    accentRgb: "234,179,8",
    label: "Evaluation",
    badge: "EVAL",
    icon: "E",
  },
  unclassified: {
    accent: "#6B7280",     // Gray
    accentRgb: "107,114,128",
    label: "Unclassified",
    badge: "?",
    icon: "?",
  },
};

/* ── TV-005: Navigation view definitions ──────────────────────────────── *
 * TV-018: Removed Boarding tab — boarding dogs are reclassified into
 * Large/Small Daycare (by size) or Private Play (if they have PP services).
 * Dogs in BOTH group daycare AND private play appear in both sections,
 * counted as 0.5 in each for accurate capacity tracking.
 * ──────────────────────────────────────────────────────────────────────── */
const NAV_VIEWS = [
  { id: "all",           label: "All",            color: "#fff",     colorRgb: "255,255,255" },
  { id: "small-daycare", label: "Small Daycare",  color: "#0EA5E9",  colorRgb: "14,165,233" },
  { id: "large-daycare", label: "Large Daycare",  color: "#84CC16",  colorRgb: "132,204,22" },
  { id: "private-play",  label: "Private Play",   color: "#EF4444",  colorRgb: "239,68,68" },
  { id: "evaluation",    label: "Evaluation",     color: "#EAB308",  colorRgb: "234,179,8" },
  { id: "both-daycares", label: "Both Daycares",  color: "#14B8A6",  colorRgb: "20,184,166" },
  { id: "unclassified",  label: "Unclassified",   color: "#6B7280",  colorRgb: "107,114,128" },
];

const DEFAULT_NOTICE_DURATION_MS = 60_000;
const FADE_DURATION_MS = 1_200;
const PRESENCE_READ_INTERVAL_MS = 5_000;
const PLAYGROUP_REFRESH_INTERVAL_MS = 60_000;
const FIRST_DAY_REFRESH_INTERVAL_MS = 60_000;
const ASSET_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const CHECKOUT_TV_SETTINGS_KEY = "checkout_tv_settings_v1";
const PLAYGROUP_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

const DEFAULT_TV_SETTINGS = {
  notificationStyle: "spotlight",
  noticeDurationSec: 60,
  showNoticeDetails: true,
  photoDensity: "large",
};

const NOTICE_REPEAT_SUPPRESSION_MS = 45_000;
const OPPOSITE_NOTICE_REPLACE_MS = 45_000;

const CHECKOUT_HEALTH_SPECS = {
  boh: {
    title: "Server Presence Sync",
    frequencyLabel: "Every 5 seconds",
    staleAfterMs: 20_000,
    description: "Reads canonical facility presence events for live check-in and check-out notices.",
  },
  playgroups: {
    title: "Playgroup Assignment",
    frequencyLabel: "Every 60 seconds, restored from local TV cache first",
    staleAfterMs: 130_000,
    description: "Reads v_dog_playgroup_assignments_current, falls back to GINGR icons, and prewarms scheduled dogs.",
  },
  reservations: {
    title: "Reservation Window",
    frequencyLabel: "useGingrData foreground refresh",
    staleAfterMs: 180_000,
    description: "Loads checked-in dogs and mid-stay dogs from Supabase reservations synced from GINGR.",
  },
  firstDay: {
    title: "First-Day Evaluation Heuristic",
    frequencyLabel: "Every 60 seconds",
    staleAfterMs: 130_000,
    description: "Flags first-ever daycare visits only. Boarding-only first reservations do not count.",
  },
  photos: {
    title: "Photos + Profile Icons",
    frequencyLabel: "Every 5 minutes",
    staleAfterMs: 11 * 60_000,
    description: "Loads local profile photos and GINGR profile icons for TV cards and spotlight notices.",
  },
};

function useCheckoutTvViewport() {
  const readViewport = () => ({
    width: typeof window === "undefined" ? 1920 : window.innerWidth,
    height: typeof window === "undefined" ? 1080 : window.innerHeight,
  });
  const [viewport, setViewport] = useState(readViewport);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    let frame = null;
    const onResize = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setViewport(readViewport()));
    };
    window.addEventListener("resize", onResize);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return viewport;
}

function normalizeAnimalId(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.startsWith("g") ? raw.slice(1) : raw;
}

function getReservationAnimalId(res, dog) {
  return normalizeAnimalId(dog?.gingrId || res?.animalGingrId || res?.animal_gingr_id || res?.dogId);
}

function getNoticeAnimalIds(entry) {
  const entries = entry?.dogs || [entry];
  return [...new Set(entries.map(d => normalizeAnimalId(d?.animalGingrId || d?.animal_id || d?.id)).filter(Boolean))];
}

function noticeTouchesAnimalIds(entry, animalIds) {
  const ids = animalIds instanceof Set ? animalIds : new Set(animalIds);
  return getNoticeAnimalIds(entry).some(id => ids.has(id));
}

function groupReservationNoticeEntries(records, { firedAt, durationMs }) {
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

/* ── Room parser (TV-004) ─────────────────────────────────────────────── */
function parseRoom(room) {
  if (!room) return { label: "", number: "" };
  const dashMatch = room.match(/^(.+?)\s*-\s*(\d{1,3}\w*)/);
  if (dashMatch) {
    const typeShort = dashMatch[1].trim().replace(/\s*(Suite|Room|Compartment)/i, "");
    return { label: typeShort, number: dashMatch[2] };
  }
  const fallbackMatch = room.match(/^(.+?)\s+(\d{1,2})$/);
  if (fallbackMatch) {
    return { label: fallbackMatch[1], number: "" };
  }
  return { label: room, number: "" };
}

function formatRoomDisplay(room) {
  const roomInfo = parseRoom(room);
  if (roomInfo.number) return `${roomInfo.label} ${roomInfo.number}`.trim();
  if (roomInfo.label) return roomInfo.label;
  return "";
}

function formatAuditRoomDisplay(room, area) {
  return formatRoomDisplay(room) || area || "";
}

function sanitizeCheckoutTvSettings(value) {
  const source = value && typeof value === "object" ? value : {};
  const duration = Number(source.noticeDurationSec);
  return {
    notificationStyle: source.notificationStyle === "rows" ? "rows" : "spotlight",
    noticeDurationSec: Number.isFinite(duration) ? Math.min(180, Math.max(20, Math.round(duration))) : DEFAULT_TV_SETTINGS.noticeDurationSec,
    showNoticeDetails: source.showNoticeDetails === false ? false : true,
    photoDensity: ["compact", "balanced", "large"].includes(source.photoDensity) ? source.photoDensity : DEFAULT_TV_SETTINGS.photoDensity,
  };
}

function isFirstDayDaycareType(typeName) {
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

function isReservationInPlaygroupPrewarmWindow(res, today = todayStr()) {
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

function formatHealthTime(value) {
  if (!value) return "Not yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

function formatHealthDuration(ms) {
  if (!Number.isFinite(ms)) return null;
  if (ms < 1000) return `${Math.max(0, Math.round(ms))} ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} sec`;
}

function formatHealthAge(value, nowMs = Date.now()) {
  if (!value) return "Not yet";
  const ts = new Date(value).getTime();
  if (Number.isNaN(ts)) return "Unknown";
  const seconds = Math.max(0, Math.round((nowMs - ts) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  return minutes === 1 ? "1 min ago" : `${minutes} min ago`;
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(label)), ms);
    }),
  ]);
}

function healthTone(status) {
  if (status === "healthy") return { label: "Healthy", color: "#22C55E", bg: "rgba(34,197,94,0.13)" };
  if (status === "running") return { label: "Running", color: "#38BDF8", bg: "rgba(56,189,248,0.13)" };
  if (status === "warning") return { label: "Watch", color: "#EAB308", bg: "rgba(234,179,8,0.14)" };
  if (status === "critical") return { label: "Down", color: "#EF4444", bg: "rgba(239,68,68,0.14)" };
  return { label: "Waiting", color: "rgba(255,255,255,0.55)", bg: "rgba(255,255,255,0.08)" };
}

function createInitialCheckoutHealth() {
  return Object.fromEntries(Object.entries(CHECKOUT_HEALTH_SPECS).map(([key, spec]) => [
    key,
    {
      key,
      title: spec.title,
      frequencyLabel: spec.frequencyLabel,
      description: spec.description,
      status: "waiting",
      lastStartedAt: null,
      lastSuccessAt: null,
      lastErrorAt: null,
      nextRunAt: null,
      durationMs: null,
      error: null,
      details: {},
    },
  ]));
}

function deriveSectionStatus(section, spec, nowMs) {
  if (section?.status === "running") return "running";
  if (section?.error) return "critical";
  if (!section?.lastSuccessAt) return "waiting";
  const lastSuccessMs = new Date(section.lastSuccessAt).getTime();
  if (Number.isNaN(lastSuccessMs)) return "waiting";
  if (nowMs - lastSuccessMs > (section.staleAfterMs || spec.staleAfterMs)) return "warning";
  return "healthy";
}

function deriveCheckoutHealthSummary(sections, nowMs) {
  const statuses = Object.entries(CHECKOUT_HEALTH_SPECS).map(([key, spec]) => deriveSectionStatus(sections[key], spec, nowMs));
  if (statuses.includes("critical")) return "critical";
  if (statuses.includes("warning")) return "warning";
  if (statuses.includes("running")) return "running";
  if (statuses.includes("waiting")) return "waiting";
  return "healthy";
}

function getHealthRefreshState(section, intervalMs, nowMs) {
  if (section?.status === "running") {
    return { label: "Refreshing", seconds: 0, progress: 1, isRefreshing: true };
  }

  const nextRunMs = section?.nextRunAt ? new Date(section.nextRunAt).getTime() : Number.NaN;
  if (!Number.isFinite(nextRunMs)) {
    return { label: "Waiting", seconds: null, progress: 0, isRefreshing: false };
  }

  const msRemaining = Math.max(0, nextRunMs - nowMs);
  const seconds = Math.ceil(msRemaining / 1000);
  if (seconds <= 0) {
    return { label: "Refreshing", seconds: 0, progress: 1, isRefreshing: true };
  }

  const progress = 1 - Math.min(msRemaining, intervalMs) / intervalMs;
  return {
    label: `Next sync in ${seconds}`,
    seconds,
    progress: Math.max(0, Math.min(1, progress)),
    isRefreshing: false,
  };
}

function normalizeNoticeDog(entry, dogEntry, { dogs, animalIcons, dogPhotoMap, playgroupMap, type }) {
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

/* ── Large Countdown Timer (SVG circle) — for hero card ──────────────── */
function CountdownCircle({ remaining, total = 60, size = 56, strokeWidth = 4, accentColor }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = remaining / total;
  const offset = circumference * (1 - progress);
  const isUrgent = remaining <= 10;
  const color = accentColor ? (isUrgent ? "#EF4444" : accentColor) : (isUrgent ? "#EF4444" : "#84CC16");

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={strokeWidth} />
        <circle cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1s linear, stroke 0.3s" }} />
      </svg>
      <div style={{
        position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: size * 0.32, fontWeight: 900, color, fontVariantNumeric: "tabular-nums",
        transition: "color 0.3s",
      }}>
        {remaining}
      </div>
    </div>
  );
}

/* ── Playgroup Badge — visible indicator on dog cards ─────────────────── */
function SizeBadge({ size }) {
  const theme = SIZE_THEME[size] || SIZE_THEME.unclassified;
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      fontSize: 11, fontWeight: 900, letterSpacing: "0.06em",
      color: theme.accent,
      background: `rgba(${theme.accentRgb},0.15)`,
      border: `1.5px solid rgba(${theme.accentRgb},0.35)`,
      borderRadius: 6, padding: "2px 8px",
      lineHeight: 1.4,
    }}>
      {theme.badge}
    </div>
  );
}

/* ── TV-006 + TV-008b + TV-015: Hero Checkout Card — compact mode for multi-notice ── */
function HeroCheckoutCard({ entry, dogs: allDogs, clients, fading, animalIcons, dogPhotoMap = {}, compact, playgroupMap }) {
  const entryDogs = entry.dogs || [entry];
  const resolvedDogs = entryDogs.map(d => {
    const dog = allDogs.find(dd => dd.gingrId === Number(d.animalGingrId) || dd.id === `g${d.animalGingrId}`);
    const iconData = animalIcons[dog?.gingrId];
    const animalId = String(dog?.gingrId || d.animalGingrId);
    return {
      ...d, dog,
      name: dog?.fields?.name || d.animalName || "Unknown",
      breed: dog?.fields?.breed || "",
      image: dogPhotoMap[dog?.gingrId] || iconData?.icon_url || dog?._image,
      size: getDisplayPlaygroup(playgroupMap[animalId]) || "unclassified",
      room: d.room || d.area || "",
    };
  });
  const ownerLast = entry.ownerLastName || "";
  const isUrgent = entry.remaining <= 10;
  const allNames = resolvedDogs.map(d => d.name).join(" & ");
  const firstDog = resolvedDogs[0];
  const theme = SIZE_THEME[firstDog.size] || SIZE_THEME.unclassified;
  const roomLabels = [...new Set(resolvedDogs.map(d => formatRoomDisplay(d.room)).filter(Boolean))];

  // TV-015: Compact sizing
  const imgSize = compact ? 72 : (resolvedDogs.length > 1 ? 96 : 120);
  const nameSize = compact ? 28 : (resolvedDogs.length > 1 ? 34 : 42);
  const badgeSize = compact ? 12 : 14;
  const countdownSize = compact ? 64 : 100;
  const pad = compact ? "16px 24px" : "32px 40px";
  const gap = compact ? 20 : 36;
  const radius = compact ? 20 : 28;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap,
      padding: pad,
      background: "linear-gradient(135deg, rgba(132,204,22,0.22) 0%, rgba(132,204,22,0.08) 50%, rgba(0,26,51,0.95) 100%)",
      borderRadius: radius,
      border: `3px solid ${isUrgent ? "rgba(239,68,68,0.6)" : "rgba(132,204,22,0.6)"}`,
      animation: fading
        ? "heroFadeOut 1s ease-out forwards"
        : `heroEnter 0.6s cubic-bezier(0.34, 1.56, 0.64, 1), heroPulse 2.5s ease-in-out infinite 0.6s`,
      minHeight: compact ? 80 : 140,
      position: "relative",
      overflow: "hidden",
      transition: "border-color 0.3s",
    }}>
      <div style={{
        position: "absolute", top: "-50%", left: "-20%",
        width: "60%", height: "200%",
        background: `radial-gradient(ellipse, ${isUrgent ? "rgba(239,68,68,0.08)" : "rgba(132,204,22,0.08)"} 0%, transparent 70%)`,
        pointerEvents: "none",
      }} />

      <div style={{ display: "flex", gap: compact ? 8 : 12, flexShrink: 0, position: "relative", zIndex: 1 }}>
        {resolvedDogs.map((rd, i) => (
          rd.image ? (
            <img key={rd.id || `dog-${i}`} src={rd.image} alt={rd.name} loading="eager" decoding="async" style={{
              width: imgSize, height: imgSize,
              borderRadius: compact ? 16 : 24, objectFit: "cover",
              border: `${compact ? 3 : 4}px solid ${isUrgent ? "rgba(239,68,68,0.5)" : "rgba(132,204,22,0.6)"}`,
            }} />
          ) : (
            <div key={rd.id || `dog-${i}`} style={{
              width: imgSize, height: imgSize,
              borderRadius: compact ? 16 : 24,
              background: isUrgent ? "rgba(239,68,68,0.2)" : "rgba(132,204,22,0.25)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: compact ? 24 : (resolvedDogs.length > 1 ? 36 : 48), fontWeight: 900,
              color: isUrgent ? "#EF4444" : "#84CC16",
              border: `${compact ? 3 : 4}px solid ${isUrgent ? "rgba(239,68,68,0.4)" : "rgba(132,204,22,0.4)"}`,
            }}>
              {rd.name[0]}
            </div>
          )
        ))}
      </div>

      <div style={{ flex: 1, minWidth: 0, position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: compact ? 10 : 14, marginBottom: compact ? 4 : 8, flexWrap: "wrap" }}>
          <span style={{
            fontSize: badgeSize, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase",
            color: isUrgent ? "#EF4444" : "#84CC16",
            background: isUrgent ? "rgba(239,68,68,0.15)" : "rgba(132,204,22,0.15)",
            padding: compact ? "3px 10px" : "5px 14px", borderRadius: 8,
            animation: isUrgent ? "urgentShake 0.5s ease-in-out infinite" : "none",
          }}>
            {isUrgent ? "Leaving Now" : "Checking Out"}
          </span>
          <span style={{
            fontSize: compact ? 11 : 13, fontWeight: 800, letterSpacing: "0.08em",
            color: theme.accent,
            background: `rgba(${theme.accentRgb},0.15)`,
            padding: compact ? "3px 10px" : "5px 14px", borderRadius: 8,
          }}>
            {(theme.label || "Unclassified").toUpperCase()}
          </span>
        </div>
        <div style={{
          fontSize: nameSize, fontWeight: 900, color: "#fff",
          lineHeight: 1.1, marginBottom: compact ? 2 : 6,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          letterSpacing: 0,
        }}>
          {allNames}
        </div>
        {!compact && (
          <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            {resolvedDogs.length === 1 && firstDog.breed && (
              <span style={{ fontSize: 17, color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>{firstDog.breed}</span>
            )}
            {resolvedDogs.length > 1 && (
              <span style={{ fontSize: 15, color: "rgba(255,255,255,0.45)", fontWeight: 500 }}>
                {resolvedDogs.map(d => d.breed).filter(Boolean).join(" · ")}
              </span>
            )}
            {ownerLast && (
              <span style={{ fontSize: 17, color: "rgba(132,204,22,0.8)", fontWeight: 700 }}>
                Owner: {ownerLast}
              </span>
            )}
            {roomLabels.length > 0 && (
              <span style={{ fontSize: 17, color: "rgba(255,255,255,0.62)", fontWeight: 700 }}>
                Room: {roomLabels.join(" · ")}
              </span>
            )}
          </div>
        )}
        {compact && (ownerLast || roomLabels.length > 0) && (
          <span style={{ fontSize: 13, color: "rgba(132,204,22,0.7)", fontWeight: 600, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {firstDog.breed ? `${firstDog.breed} · ` : ""}{ownerLast ? `Owner: ${ownerLast}` : ""}{ownerLast && roomLabels.length > 0 ? " · " : ""}{roomLabels.length > 0 ? `Room: ${roomLabels.join(" · ")}` : ""}
          </span>
        )}
      </div>

      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: compact ? 4 : 8,
        position: "relative", zIndex: 1,
        animation: isUrgent ? "heroCountdownPulse 1s ease-in-out infinite" : "none",
      }}>
        <CountdownCircle remaining={entry.remaining} total={Math.max(1, Math.round((entry.durationMs || DEFAULT_NOTICE_DURATION_MS) / 1000))} size={countdownSize} strokeWidth={compact ? 4 : 6} />
        {!compact && (
          <span style={{
            fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.35)",
            textTransform: "uppercase", letterSpacing: "0.08em",
          }}>
            seconds
          </span>
        )}
      </div>
    </div>
  );
}

/* ── TV-008d + TV-015: Hero Check-In Card — compact mode for multi-notice ── */
function HeroCheckInCard({ entry, dogs: allDogs, animalIcons, dogPhotoMap = {}, fading, compact, playgroupMap }) {
  const entryDogs = entry.dogs || [entry];
  const resolvedDogs = entryDogs.map(d => {
    const dog = allDogs.find(dd => dd.gingrId === Number(d.animalGingrId) || dd.id === `g${d.animalGingrId}`);
    const iconData = animalIcons[dog?.gingrId];
    const animalId = String(dog?.gingrId || d.animalGingrId);
    return {
      ...d, dog,
      name: dog?.fields?.name || d.animalName || "Unknown",
      breed: dog?.fields?.breed || "",
      image: dogPhotoMap[dog?.gingrId] || iconData?.icon_url || dog?._image,
      size: getDisplayPlaygroup(playgroupMap[animalId]) || "unclassified",
      room: d.room || d.area || "",
    };
  });
  const ownerLast = entry.ownerLastName || "";
  const allNames = resolvedDogs.map(d => d.name).join(" & ");
  const firstDog = resolvedDogs[0];
  const theme = SIZE_THEME[firstDog.size] || SIZE_THEME.unclassified;
  const roomLabels = [...new Set(resolvedDogs.map(d => formatRoomDisplay(d.room)).filter(Boolean))];

  const groupLabel = (theme.label || "Unclassified").toUpperCase();
  const groupColor = theme.accent;

  // TV-015: Compact sizing
  const imgSize = compact ? 72 : (resolvedDogs.length > 1 ? 96 : 120);
  const nameSize = compact ? 28 : (resolvedDogs.length > 1 ? 34 : 42);
  const badgeSize = compact ? 12 : 14;
  const countdownSize = compact ? 64 : 100;
  const pad = compact ? "16px 24px" : "32px 40px";
  const gap = compact ? 20 : 36;
  const radius = compact ? 20 : 28;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap,
      padding: pad,
      background: "linear-gradient(135deg, rgba(56,189,248,0.22) 0%, rgba(56,189,248,0.08) 50%, rgba(0,26,51,0.95) 100%)",
      borderRadius: radius,
      border: "3px solid rgba(56,189,248,0.6)",
      animation: fading
        ? "heroFadeOut 1s ease-out forwards"
        : `heroEnter 0.6s cubic-bezier(0.34, 1.56, 0.64, 1), checkinPulse 2.5s ease-in-out infinite 0.6s`,
      minHeight: compact ? 80 : 140,
      position: "relative",
      overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", top: "-50%", left: "-20%",
        width: "60%", height: "200%",
        background: "radial-gradient(ellipse, rgba(56,189,248,0.08) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      <div style={{ display: "flex", gap: compact ? 8 : 12, flexShrink: 0, position: "relative", zIndex: 1 }}>
        {resolvedDogs.map((rd, i) => (
          rd.image ? (
            <img key={rd.id || `dog-${i}`} src={rd.image} alt={rd.name} loading="eager" decoding="async" style={{
              width: imgSize, height: imgSize,
              borderRadius: compact ? 16 : 24, objectFit: "cover",
              border: `${compact ? 3 : 4}px solid rgba(56,189,248,0.6)`,
            }} />
          ) : (
            <div key={rd.id || `dog-${i}`} style={{
              width: imgSize, height: imgSize,
              borderRadius: compact ? 16 : 24,
              background: "rgba(56,189,248,0.25)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: compact ? 24 : (resolvedDogs.length > 1 ? 36 : 48), fontWeight: 900,
              color: "#38BDF8",
              border: `${compact ? 3 : 4}px solid rgba(56,189,248,0.4)`,
            }}>
              {rd.name[0]}
            </div>
          )
        ))}
      </div>

      <div style={{ flex: 1, minWidth: 0, position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: compact ? 10 : 14, marginBottom: compact ? 4 : 8, flexWrap: "wrap" }}>
          <span style={{
            fontSize: badgeSize, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase",
            color: "#38BDF8",
            background: "rgba(56,189,248,0.15)",
            padding: compact ? "3px 10px" : "5px 14px", borderRadius: 8,
          }}>
            Checking In
          </span>
          <span style={{
            fontSize: compact ? 11 : 13, fontWeight: 800, letterSpacing: "0.08em",
            color: groupColor,
            background: `${groupColor}22`,
            padding: compact ? "3px 10px" : "5px 14px", borderRadius: 8,
          }}>
            {groupLabel}
          </span>
        </div>
        <div style={{
          fontSize: nameSize, fontWeight: 900, color: "#fff",
          lineHeight: 1.1, marginBottom: compact ? 2 : 6,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          letterSpacing: 0,
        }}>
          {allNames}
        </div>
        {!compact && (
          <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            {resolvedDogs.length === 1 && resolvedDogs[0].breed && (
              <span style={{ fontSize: 17, color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>{resolvedDogs[0].breed}</span>
            )}
            {resolvedDogs.length > 1 && (
              <span style={{ fontSize: 15, color: "rgba(255,255,255,0.45)", fontWeight: 500 }}>
                {resolvedDogs.map(d => d.breed).filter(Boolean).join(" · ")}
              </span>
            )}
            {ownerLast && (
              <span style={{ fontSize: 17, color: "rgba(56,189,248,0.8)", fontWeight: 700 }}>
                Owner: {ownerLast}
              </span>
            )}
            {roomLabels.length > 0 && (
              <span style={{ fontSize: 17, color: "rgba(255,255,255,0.62)", fontWeight: 700 }}>
                Room: {roomLabels.join(" · ")}
              </span>
            )}
          </div>
        )}
        {compact && (ownerLast || roomLabels.length > 0) && (
          <span style={{ fontSize: 13, color: "rgba(56,189,248,0.7)", fontWeight: 600, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {firstDog.breed ? `${firstDog.breed} · ` : ""}{ownerLast ? `Owner: ${ownerLast}` : ""}{ownerLast && roomLabels.length > 0 ? " · " : ""}{roomLabels.length > 0 ? `Room: ${roomLabels.join(" · ")}` : ""}
          </span>
        )}
      </div>

      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: compact ? 4 : 8,
        position: "relative", zIndex: 1,
      }}>
        <CountdownCircle remaining={entry.remaining} total={Math.max(1, Math.round((entry.durationMs || DEFAULT_NOTICE_DURATION_MS) / 1000))} size={countdownSize} strokeWidth={compact ? 4 : 6} accentColor="#38BDF8" />
        {!compact && (
          <span style={{
            fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.35)",
            textTransform: "uppercase", letterSpacing: "0.08em",
          }}>
            seconds
          </span>
        )}
      </div>
    </div>
  );
}

/* ── TV-005: Navigation Button ────────────────────────────────────────── */
function TVNavButton({ view, isActive, count, onClick, compact = false }) {
  const [hovered, setHovered] = useState(false);
  const { label, color, colorRgb } = view;

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: compact ? 7 : 12,
        minHeight: compact ? 54 : 64,
        minWidth: 0,
        width: "100%",
        height: "100%",
        padding: compact ? "0 10px" : "0 18px",
        borderRadius: compact ? 12 : 16,
        border: isActive
          ? `2px solid ${color}`
          : `2px solid rgba(${colorRgb},${hovered ? 0.4 : 0.15})`,
        background: isActive
          ? `rgba(${colorRgb},0.2)`
          : hovered
            ? `rgba(${colorRgb},0.08)`
            : "rgba(255,255,255,0.03)",
        cursor: "pointer",
        transition: "all 0.25s ease",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Active indicator glow */}
      {isActive && (
        <div style={{
          position: "absolute", inset: 0,
          background: `radial-gradient(ellipse at center, rgba(${colorRgb},0.12) 0%, transparent 70%)`,
          pointerEvents: "none",
        }} />
      )}
      <span style={{
        flex: "1 1 auto",
        minWidth: 0,
        fontSize: compact ? 14 : 18, fontWeight: isActive ? 900 : 700,
        color: isActive ? color : hovered ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.55)",
        letterSpacing: 0,
        lineHeight: compact ? 1.05 : 1.15,
        transition: "all 0.25s ease",
        position: "relative", zIndex: 1,
        whiteSpace: "normal",
        overflow: "visible",
        textOverflow: "clip",
        textAlign: "center",
        textWrap: "balance",
      }}>
        {label}
      </span>
      {/* Count badge */}
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
        fontSize: compact ? 13 : 15, fontWeight: 900,
        color: isActive ? color : "rgba(255,255,255,0.4)",
        background: isActive ? `rgba(${colorRgb},0.2)` : "rgba(255,255,255,0.06)",
        border: `1.5px solid ${isActive ? `rgba(${colorRgb},0.4)` : "rgba(255,255,255,0.08)"}`,
        borderRadius: compact ? 8 : 10, padding: compact ? "1px 7px" : "2px 10px", minWidth: compact ? 28 : 32,
        transition: "all 0.25s ease",
        position: "relative", zIndex: 1,
        fontVariantNumeric: "tabular-nums",
      }}>
        {count}
      </span>
    </button>
  );
}

function CheckoutTvActionButton({ ariaLabel, title, onClick, children, compact = false }) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      title={title || ariaLabel}
      onClick={onClick}
      style={{
        width: compact ? 44 : 48, height: compact ? 44 : 48, borderRadius: compact ? 10 : 12,
        border: "2px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.03)",
        color: "rgba(255,255,255,0.75)",
        cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        alignSelf: "center",
        justifySelf: "center",
        transition: "background 0.2s, border-color 0.2s, color 0.2s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(255,255,255,0.08)";
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.18)";
        e.currentTarget.style.color = "#fff";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "rgba(255,255,255,0.03)";
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
        e.currentTarget.style.color = "rgba(255,255,255,0.75)";
      }}
    >
      {children}
    </button>
  );
}

function CheckoutTvHealthButton({ status, refreshState, onClick, compact = false }) {
  const tone = healthTone(status);
  const progressPct = `${Math.round((refreshState?.progress || 0) * 100)}%`;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open Checkout TV health"
      title="Open Checkout TV health"
      style={{
        minHeight: compact ? 54 : 64,
        height: "100%",
        minWidth: compact ? 136 : 154,
        padding: compact ? "0 12px" : "0 16px",
        borderRadius: compact ? 10 : 12,
        border: `2px solid ${tone.color}55`,
        background: tone.bg,
        color: tone.color,
        cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", gap: compact ? 8 : 10,
        fontSize: compact ? 12 : 14, fontWeight: 900,
        transition: "filter 0.2s, transform 0.2s",
        position: "relative",
        overflow: "hidden",
      }}
      onMouseEnter={e => { e.currentTarget.style.filter = "brightness(1.15)"; }}
      onMouseLeave={e => { e.currentTarget.style.filter = "brightness(1)"; }}
    >
      <span style={{
        position: "absolute", inset: 0,
        background: `linear-gradient(90deg, transparent, ${tone.color}22, transparent)`,
        animation: refreshState?.isRefreshing ? "tvHealthRefreshSweep 1.1s ease-in-out infinite" : "none",
        pointerEvents: "none",
      }} />
      <span style={{
        position: "absolute", left: 0, bottom: 0, height: 3, width: progressPct,
        background: tone.color,
        opacity: refreshState?.isRefreshing ? 0.95 : 0.65,
        transition: "width 0.35s ease",
        pointerEvents: "none",
      }} />
      <span style={{
        width: compact ? 8 : 10, height: compact ? 8 : 10, borderRadius: 99,
        background: tone.color,
        boxShadow: `0 0 18px ${tone.color}99`,
        flexShrink: 0,
        color: tone.color,
        animation: refreshState?.isRefreshing ? "tvHealthRefreshPulse 0.9s ease-in-out infinite" : "none",
        position: "relative",
        zIndex: 1,
      }} />
      <span style={{
        display: "grid",
        gap: 2,
        minWidth: 0,
        lineHeight: 1.05,
        position: "relative",
        zIndex: 1,
      }}>
        <span style={{ whiteSpace: "nowrap" }}>{tone.label}</span>
        <span style={{
          fontSize: compact ? 9 : 10,
          color: "rgba(255,255,255,0.64)",
          fontWeight: 850,
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
        }}>
          {refreshState?.label || "Waiting"}
        </span>
      </span>
    </button>
  );
}

function TvModalShell({ title, subtitle, onClose, children, width = 760 }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: "fixed", inset: 0, zIndex: 500,
        background: "rgba(0,10,26,0.72)",
        backdropFilter: "blur(10px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div style={{
        width: "100%", maxWidth: width,
        maxHeight: "88vh", overflow: "auto",
        borderRadius: 18,
        background: "linear-gradient(180deg, rgba(7,27,51,0.98), rgba(2,15,32,0.98))",
        border: "1px solid rgba(255,255,255,0.12)",
        boxShadow: "0 28px 80px rgba(0,0,0,0.45)",
        animation: "tvModalIn 0.18s ease-out both",
      }}>
        <div style={{
          display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 18,
          padding: "24px 26px 18px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 900, color: "#fff" }}>{title}</div>
            {subtitle && <div style={{ marginTop: 4, fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 1.45 }}>{subtitle}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 36, height: 36, borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.1)",
              background: "rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.8)",
              cursor: "pointer",
              fontSize: 20, lineHeight: 1,
            }}
          >
            x
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function SettingsChoice({ active, label, description, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: "left",
        padding: "14px 16px",
        borderRadius: 12,
        border: active ? "2px solid rgba(132,204,22,0.55)" : "2px solid rgba(255,255,255,0.08)",
        background: active ? "rgba(132,204,22,0.13)" : "rgba(255,255,255,0.04)",
        cursor: "pointer",
        color: "#fff",
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 900, color: active ? "#84CC16" : "#fff" }}>{label}</div>
      {description && <div style={{ marginTop: 4, fontSize: 12, color: "rgba(255,255,255,0.46)", lineHeight: 1.35 }}>{description}</div>}
    </button>
  );
}

function CheckoutTvSettingsModal({ settings, onChange, onClose }) {
  const update = (patch) => onChange(sanitizeCheckoutTvSettings({ ...settings, ...patch }));
  return (
    <TvModalShell
      title="Checkout TV Settings"
      subtitle="Stored on this TV/browser so the floor display can be tuned without changing the app globally."
      onClose={onClose}
      width={720}
    >
      <div style={{ padding: 26, display: "grid", gap: 24 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 900, color: "rgba(255,255,255,0.62)", textTransform: "uppercase", marginBottom: 10 }}>Notification Style</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
            <SettingsChoice
              active={settings.notificationStyle === "spotlight"}
              label="Spotlight"
              description="Large centered photos, newest notice on the right, overflow rows beneath."
              onClick={() => update({ notificationStyle: "spotlight" })}
            />
            <SettingsChoice
              active={settings.notificationStyle === "rows"}
              label="Rows"
              description="Original full-width check-in and check-out rows."
              onClick={() => update({ notificationStyle: "rows" })}
            />
          </div>
        </div>

        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: "rgba(255,255,255,0.62)", textTransform: "uppercase" }}>Notice Duration</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: "#84CC16", fontVariantNumeric: "tabular-nums" }}>{settings.noticeDurationSec}s</div>
          </div>
          <input
            type="range"
            min="20"
            max="180"
            step="5"
            value={settings.noticeDurationSec}
            onChange={(event) => update({ noticeDurationSec: Number(event.target.value) })}
            style={{ width: "100%", accentColor: "#84CC16" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11, color: "rgba(255,255,255,0.36)" }}>
            <span>20 sec</span>
            <span>3 min</span>
          </div>
        </div>

        <div>
          <div style={{ fontSize: 13, fontWeight: 900, color: "rgba(255,255,255,0.62)", textTransform: "uppercase", marginBottom: 10 }}>Photo Size Density</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
            <SettingsChoice active={settings.photoDensity === "large"} label="Large" description="Best for a distant TV." onClick={() => update({ photoDensity: "large" })} />
            <SettingsChoice active={settings.photoDensity === "balanced"} label="Balanced" description="More breathing room." onClick={() => update({ photoDensity: "balanced" })} />
            <SettingsChoice active={settings.photoDensity === "compact"} label="Compact" description="Fits smaller screens." onClick={() => update({ photoDensity: "compact" })} />
          </div>
        </div>

        <label style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18,
          padding: "16px 18px",
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(255,255,255,0.04)",
          cursor: "pointer",
        }}>
          <span>
            <span style={{ display: "block", fontSize: 15, fontWeight: 900, color: "#fff" }}>Show Details Row</span>
            <span style={{ display: "block", marginTop: 4, fontSize: 12, color: "rgba(255,255,255,0.46)" }}>Breed, owner, playgroup, and countdown details beneath spotlight photos.</span>
          </span>
          <input
            type="checkbox"
            checked={settings.showNoticeDetails}
            onChange={(event) => update({ showNoticeDetails: event.target.checked })}
            style={{ width: 22, height: 22, accentColor: "#84CC16", flexShrink: 0 }}
          />
        </label>
      </div>
    </TvModalShell>
  );
}

function CheckoutTvHealthModal({ sections, overallStatus, nowMs, audit, auditLoading, onClose }) {
  const overallTone = healthTone(overallStatus);
  return (
    <TvModalShell
      title={`Checkout TV Health: ${overallTone.label}`}
      subtitle="This is scoped to this TV surface only: live GINGR transition detection, Supabase reconciliation, playgroup classification, mid-stay reservations, first-day logic, and photo assets."
      onClose={onClose}
      width={980}
    >
      <div style={{ padding: 26, display: "grid", gap: 14 }}>
        {Object.entries(CHECKOUT_HEALTH_SPECS).map(([key, spec]) => {
          const section = sections[key] || {};
          const status = deriveSectionStatus(section, spec, nowMs);
          const tone = healthTone(status);
          const details = section.details || {};
          return (
            <div key={key} style={{
              padding: 18,
              borderRadius: 14,
              border: `1px solid ${tone.color}44`,
              background: "rgba(255,255,255,0.045)",
              display: "grid",
              gridTemplateColumns: "minmax(220px, 1.1fr) minmax(0, 1.8fr)",
              gap: 18,
            }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 99, background: tone.color, boxShadow: `0 0 14px ${tone.color}88` }} />
                  <span style={{ fontSize: 17, fontWeight: 900, color: "#fff" }}>{section.title || spec.title}</span>
                </div>
                <div style={{ fontSize: 12, lineHeight: 1.45, color: "rgba(255,255,255,0.46)" }}>{section.description || spec.description}</div>
                {section.error && (
                  <div style={{ marginTop: 10, fontSize: 12, color: "#FCA5A5", lineHeight: 1.4 }}>{section.error}</div>
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
                <HealthFact label="Status" value={tone.label} color={tone.color} />
                <HealthFact label="Frequency" value={section.frequencyLabel || spec.frequencyLabel} />
                <HealthFact label="Last Run" value={formatHealthAge(section.lastSuccessAt || section.lastStartedAt, nowMs)} />
                <HealthFact label="Next Run" value={formatHealthTime(section.nextRunAt)} />
                {section.durationMs != null && <HealthFact label="Duration" value={formatHealthDuration(section.durationMs)} />}
                {Object.entries(details).slice(0, 7).map(([label, value]) => (
                  <HealthFact key={label} label={label} value={value == null || value === "" ? "None" : String(value)} />
                ))}
              </div>
            </div>
          );
        })}
        <div style={{
          padding: 18,
          borderRadius: 14,
          border: "1px solid rgba(56,189,248,0.28)",
          background: "rgba(255,255,255,0.045)",
          display: "grid",
          gap: 14,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 900, color: "#fff" }}>Presence Audit</div>
              <div style={{ marginTop: 4, fontSize: 12, color: "rgba(255,255,255,0.46)", lineHeight: 1.4 }}>
                Recent canonical check-in/check-out events and server sync runs for this location.
              </div>
            </div>
            {auditLoading && <div style={{ fontSize: 12, color: "#38BDF8", fontWeight: 900 }}>Loading...</div>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)", gap: 14 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 900, color: "rgba(255,255,255,0.42)", textTransform: "uppercase", marginBottom: 8 }}>Recent Events</div>
              <div style={{ display: "grid", gap: 8, maxHeight: 280, overflow: "auto" }}>
                {(audit?.events || []).length === 0 && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.42)" }}>No recent events found.</div>}
                {(audit?.events || []).map(event => {
                  const state = event.event_type === "checked_out" ? event.previous_state : event.next_state;
                  const room = formatAuditRoomDisplay(state?.room_name || event.room_name, state?.area_name || event.area_name);
                  const owner = [state?.owner_first_name || event.owner_first_name, state?.owner_last_name || event.owner_last_name].filter(Boolean).join(" ");
                  return (
                    <div key={event.id || event.event_key} style={{
                      padding: "10px 11px",
                      borderRadius: 10,
                      background: "rgba(0,0,0,0.18)",
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 900, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {state?.animal_name || event.animal_name || "Unknown dog"}
                          </div>
                          <div style={{ marginTop: 3, fontSize: 11, color: "rgba(255,255,255,0.5)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {[owner || "Unknown owner", room].filter(Boolean).join(" · ")}
                          </div>
                        </div>
                        <div style={{
                          fontSize: 10,
                          color: event.event_type === "checked_out" ? "#84CC16" : "#38BDF8",
                          fontWeight: 900,
                          textTransform: "uppercase",
                          flexShrink: 0,
                        }}>
                          {event.event_type === "checked_out" ? "Out" : "In"}
                        </div>
                      </div>
                      <div style={{ marginTop: 6, fontSize: 10, color: "rgba(255,255,255,0.34)", fontVariantNumeric: "tabular-nums" }}>
                        {formatHealthAge(event.computed_at, nowMs)} · animal {event.animal_gingr_id || "unknown"} · reservation {event.reservation_gingr_id || "none"}
                      </div>
                      <div style={{ marginTop: 3, fontSize: 10, color: "rgba(255,255,255,0.3)", fontVariantNumeric: "tabular-nums" }}>
                        Observed {formatHealthAge(event.source_observed_at || event.computed_at, nowMs)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 900, color: "rgba(255,255,255,0.42)", textTransform: "uppercase", marginBottom: 8 }}>Recent Runs</div>
              <div style={{ display: "grid", gap: 8, maxHeight: 280, overflow: "auto" }}>
                {(audit?.runs || []).length === 0 && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.42)" }}>No recent sync runs found.</div>}
                {(audit?.runs || []).map(run => (
                  <div key={run.id} style={{
                    padding: "10px 11px",
                    borderRadius: 10,
                    background: "rgba(0,0,0,0.18)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 900, color: "#fff" }}>{run.status || "unknown"}</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.48)", fontVariantNumeric: "tabular-nums" }}>{formatHealthAge(run.completed_at || run.started_at, nowMs)}</div>
                    </div>
                    <div style={{ marginTop: 6, display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 6 }}>
                      <HealthFact label="Current" value={run.current_count ?? 0} />
                      <HealthFact label="In" value={run.arrivals_count ?? 0} />
                      <HealthFact label="Out" value={run.departures_count ?? 0} />
                      <HealthFact label="Dupes" value={run.duplicate_animals_count ?? 0} />
                    </div>
                    {Array.isArray(run.errors) && run.errors.length > 0 && (
                      <div style={{ marginTop: 6, fontSize: 11, color: "#FCA5A5", lineHeight: 1.35 }}>
                        {run.errors.map(error => error?.message || String(error)).filter(Boolean).slice(0, 2).join("; ")}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </TvModalShell>
  );
}

function HealthFact({ label, value, color = "rgba(255,255,255,0.82)" }) {
  return (
    <div style={{
      minHeight: 54,
      minWidth: 0,
      padding: "10px 11px",
      borderRadius: 10,
      background: "rgba(0,0,0,0.18)",
      border: "1px solid rgba(255,255,255,0.06)",
      overflow: "hidden",
    }}>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", fontWeight: 900, textTransform: "uppercase", marginBottom: 5 }}>{label}</div>
      <div style={{
        fontSize: 13,
        color,
        fontWeight: 800,
        lineHeight: 1.25,
        overflowWrap: "anywhere",
        wordBreak: "break-word",
      }}>
        {value == null || value === "" ? "Unknown" : value}
      </div>
    </div>
  );
}

function SpotlightNoticeCard({ notice, photoHeight, showDetails, compactLayout = false }) {
  const isCheckout = notice.type === "out";
  const actionColor = isCheckout ? "#84CC16" : "#38BDF8";
  const actionLabel = isCheckout ? (notice.remaining <= 10 ? "Leaving Now" : "Checking Out") : "Checking In";
  const photoWidth = Math.round(photoHeight * 0.78);
  const totalSeconds = Math.max(1, Math.round((notice.durationMs || DEFAULT_NOTICE_DURATION_MS) / 1000));
  const roomDisplay = formatRoomDisplay(notice.room);
  const hasRoom = Boolean(roomDisplay);
  return (
    <div style={{
      width: photoWidth,
      display: "flex",
      flexDirection: "column",
      alignItems: "stretch",
      gap: 10,
      opacity: notice.fading ? 0 : 1,
      transform: notice.fading ? "translateY(-18px) scale(0.86)" : "translateY(0) scale(1)",
      transition: "transform 420ms cubic-bezier(0.22,1,0.36,1), opacity 420ms",
      animation: notice.fading ? "spotlightExit 0.9s ease-out forwards" : "spotlightEnter 0.42s cubic-bezier(0.22,1,0.36,1)",
    }}>
      <div style={{
        height: photoHeight,
        borderRadius: 20,
        border: `4px solid ${actionColor}`,
        background: `linear-gradient(135deg, ${actionColor}24, rgba(255,255,255,0.05))`,
        overflow: "hidden",
        position: "relative",
        boxShadow: `0 24px 70px ${actionColor}22`,
      }}>
        {notice.image ? (
          <img
            src={notice.image}
            alt={notice.name}
            loading="eager"
            decoding="async"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <div style={{
            width: "100%", height: "100%",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: notice.theme.accent,
            fontSize: 78, fontWeight: 900,
          }}>
            {notice.name[0]}
          </div>
        )}
        <div style={{
          position: "absolute", top: 12, left: 12,
          padding: "7px 11px",
          borderRadius: 9,
          background: "rgba(0,10,26,0.72)",
          border: `1px solid ${actionColor}66`,
          color: actionColor,
          fontSize: 12,
          fontWeight: 900,
          textTransform: "uppercase",
        }}>
          {actionLabel}
        </div>
        <div style={{ position: "absolute", right: 10, bottom: 10 }}>
          <CountdownCircle remaining={notice.remaining} total={totalSeconds} size={54} strokeWidth={5} accentColor={actionColor} />
        </div>
      </div>
      <div style={{
        minHeight: showDetails ? (compactLayout ? 96 : 116) : (compactLayout ? 58 : 68),
        padding: showDetails ? (compactLayout ? "10px 12px" : "13px 14px") : "12px 10px",
        borderRadius: 14,
        background: "rgba(0,10,26,0.86)",
        border: "1px solid rgba(255,255,255,0.1)",
        textAlign: "center",
      }}>
        <div style={{ fontSize: compactLayout ? 21 : 25, fontWeight: 900, color: "#fff", lineHeight: 1.05, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{notice.name}</div>
        {showDetails && (
          <>
            <div style={{ marginTop: 7, display: "flex", justifyContent: "center", gap: 6, flexWrap: "wrap" }}>
              <SizeBadge size={notice.playgroup} />
              {notice.ownerLastName && <span style={{ fontSize: 11, fontWeight: 900, color: "rgba(255,255,255,0.64)", background: "rgba(255,255,255,0.08)", borderRadius: 6, padding: "2px 7px" }}>{notice.ownerLastName}</span>}
              {hasRoom && (
                <span style={{
                  maxWidth: "100%",
                  fontSize: 11,
                  fontWeight: 900,
                  color: actionColor,
                  background: `${actionColor}18`,
                  borderRadius: 6,
                  padding: "2px 7px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {roomDisplay}
                </span>
              )}
            </div>
            {notice.breed && <div style={{ marginTop: 6, fontSize: 12, color: "rgba(255,255,255,0.48)", lineHeight: 1.25 }}>{notice.breed}</div>}
          </>
        )}
      </div>
    </div>
  );
}

function SpotlightOverflowRow({ notice }) {
  const isCheckout = notice.type === "out";
  const actionColor = isCheckout ? "#84CC16" : "#38BDF8";
  const actionLabel = isCheckout ? "Checking Out" : "Checking In";
  const roomDisplay = formatRoomDisplay(notice.room);
  const hasRoom = Boolean(roomDisplay);
  return (
    <div style={{
      height: 66,
      display: "flex", alignItems: "center", gap: 14,
      padding: "8px 12px",
      borderRadius: 14,
      border: `1px solid ${actionColor}44`,
      background: `linear-gradient(90deg, ${actionColor}18, rgba(0,10,26,0.88))`,
      opacity: notice.fading ? 0.45 : 1,
    }}>
      {notice.image ? (
        <img src={notice.image} alt={notice.name} loading="eager" decoding="async" style={{ width: 48, height: 48, borderRadius: 10, objectFit: "cover" }} />
      ) : (
        <div style={{ width: 48, height: 48, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", background: `${notice.theme.accent}22`, color: notice.theme.accent, fontWeight: 900 }}>{notice.name[0]}</div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: actionColor, fontWeight: 900, textTransform: "uppercase" }}>{actionLabel}</div>
        <div style={{ fontSize: 19, color: "#fff", fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{notice.name}</div>
        {hasRoom && (
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{roomDisplay}</div>
        )}
      </div>
      <SizeBadge size={notice.playgroup} />
      <CountdownCircle remaining={notice.remaining} total={Math.max(1, Math.round((notice.durationMs || DEFAULT_NOTICE_DURATION_MS) / 1000))} size={44} strokeWidth={4} accentColor={actionColor} />
    </div>
  );
}

function SpotlightNoticeStage({ notices, overflowNotices, density, showDetails, compactLayout = false }) {
  if (!notices.length && !overflowNotices.length) return null;
  const count = Math.max(1, notices.length);
  const sizeMap = compactLayout
    ? {
      large: [270, 240, 215, 190, 170],
      balanced: [245, 220, 198, 176, 158],
      compact: [220, 198, 176, 156, 140],
    }
    : {
      large: [390, 350, 300, 260, 230],
      balanced: [340, 305, 270, 235, 205],
      compact: [290, 260, 230, 200, 176],
    };
  const photoHeight = (sizeMap[density] || sizeMap.large)[Math.min(count, 5) - 1];

  return (
    <div style={{
      marginBottom: compactLayout ? 12 : 18,
      padding: compactLayout ? "12px 12px" : "18px 16px",
      borderRadius: compactLayout ? 18 : 24,
      border: "1px solid rgba(255,255,255,0.08)",
      background: "linear-gradient(180deg, rgba(0,26,51,0.88), rgba(0,10,26,0.58))",
      animation: "tvGridFadeIn 0.3s ease-out",
    }}>
      {notices.length > 0 && (
        <div style={{
          minHeight: photoHeight + (showDetails ? (compactLayout ? 108 : 136) : (compactLayout ? 70 : 88)),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: compactLayout ? (count >= 5 ? 8 : 12) : (count >= 5 ? 12 : 18),
          transition: "gap 420ms ease",
        }}>
          {notices.map((notice) => (
            <SpotlightNoticeCard
              key={notice.noticeId}
              notice={notice}
              photoHeight={photoHeight}
              showDetails={showDetails}
              compactLayout={compactLayout}
            />
          ))}
        </div>
      )}
      {overflowNotices.length > 0 && (
        <div style={{ marginTop: notices.length ? 14 : 0, display: "grid", gap: 8 }}>
          {overflowNotices.map((notice) => (
            <SpotlightOverflowRow key={`overflow-${notice.noticeId}`} notice={notice} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── DogCardImage: skeleton placeholder while loading, then fade in ──── *
 * Extracted outside component body to prevent React remounting on every
 * re-render (which caused image flashing every 1s from countdown tick).
 * ──────────────────────────────────────────────────────────────────────── */
const DogCardImage = React.memo(({ src, name, accentRgb, accent, compact = false }) => {
  const [loaded, setLoaded] = useState(false);
  return (
    <div style={{ width: "calc(100% - 8px)", maxWidth: compact ? 104 : 120, maxHeight: compact ? 104 : 120, aspectRatio: "1/1", borderRadius: 14, position: "relative", overflow: "hidden", border: `2px solid rgba(${accentRgb},0.4)` }}>
      {!loaded && (
        <div style={{
          position: "absolute", inset: 0, borderRadius: 12,
          background: `rgba(${accentRgb},0.15)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 28, fontWeight: 800, color: accent,
          animation: "dogCardSkeleton 1.5s ease-in-out infinite",
        }}>
          {name[0]}
        </div>
      )}
      <img
        src={src} alt={name} loading="eager" decoding="async"
        onLoad={() => setLoaded(true)}
        style={{
          width: "100%", height: "100%", objectFit: "cover", borderRadius: 12,
          opacity: loaded ? 1 : 0, transition: "opacity 0.3s ease-in",
        }}
      />
    </div>
  );
});

/* ── DogCard: grid card for each dog ──────────────────────────────────── *
 * Extracted outside component body + React.memo to prevent remounting.
 * All previously-closed-over variables are now explicit props.
 * ──────────────────────────────────────────────────────────────────────── */
const DogCard = React.memo(({ res, sizeGroup, dogs, clients, animalIcons, dogPhotoMap, playgroupMap, allDogTags, checkingOutDogIds, firstDayDogIds, compact = false }) => {
  const dog = dogs.find(d => d.id === res.dogId);
  const client = clients.find(c => c.id === res.clientId);
  const name = dog?.fields?.name || res._animalName || "Unknown";
  const breed = dog?.fields?.breed || "";
  const ownerLast = client?.fields?.last_name || res._ownerName?.split(" ").pop() || "";
  const roomDisplay = formatRoomDisplay(res.room);
  const hasRoom = Boolean(roomDisplay);

  // Get dog photo: prefer Supabase Storage (local_photo_url) → icon → Gingr CDN
  const animalId = String(dog?.gingrId || res?.animalGingrId || res?.animal_gingr_id || "");
  const iconData = animalIcons[animalId];
  const localPhoto = dogPhotoMap?.[animalId];
  const image = localPhoto || iconData?.icon_url || dog?._image;
  const assignment = playgroupMap?.[animalId];
  const playgroup = getDisplayPlaygroup(assignment) || sizeGroup || getDogPlaygroup(dog, res, playgroupMap, allDogTags) || "unclassified";
  const themeKey = playgroup === "large" ? "large" : playgroup === "small" ? "small" : playgroup;
  const theme = SIZE_THEME[themeKey] || SIZE_THEME.unclassified;

  // Dim dogs that are being checked out (they appear in hero card above)
  const isCheckingOut = checkingOutDogIds.has(res.dogId);

  // Boarding label
  const isBoarding = res.type === "boarding";

  // All Gingr-assigned tags for this dog (for multi-badge display)
  const dogTags = allDogTags?.[animalId];
  const tagList = Array.isArray(dogTags) && dogTags.length > 0 ? dogTags : [themeKey];

  // First-day detection
  const isFirstDay = firstDayDogIds?.has(animalId);

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", padding: compact ? "7px 7px 10px" : "8px 8px 12px",
      background: isCheckingOut ? "rgba(132,204,22,0.08)" : "rgba(255,255,255,0.06)",
      borderRadius: 16,
      border: isCheckingOut
        ? "1px solid rgba(132,204,22,0.2)"
        : `2px solid rgba(${theme.accentRgb},0.25)`,
      minWidth: 0, width: "100%", transition: "transform 0.2s, opacity 0.5s, background 0.3s",
      opacity: isCheckingOut ? 0.35 : 1,
      overflow: "hidden",
    }}>
      {/* FIRST DAY banner — safety/operational signal, top priority */}
      {isFirstDay && (
        <div style={{
          width: "calc(100% + 16px)", margin: "-8px -8px 6px",
          padding: "4px 0", textAlign: "center",
          background: "rgba(234,179,8,0.2)",
          borderBottom: "1.5px solid rgba(234,179,8,0.4)",
          fontSize: 11, fontWeight: 900, letterSpacing: "0.1em",
          color: "#EAB308",
        }}>
          FIRST DAY
        </div>
      )}

      {/* Dog photo/icon — larger, scales with card width */}
      {image ? (
        <DogCardImage src={image} name={name} accentRgb={theme.accentRgb} accent={theme.accent} compact={compact} />
      ) : (
        <div style={{
          width: "calc(100% - 8px)", maxWidth: compact ? 104 : 120, maxHeight: compact ? 104 : 120, aspectRatio: "1/1",
          borderRadius: 14,
          background: `rgba(${theme.accentRgb},0.15)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 28, fontWeight: 800,
          color: theme.accent,
          border: `2px solid rgba(${theme.accentRgb},0.3)`,
        }}>
          {name[0]}
        </div>
      )}

      {/* Badge row — in-flow, between photo and name */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "center", marginTop: 6, marginBottom: 4 }}>
        {isBoarding && (
          <div style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontSize: 9, fontWeight: 900, letterSpacing: "0.08em",
            color: "#60A5FA",
            background: "rgba(96,165,250,0.15)",
            border: "1.5px solid rgba(96,165,250,0.35)",
            borderRadius: 6, padding: "2px 5px",
            lineHeight: 1.4,
          }}>
            BRD
          </div>
        )}
        {tagList.map(tag => <SizeBadge key={tag} size={tag} />)}
      </div>

      <div style={{ maxWidth: "100%", fontSize: compact ? 15 : 16, fontWeight: 800, color: "#fff", textAlign: "center", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
      {breed && <div style={{ maxWidth: "100%", fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{breed}</div>}
      <div style={{ maxWidth: "100%", fontSize: 11, color: `rgba(${theme.accentRgb},0.8)`, marginTop: 4, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ownerLast}</div>
      {hasRoom && (
        <div style={{
          maxWidth: "100%",
          fontSize: 12,
          color: "rgba(255,255,255,0.72)",
          marginTop: 3,
          fontWeight: 700,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>{roomDisplay}</div>
      )}
    </div>
  );
});

/* ── Main Component ───────────────────────────────────────────────────── */
function CheckoutTVPage({ data, nav, profile, locationId: propLocationId }) {
  /* ── Loading gate: pulsing K9 logo until reservation data is ready ── */
  if (!data || !data.reservations) {
    return (
      <div style={{
        height: "100vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        background: "linear-gradient(135deg, #0A0A0A 0%, #1A1A2E 50%, #0A0A0A 100%)",
      }}>
        <K9LoadingAnimation size={72} message="Loading checkout board..." subMessage="Fetching today’s dogs" dark />
      </div>
    );
  }
  return <CheckoutTVContent data={data} nav={nav} profile={profile} locationId={propLocationId} />;
}

function CheckoutTVContent({ data, nav, profile, locationId: propLocationId }) {
  const locationId = propLocationId || profile?.location_id;
  const tvRootRef = useRef(null);
  const [now, setNow] = useState(new Date());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [healthOpen, setHealthOpen] = useState(false);
  const [tvSettings, setTvSettings] = useState(DEFAULT_TV_SETTINGS);
  const [checkoutHealth, setCheckoutHealth] = useState(() => createInitialCheckoutHealth());
  const [presenceAudit, setPresenceAudit] = useState({ events: [], runs: [] });
  const [presenceAuditLoading, setPresenceAuditLoading] = useState(false);
  const nowMs = now.getTime();
  const viewport = useCheckoutTvViewport();
  const isCompactTv = viewport.width <= 1500 || viewport.height <= 850;
  const isShortTv = viewport.height <= 760;
  const tvLocationId = propLocationId || profile?.location_id;
  const presenceSyncConfig = usePresenceSyncConfig(tvLocationId);
  const effectivePresenceCadence = useMemo(
    () => getEffectivePresenceCadence(presenceSyncConfig.config, now),
    [presenceSyncConfig.config, now],
  );
  const presenceIntervalMs = Math.max(1000, (effectivePresenceCadence.intervalSeconds || 5) * 1000);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(CHECKOUT_TV_SETTINGS_KEY);
      if (stored) setTvSettings(sanitizeCheckoutTvSettings(JSON.parse(stored)));
    } catch {
      setTvSettings(DEFAULT_TV_SETTINGS);
    }
  }, []);

  const updateTvSettings = useCallback((nextSettings) => {
    const sanitized = sanitizeCheckoutTvSettings(nextSettings);
    setTvSettings(sanitized);
    try {
      window.localStorage.setItem(CHECKOUT_TV_SETTINGS_KEY, JSON.stringify(sanitized));
    } catch {
      // Local settings are a convenience only.
    }
  }, []);

  const noticeDurationMs = tvSettings.noticeDurationSec * 1000;

  const updateHealthSection = useCallback((key, patch) => {
    setCheckoutHealth((current) => {
      const existing = current[key] || createInitialCheckoutHealth()[key] || {};
      return {
        ...current,
        [key]: {
          ...existing,
          ...patch,
          details: {
            ...(existing.details || {}),
            ...(patch.details || {}),
          },
        },
      };
    });
  }, []);

  const checkoutHealthStatus = useMemo(
    () => deriveCheckoutHealthSummary(checkoutHealth, nowMs),
    [checkoutHealth, nowMs],
  );
  const checkoutPresenceHealthStatus = useMemo(
    () => deriveSectionStatus(checkoutHealth.boh, CHECKOUT_HEALTH_SPECS.boh, nowMs),
    [checkoutHealth.boh, nowMs],
  );
  const checkoutHealthRefreshState = useMemo(
    () => getHealthRefreshState(checkoutHealth.boh, presenceIntervalMs, nowMs),
    [checkoutHealth.boh, presenceIntervalMs, nowMs],
  );

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      await tvRootRef.current?.requestFullscreen?.();
    } catch (e) {
      // Fullscreen must be user-initiated; failed requests leave the TV usable.
    }
  }, []);

  /* ── TV-005: Navigation state ──────────────────────────────────────── */
  const [activeView, setActiveView] = useState("all");
  const [gridKey, setGridKey] = useState(0); // triggers fade animation on view change

  const handleViewChange = useCallback((viewId) => {
    setActiveView(viewId);
    setGridKey(k => k + 1);
  }, []);

  const baseReservations = data.reservations || [];
  const baseDogs = data.dogs || [];
  const clients = data.clients || [];

  const recentNoticeByAnimalRef = useRef(new Map());
  const facilityPresence = useFacilityPresence(tvLocationId, {
    enabled: Boolean(tvLocationId),
    pollMs: Math.min(PRESENCE_READ_INTERVAL_MS, presenceIntervalMs),
  });
  const canonicalPresenceAvailable = facilityPresence.available;

  const recordNoticeAnimals = useCallback((entries, type, firedAt = Date.now()) => {
    const recentMap = recentNoticeByAnimalRef.current;
    entries.forEach(entry => {
      getNoticeAnimalIds(entry).forEach(animalId => {
        recentMap.set(animalId, { type, firedAt });
      });
    });

    const oldestAllowed = firedAt - (noticeDurationMs + FADE_DURATION_MS + NOTICE_REPEAT_SUPPRESSION_MS);
    for (const [animalId, notice] of recentMap.entries()) {
      if (notice.firedAt < oldestAllowed) recentMap.delete(animalId);
    }
  }, [noticeDurationMs]);

  useEffect(() => {
    if (!facilityPresence.available) return;
    const latestSync = facilityPresence.latestSync;
    const lastSuccessAt = latestSync?.completed_at || facilityPresence.lastFetchedAt || new Date().toISOString();
    const lastSuccessMs = new Date(lastSuccessAt).getTime();
    const nextRunAt = Number.isFinite(lastSuccessMs)
      ? new Date(lastSuccessMs + presenceIntervalMs).toISOString()
      : new Date(Date.now() + presenceIntervalMs).toISOString();
    const status = facilityPresence.error
      ? "critical"
      : latestSync?.status === "running"
        ? "running"
        : "healthy";
    updateHealthSection("boh", {
      status,
      lastSuccessAt,
      nextRunAt,
      frequencyLabel: `Every ${effectivePresenceCadence.intervalSeconds}s (${effectivePresenceCadence.mode})`,
      staleAfterMs: (effectivePresenceCadence.intervalSeconds * 6 * 1000) + 10_000,
      error: facilityPresence.error,
      details: {
        Source: "Server presence worker",
        Cadence: `${effectivePresenceCadence.intervalSeconds}s`,
        Mode: effectivePresenceCadence.mode,
        "In House": facilityPresence.counts.inHouse,
        "Checking In": facilityPresence.counts.pendingArrivals,
        "Going Home": facilityPresence.counts.goingHome,
        Events: facilityPresence.recentEvents.length,
        "Latest Run": latestSync?.started_at || "pending",
      },
    });
  }, [
    facilityPresence.available,
    facilityPresence.lastFetchedAt,
    facilityPresence.error,
    facilityPresence.counts,
    facilityPresence.recentEvents.length,
    facilityPresence.latestSync,
    effectivePresenceCadence.intervalSeconds,
    effectivePresenceCadence.mode,
    presenceIntervalMs,
    updateHealthSection,
  ]);

  useEffect(() => {
    if (!healthOpen || !tvLocationId) return undefined;
    let cancelled = false;

    const loadAudit = async () => {
      setPresenceAuditLoading(true);
      try {
        const [eventsRes, runsRes] = await Promise.all([
          supabase
            .from("facility_presence_events")
            .select("event_key,event_type,animal_gingr_id,reservation_gingr_id,animal_name,owner_first_name,owner_last_name,room_name,area_name,source_observed_at,computed_at,previous_state,next_state")
            .eq("location_id", tvLocationId)
            .order("computed_at", { ascending: false })
            .limit(25),
          supabase
            .from("facility_presence_sync_runs")
            .select("id,status,started_at,completed_at,duration_ms,current_count,arrivals_count,departures_count,duplicate_animals_count,errors,metadata")
            .eq("location_id", tvLocationId)
            .order("started_at", { ascending: false })
            .limit(15),
        ]);

        if (cancelled) return;
        if (eventsRes.error) throw eventsRes.error;
        if (runsRes.error) throw runsRes.error;
        setPresenceAudit({
          events: eventsRes.data || [],
          runs: runsRes.data || [],
        });
      } catch (error) {
        if (!cancelled) {
          console.warn("[CheckoutTV] presence audit load failed", error?.message || error);
          setPresenceAudit({ events: [], runs: [] });
        }
      } finally {
        if (!cancelled) setPresenceAuditLoading(false);
      }
    };

    loadAudit();
    const interval = setInterval(loadAudit, 15_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [healthOpen, tvLocationId]);

  /* ── Grid data: Supabase is the sole source of truth ───────────────── */
  const { reservations, dogs } = useMemo(() => {
    return {
      reservations: canonicalPresenceAvailable ? facilityPresence.reservations : baseReservations,
      dogs: baseDogs,
    };
  }, [canonicalPresenceAvailable, facilityPresence.reservations, baseReservations, baseDogs]);

  /* ── Fetch animal profile icons (photos) from Supabase ────────────── */
  const [animalIcons, setAnimalIcons] = useState({}); // keyed by animal_gingr_id

  useEffect(() => {
    if (!locationId) return;
    let cancelled = false;

    const fetchIcons = async () => {
      const startedMs = Date.now();
      updateHealthSection("photos", {
        status: "running",
        lastStartedAt: new Date(startedMs).toISOString(),
        nextRunAt: new Date(startedMs + ASSET_REFRESH_INTERVAL_MS).toISOString(),
        error: null,
      });
      try {
        const { data: icons, error } = await supabase
          .from("gingr_animal_icons")
          .select("animal_gingr_id,image_url")
          .eq("location_id", locationId);

        if (cancelled) return;
        if (error) throw error;

        const map = {};
        for (const icon of (icons || [])) {
          if (!icon?.animal_gingr_id || !icon?.image_url) continue;
          map[icon.animal_gingr_id] = {
            ...icon,
            icon_url: icon.image_url,
            icon_type: "profile",
            is_primary: true,
          };
        }
        setAnimalIcons(map);
        updateHealthSection("photos", {
          status: "healthy",
          lastSuccessAt: new Date().toISOString(),
          durationMs: Date.now() - startedMs,
          nextRunAt: new Date(Date.now() + ASSET_REFRESH_INTERVAL_MS).toISOString(),
          error: null,
          details: { "Profile Icons": Object.keys(map).length },
        });
      } catch (e) {
        updateHealthSection("photos", {
          status: "critical",
          lastErrorAt: new Date().toISOString(),
          nextRunAt: new Date(Date.now() + ASSET_REFRESH_INTERVAL_MS).toISOString(),
          error: e?.message || "Profile icon load failed",
        });
      }
    };

    fetchIcons();
    const interval = setInterval(fetchIcons, ASSET_REFRESH_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, [locationId, updateHealthSection]);

  /* ── Fetch dog profile photos from Supabase Storage ────────────── */
  const [dogPhotoMap, setDogPhotoMap] = useState({});

  useEffect(() => {
    if (!locationId) return;
    let cancelled = false;

    const fetchPhotos = async () => {
      const startedMs = Date.now();
      try {
        const { data, error } = await supabase
          .from("gingr_animals")
          .select("gingr_id, local_photo_url")
          .eq("location_id", locationId)
          .not("local_photo_url", "is", null);

        if (cancelled) return;
        if (error) throw error;

        const map = {};
        for (const a of (data || [])) {
          map[a.gingr_id] = a.local_photo_url;
        }
        setDogPhotoMap(map);
        updateHealthSection("photos", {
          status: "healthy",
          lastSuccessAt: new Date().toISOString(),
          durationMs: Date.now() - startedMs,
          nextRunAt: new Date(Date.now() + ASSET_REFRESH_INTERVAL_MS).toISOString(),
          error: null,
          details: { "Local Photos": Object.keys(map).length },
        });
      } catch (e) {
        updateHealthSection("photos", {
          status: "critical",
          lastErrorAt: new Date().toISOString(),
          nextRunAt: new Date(Date.now() + ASSET_REFRESH_INTERVAL_MS).toISOString(),
          error: e?.message || "Dog photo load failed",
        });
      }
    };

    fetchPhotos();
    const interval = setInterval(fetchPhotos, ASSET_REFRESH_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, [locationId, updateHealthSection]);

  /* ── Fetch canonical playgroup assignments from Gingr Play icons ─── *
   * Uses the server-side per-dog canonical assignment view so TV reads
   * the same source as scheduling and daily operations.
   * ──────────────────────────────────────────────────────────────────── */
  const [playgroupMap, setPlaygroupMap] = useState({});
  const [allDogTags, setAllDogTags] = useState({});
  const checkedInAnimalIds = useMemo(() => {
    const dogById = new Map(dogs.map(dog => [dog.id, dog]));
    return [...new Set(
      reservations
        .filter(res => res.status === "checked-in")
        .map(res => String(dogById.get(res.dogId)?.gingrId || res?.animalGingrId || res?.animal_gingr_id || "").trim())
        .filter(Boolean)
    )];
  }, [reservations, dogs]);
  const checkedInAnimalIdsKey = checkedInAnimalIds.join("|");
  const recentPresenceEventAnimalIds = useMemo(() => {
    return [...new Set(
      (facilityPresence.recentEvents || [])
        .map(event => String(event.animalGingrId || event.animal_gingr_id || "").trim())
        .filter(Boolean)
    )];
  }, [facilityPresence.recentEvents]);
  const playgroupLookupAnimalIds = useMemo(() => {
    const dogById = new Map(dogs.map(dog => [dog.id, dog]));
    const reservationAnimalIds = reservations
      .filter(res => isReservationInPlaygroupPrewarmWindow(res))
      .map(res => String(dogById.get(res.dogId)?.gingrId || res?.animalGingrId || res?.animal_gingr_id || "").trim())
      .filter(Boolean);
    return [...new Set(
      [
        ...reservationAnimalIds,
        ...recentPresenceEventAnimalIds,
      ]
    )].slice(0, 1000);
  }, [reservations, dogs, recentPresenceEventAnimalIds]);
  const playgroupLookupAnimalIdsKey = playgroupLookupAnimalIds.join("|");
  const playgroupCacheKey = locationId ? `checkout_tv_playgroups_${locationId}` : null;

  useEffect(() => {
    if (!playgroupCacheKey) return;
    let cancelled = false;
    idbGet(playgroupCacheKey).then((cached) => {
      if (cancelled || !cached?.rows || !cached?.updatedAt) return;
      const updatedAtMs = new Date(cached.updatedAt).getTime();
      if (Number.isNaN(updatedAtMs) || Date.now() - updatedAtMs > PLAYGROUP_CACHE_TTL_MS) return;
      const map = buildPlaygroupAssignmentMap(cached.rows);
      const tagsByDog = {};
      for (const [id, assignment] of Object.entries(map)) {
        tagsByDog[id] = getDisplayTags(assignment);
      }
      setPlaygroupMap(map);
      setAllDogTags(tagsByDog);
      updateHealthSection("playgroups", {
        status: "healthy",
        lastSuccessAt: cached.updatedAt,
        nextRunAt: new Date(Date.now() + PLAYGROUP_REFRESH_INTERVAL_MS).toISOString(),
        error: null,
        details: {
          Source: "local cache",
          Assignments: cached.rows.length,
          "Checked In Covered": checkedInAnimalIds.filter(id => map[id]).length,
        },
      });
    });
    return () => { cancelled = true; };
  }, [playgroupCacheKey, checkedInAnimalIdsKey, updateHealthSection]);

  useEffect(() => {
    if (!locationId) return;
    let cancelled = false;

    const fetchPlaygroups = async () => {
      const startedMs = Date.now();
      const preferAnimalScoped = playgroupLookupAnimalIds.length > 0;
      let source = preferAnimalScoped ? "canonical animal prewarm" : "canonical location view";
      updateHealthSection("playgroups", {
        status: "running",
        lastStartedAt: new Date(startedMs).toISOString(),
        nextRunAt: new Date(startedMs + PLAYGROUP_REFRESH_INTERVAL_MS).toISOString(),
        error: null,
        details: {
          Source: source,
          "Checked In": checkedInAnimalIds.length,
          "Prewarm Dogs": playgroupLookupAnimalIds.length,
        },
      });
      try {
        const assignmentColumns = "animal_gingr_id, size_group, has_private_play, has_evaluation, is_half_and_half, primary_display_playgroup, scheduling_playgroup, playgroup_tags, source_icon_titles, source_icon_comments, half_and_half_note, unresolved_reason";
        const readAssignments = async ({ byAnimalIds = false } = {}) => {
          let query = supabase
            .from("v_dog_playgroup_assignments_current")
            .select(assignmentColumns);

          if (byAnimalIds && playgroupLookupAnimalIds.length > 0) {
            query = query.in("animal_gingr_id", playgroupLookupAnimalIds);
          } else {
            query = query.eq("location_id", locationId);
          }

          return query;
        };

        let assignmentRead = { data: null, error: null };
        try {
          assignmentRead = await withTimeout(
            readAssignments({ byAnimalIds: preferAnimalScoped }),
            8_000,
            "Playgroup assignment read timed out"
          );
        } catch (readError) {
          assignmentRead = { data: null, error: readError };
        }
        const { data, error } = assignmentRead;

        if (cancelled) return;

        let assignmentRows = !error && Array.isArray(data) && data.length > 0 ? data : [];
        let refreshFailed = Boolean(error);

        if (error) {
          console.warn("[CheckoutTV] canonical playgroup assignment read failed; trying raw GINGR icon fallback.", error.message || error);
        }

        if (assignmentRows.length === 0) {
          const readIconRows = async ({ byAnimalIds = false } = {}) => {
            let query = supabase
              .from("gingr_animal_icons_live")
              .select("animal_gingr_id, icon_template_id, icon_identity_key, icon_title, icon_comment, icon_group");

            if (byAnimalIds && playgroupLookupAnimalIds.length > 0) {
              query = query.in("animal_gingr_id", playgroupLookupAnimalIds);
            } else {
              query = query.eq("location_id", locationId);
            }

            return query;
          };

          const rawIconSource = preferAnimalScoped ? "raw GINGR icons by prewarm animals" : "raw GINGR icons by location";
          let mappingRead = { data: [], error: null };
          let iconRead = { data: [], error: null };
          try {
            [mappingRead, iconRead] = await withTimeout(
              Promise.all([
                supabase
                  .from("gingr_icon_mappings")
                  .select("location_id, capability_key, icon_template_id, icon_identity_key, icon_group, is_active")
                  .eq("location_id", locationId)
                  .eq("is_active", true),
                readIconRows({ byAnimalIds: preferAnimalScoped }),
              ]),
              10_000,
              "Raw GINGR icon read timed out"
            );
          } catch (readError) {
            iconRead = { data: [], error: readError };
          }
          const { data: mappings, error: mappingsError } = mappingRead;
          const { data: iconRows, error: iconError } = iconRead;

          if (cancelled) return;

          if (mappingsError) {
            console.warn("[CheckoutTV] icon mapping read failed; using title-based play icon fallback.", mappingsError.message || mappingsError);
          }
          if (iconError) {
            refreshFailed = true;
            console.warn("[CheckoutTV] raw GINGR icon fallback read failed.", iconError.message || iconError);
          } else {
            source = rawIconSource;
            assignmentRows = derivePlaygroupAssignmentsFromIcons(iconRows || [], mappingsError ? [] : (mappings || []));
          }

          if (assignmentRows.length === 0 && preferAnimalScoped) {
            source = "raw GINGR icons by location fallback";
            let locationIconRead = { data: [], error: null };
            try {
              locationIconRead = await withTimeout(
                readIconRows(),
                10_000,
                "Raw GINGR icon location fallback timed out"
              );
            } catch (readError) {
              locationIconRead = { data: [], error: readError };
            }
            const { data: locationIcons, error: locationIconError } = locationIconRead;

            if (cancelled) return;

            if (locationIconError) {
              refreshFailed = true;
              console.warn("[CheckoutTV] location raw GINGR icon fallback read failed.", locationIconError.message || locationIconError);
            } else {
              assignmentRows = derivePlaygroupAssignmentsFromIcons(locationIcons || [], mappingsError ? [] : (mappings || []));
            }
          }
        }

        if (assignmentRows.length === 0) {
          const locationSlug = window.location.pathname.split("/").filter(Boolean)[0] || null;
          const { data: sessionData } = await supabase.auth.getSession();
          const accessToken = sessionData?.session?.access_token;
          const invokeOptions = {
            body: {
              location_id: locationId,
              location_slug: locationSlug,
              sync_type: "playgroup-assignments",
              animal_ids: playgroupLookupAnimalIds,
            },
          };
          if (accessToken) {
            invokeOptions.headers = { Authorization: `Bearer ${accessToken}` };
          }

          let edgeResult = { data: null, error: null };
          try {
            edgeResult = await withTimeout(
              supabase.functions.invoke("gingr-sync", invokeOptions),
              20_000,
              "Playgroup edge refresh timed out"
            );
          } catch (invokeError) {
            edgeResult = { data: null, error: invokeError };
          }
          const { data: edgeData, error: edgeError } = edgeResult;

          if (cancelled) return;

          if (edgeError || !edgeData?.success) {
            refreshFailed = true;
            console.warn("[CheckoutTV] service playgroup assignment fallback failed.", edgeError?.message || edgeData?.error || edgeError);
          } else {
            source = "gingr-sync playgroup refresh";
            assignmentRows = Array.isArray(edgeData.assignments) ? edgeData.assignments : [];
          }
        }

        if (assignmentRows.length === 0 && refreshFailed) {
          updateHealthSection("playgroups", {
            status: "critical",
            lastErrorAt: new Date().toISOString(),
            nextRunAt: new Date(Date.now() + PLAYGROUP_REFRESH_INTERVAL_MS).toISOString(),
            error: "Unable to read canonical playgroups or refresh GINGR icons.",
          });
          return;
        }

        const map = buildPlaygroupAssignmentMap(assignmentRows);
        const tagsByDog = {};
        for (const [id, assignment] of Object.entries(map)) {
          tagsByDog[id] = getDisplayTags(assignment);
        }
        setPlaygroupMap(map);
        setAllDogTags(tagsByDog);
        if (playgroupCacheKey && assignmentRows.length > 0) {
          idbSet(playgroupCacheKey, { updatedAt: new Date().toISOString(), rows: assignmentRows });
        }
        const coveredCheckedIn = checkedInAnimalIds.filter(id => map[id]).length;
        updateHealthSection("playgroups", {
          status: "healthy",
          lastSuccessAt: new Date().toISOString(),
          durationMs: Date.now() - startedMs,
          nextRunAt: new Date(Date.now() + PLAYGROUP_REFRESH_INTERVAL_MS).toISOString(),
          error: null,
          details: {
            Source: source,
            Assignments: assignmentRows.length,
            "Checked In Covered": `${coveredCheckedIn}/${checkedInAnimalIds.length}`,
            Unclassified: Math.max(0, checkedInAnimalIds.length - coveredCheckedIn),
          },
        });
      } catch (e) {
        updateHealthSection("playgroups", {
          status: "critical",
          lastErrorAt: new Date().toISOString(),
          nextRunAt: new Date(Date.now() + PLAYGROUP_REFRESH_INTERVAL_MS).toISOString(),
          error: e?.message || "Playgroup classification refresh failed",
        });
      }
    };

    fetchPlaygroups();
    // Refresh every 60 seconds (icons rarely change mid-day)
    const interval = setInterval(fetchPlaygroups, PLAYGROUP_REFRESH_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, [locationId, checkedInAnimalIdsKey, playgroupLookupAnimalIdsKey, playgroupCacheKey, checkedInAnimalIds, playgroupLookupAnimalIds, updateHealthSection]);

  /* ── First-day dogs: first-ever daycare visit at this location ─────── *
   * Own 60-second interval — NOT tied to the 10-15s BOH poll cycle.
   * This is intentionally not a blanket first-reservation rule for boarding.
   * ──────────────────────────────────────────────────────────────────── */
  const [firstDayDogIds, setFirstDayDogIds] = useState(new Set());

  useEffect(() => {
    if (!locationId) return;
    let cancelled = false;

    const fetchFirstDayDogs = async () => {
      const startedMs = Date.now();
      updateHealthSection("firstDay", {
        status: "running",
        lastStartedAt: new Date(startedMs).toISOString(),
        nextRunAt: new Date(startedMs + FIRST_DAY_REFRESH_INTERVAL_MS).toISOString(),
        error: null,
        details: { Logic: "first-ever daycare visit only" },
      });
      try {
        const today = todayStr();
        // Dogs with a daycare/evaluation reservation starting today...
        const { data: todayDogs, error: e1 } = await supabase
          .from("gingr_reservations")
          .select("animal_gingr_id, reservation_type_name")
          .eq("location_id", locationId)
          .is("cancelled_date", null)
          .gte("start_date", `${today}T00:00:00`)
          .lt("start_date", `${today}T23:59:59`)
          .not("reservation_type_name", "ilike", "%tour%");

        if (cancelled) return;
        if (e1) throw e1;

        const candidates = [...new Set((todayDogs || [])
          .filter(r => isFirstDayDaycareType(r.reservation_type_name))
          .map(r => r.animal_gingr_id)
          .filter(Boolean)
        )];
        if (candidates.length === 0) {
          setFirstDayDogIds(new Set());
          updateHealthSection("firstDay", {
            status: "healthy",
            lastSuccessAt: new Date().toISOString(),
            durationMs: Date.now() - startedMs,
            nextRunAt: new Date(Date.now() + FIRST_DAY_REFRESH_INTERVAL_MS).toISOString(),
            error: null,
            details: { Candidates: 0, "First Day": 0, Logic: "first-ever daycare visit only" },
          });
          return;
        }

        // ...who have NO prior daycare/evaluation reservations before today.
        const firstDaySet = new Set();
        for (let i = 0; i < candidates.length; i += 100) {
          const chunk = candidates.slice(i, i + 100);
          const { data: priors, error: e2 } = await supabase
            .from("gingr_reservations")
            .select("animal_gingr_id, reservation_type_name")
            .eq("location_id", locationId)
            .is("cancelled_date", null)
            .lt("start_date", `${today}T00:00:00`)
            .not("reservation_type_name", "ilike", "%tour%")
            .in("animal_gingr_id", chunk);

          if (cancelled) return;
          if (e2) throw e2;

          const hadPrior = new Set((priors || [])
            .filter(r => isFirstDayDaycareType(r.reservation_type_name))
            .map(r => r.animal_gingr_id)
          );
          for (const id of chunk) {
            if (!hadPrior.has(id)) firstDaySet.add(String(id));
          }
        }

        setFirstDayDogIds(firstDaySet);
        updateHealthSection("firstDay", {
          status: "healthy",
          lastSuccessAt: new Date().toISOString(),
          durationMs: Date.now() - startedMs,
          nextRunAt: new Date(Date.now() + FIRST_DAY_REFRESH_INTERVAL_MS).toISOString(),
          error: null,
          details: { Candidates: candidates.length, "First Day": firstDaySet.size, Logic: "first-ever daycare visit only" },
        });
      } catch (e) {
        updateHealthSection("firstDay", {
          status: "critical",
          lastErrorAt: new Date().toISOString(),
          nextRunAt: new Date(Date.now() + FIRST_DAY_REFRESH_INTERVAL_MS).toISOString(),
          error: e?.message || "First-day heuristic failed",
        });
      }
    };

    fetchFirstDayDogs();
    const interval = setInterval(fetchFirstDayDogs, FIRST_DAY_REFRESH_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, [locationId, updateHealthSection]);

  /* ── TV-001: Fix daycare count ──────────────────────────────────────── *
   * The old filter checked (type === "daycare" || type === "boarding") AND
   * date range r.checkIn <= today && r.checkOut >= today.
   *
   * Problems fixed:
   * 1. "evaluation" and "dayboarding" types were excluded
   * 2. Date-only comparison broke for daycare dogs whose scheduled end_date
   *    had passed but who are still physically checked in (check_out_date null)
   *
   * Fix: Rely on status === "checked-in" (derived from check_in_date set +
   * check_out_date null). Include daycare, evaluation, dayboarding, boarding.
   * ──────────────────────────────────────────────────────────────────────── */
  const DAYCARE_TYPES = new Set(["daycare", "evaluation", "dayboarding"]);
  const BOARDING_TYPES = new Set(["boarding"]);
  const ALL_TYPES = new Set([...DAYCARE_TYPES, ...BOARDING_TYPES]);

  const checkedIn = reservations.filter(r =>
    ALL_TYPES.has(r.type) && r.status === "checked-in"
  );

  // Deduplicate by dogId (one dog could have overlapping reservations)
  const seen = new Set();
  const uniqueDogs = checkedIn.filter(r => {
    if (seen.has(r.dogId)) return false;
    seen.add(r.dogId);
    return true;
  }).sort((a, b) => {
    const aD = dogs.find(d => d.id === a.dogId);
    const bD = dogs.find(d => d.id === b.dogId);
    return (aD?.fields?.name || "").localeCompare(bD?.fields?.name || "");
  });

  useEffect(() => {
    updateHealthSection("reservations", {
      status: "healthy",
      lastStartedAt: new Date().toISOString(),
      lastSuccessAt: new Date().toISOString(),
      nextRunAt: new Date(Date.now() + PRESENCE_READ_INTERVAL_MS).toISOString(),
      error: null,
      details: {
        Source: "Supabase gingr_reservations via useGingrData",
        Window: "checked-in plus -30/+14 day quick window, then full background load",
        Reservations: reservations.length,
        "Checked In": checkedIn.length,
        "Unique Dogs": uniqueDogs.length,
        "Mid-Stay/Boarding": checkedIn.filter(res => res.type === "boarding").length,
      },
    });
  }, [reservations.length, checkedIn.length, uniqueDogs.length, updateHealthSection]);

  /* ── Icon-based classification — priority-based single assignment ──── *
   * Each dog goes into exactly ONE section based on priority:
   *   both_daycares > private_play > large > small > evaluation > unclassified
   * All Gingr-assigned tags are still shown as badges on the dog card.
   * ──────────────────────────────────────────────────────────────────────── */
  const { largeDaycare, smallDaycare, privatePlayDogs, evaluationDogs, bothDaycareDogs, unclassifiedDogs } = useMemo(() => {
    const large = [];
    const small = [];
    const pp = [];
    const evals = [];
    const both = [];
    const unclassified = [];

    for (const res of uniqueDogs) {
      const dog = dogs.find(d => d.id === res.dogId);
      const playgroup = getDogPlaygroup(dog, res, playgroupMap, allDogTags);

      if (playgroup === "both_daycares") both.push(res);
      else if (playgroup === "private_play") pp.push(res);
      else if (playgroup === "evaluation") evals.push(res);
      else if (playgroup === "large") large.push(res);
      else if (playgroup === "small") small.push(res);
      else unclassified.push(res);
    }

    return { largeDaycare: large, smallDaycare: small, privatePlayDogs: pp, evaluationDogs: evals, bothDaycareDogs: both, unclassifiedDogs: unclassified };
  }, [uniqueDogs, dogs, playgroupMap, allDogTags]);

  /* ── Simple counts — each dog in exactly one section ─────────────────── */
  const viewCounts = useMemo(() => ({
    "all": uniqueDogs.length,
    "small-daycare": smallDaycare.length,
    "large-daycare": largeDaycare.length,
    "private-play": privatePlayDogs.length,
    "evaluation": evaluationDogs.length,
    "both-daycares": bothDaycareDogs.length,
    "unclassified": unclassifiedDogs.length,
  }), [uniqueDogs, smallDaycare, largeDaycare, privatePlayDogs, evaluationDogs, bothDaycareDogs, unclassifiedDogs]);

  /* ── TV-012/TV-013: Persistent TV notice system ────────────────────── *
   * Notices (check-in / check-out hero cards) are stored with a timestamp
   * (`firedAt`) and a fixed duration. A single 1-second interval drives
   * the countdown for ALL active notices, computing `remaining` from
   * wall-clock time so they are immune to re-renders, BOH poll cycles,
   * or React state batching. Once fired, a notice lives for its full
   * duration no matter what.
   * ──────────────────────────────────────────────────────────────────── */
  // Raw notice stores — entries have { id, dogs, ownerLastName, firedAt, durationMs }
  const [checkingOutRaw, setCheckingOutRaw] = useState([]);
  const [checkingInRaw, setCheckingInRaw] = useState([]);

  // Derived display state — recomputed every tick
  const [checkingOut, setCheckingOut] = useState([]);
  const [checkingIn, setCheckingIn] = useState([]);
  const processedPresenceEventIdsRef = useRef(new Set());
  const presenceEventsInitializedRef = useRef(false);

  const checkedInNoticeMap = useMemo(() => {
    const dogById = new Map(dogs.map(dog => [dog.id, dog]));
    const clientById = new Map(clients.map(client => [client.id, client]));
    const map = new Map();

    for (const res of uniqueDogs) {
      const dog = dogById.get(res.dogId);
      const animalId = getReservationAnimalId(res, dog);
      if (!animalId) continue;
      map.set(animalId, {
        animalId,
        res,
        dog,
        client: clientById.get(res.clientId),
      });
    }

    return map;
  }, [uniqueDogs, dogs, clients]);
  const previousCheckedInNoticeMapRef = useRef(null);

  useEffect(() => {
    previousCheckedInNoticeMapRef.current = null;
    recentNoticeByAnimalRef.current.clear();
    processedPresenceEventIdsRef.current.clear();
    presenceEventsInitializedRef.current = false;
  }, [locationId]);

  useEffect(() => {
    if (!canonicalPresenceAvailable) return;
    const events = facilityPresence.recentEvents || [];
    const seen = processedPresenceEventIdsRef.current;

    if (!presenceEventsInitializedRef.current) {
      presenceEventsInitializedRef.current = true;
    }

    const newCheckIns = [];
    const newCheckOuts = [];
    const firedAt = Date.now();

    for (const event of [...events].reverse()) {
      if (!event.id || seen.has(event.id)) continue;
      seen.add(event.id);
      const group = mapPresenceEventToNoticeGroup(event, {
        firedAt,
        nowMs: firedAt,
        durationMs: noticeDurationMs,
        recentWindowMs: PRESENCE_NOTICE_WINDOW_MS,
      });
      if (!group) continue;
      if (event.eventType === "checked_in") newCheckIns.push(group);
      if (event.eventType === "checked_out") newCheckOuts.push(group);
    }

    if (newCheckIns.length > 0) {
      recordNoticeAnimals(newCheckIns, "in", firedAt);
      setCheckingInRaw(prev => {
        const existing = new Set(prev.map(entry => entry.id));
        return [...prev, ...newCheckIns.filter(entry => !existing.has(entry.id))];
      });
    }

    if (newCheckOuts.length > 0) {
      recordNoticeAnimals(newCheckOuts, "out", firedAt);
      setCheckingOutRaw(prev => {
        const existing = new Set(prev.map(entry => entry.id));
        return [...prev, ...newCheckOuts.filter(entry => !existing.has(entry.id))];
      });
    }
  }, [canonicalPresenceAvailable, facilityPresence.recentEvents, noticeDurationMs, recordNoticeAnimals]);

  useEffect(() => {
    if (canonicalPresenceAvailable) {
      previousCheckedInNoticeMapRef.current = new Map(checkedInNoticeMap);
      return;
    }

    const previousMap = previousCheckedInNoticeMapRef.current;
    if (previousMap === null) {
      previousCheckedInNoticeMapRef.current = new Map(checkedInNoticeMap);
      return;
    }

    const arrivals = [];
    const departures = [];
    for (const [animalId, record] of checkedInNoticeMap.entries()) {
      if (!previousMap.has(animalId)) arrivals.push(record);
    }
    for (const [animalId, record] of previousMap.entries()) {
      if (!checkedInNoticeMap.has(animalId)) departures.push(record);
    }

    if (arrivals.length === 0 && departures.length === 0) {
      previousCheckedInNoticeMapRef.current = new Map(checkedInNoticeMap);
      return;
    }

    const enqueueFallback = (records, type) => {
      if (records.length === 0) return;
      const firedAt = Date.now();
      const groups = groupReservationNoticeEntries(records, { firedAt, durationMs: noticeDurationMs });
      const recentMap = recentNoticeByAnimalRef.current;
      const groupsToAdd = [];
      const conflictingAnimalIds = new Set();

      for (const group of groups) {
        const animalIds = getNoticeAnimalIds(group);
        const allAnimalsAlreadyAnnounced = animalIds.length > 0 && animalIds.every(animalId => {
          const recent = recentMap.get(animalId);
          return recent?.type === type && firedAt - recent.firedAt < NOTICE_REPEAT_SUPPRESSION_MS;
        });

        for (const animalId of animalIds) {
          const recent = recentMap.get(animalId);
          if (recent?.type && recent.type !== type && firedAt - recent.firedAt < OPPOSITE_NOTICE_REPLACE_MS) {
            conflictingAnimalIds.add(animalId);
          }
        }

        if (!allAnimalsAlreadyAnnounced) groupsToAdd.push(group);
      }

      if (groupsToAdd.length === 0) return;

      if (conflictingAnimalIds.size > 0) {
        if (type === "in") {
          setCheckingOutRaw(prev => prev.filter(entry => !noticeTouchesAnimalIds(entry, conflictingAnimalIds)));
        } else {
          setCheckingInRaw(prev => prev.filter(entry => !noticeTouchesAnimalIds(entry, conflictingAnimalIds)));
        }
      }

      recordNoticeAnimals(groupsToAdd, type, firedAt);

      if (type === "in") {
        setCheckingInRaw(prev => {
          const existing = new Set(prev.map(entry => entry.id));
          return [...prev, ...groupsToAdd.filter(entry => !existing.has(entry.id))];
        });
      } else {
        setCheckingOutRaw(prev => {
          const existing = new Set(prev.map(entry => entry.id));
          return [...prev, ...groupsToAdd.filter(entry => !existing.has(entry.id))];
        });
      }
    };

    enqueueFallback(arrivals, "in");
    enqueueFallback(departures, "out");
    previousCheckedInNoticeMapRef.current = new Map(checkedInNoticeMap);
  }, [canonicalPresenceAvailable, checkedInNoticeMap, noticeDurationMs, recordNoticeAnimals]);

  // Single tick drives all notice countdowns
  useEffect(() => {
    const hasAny = checkingOutRaw.length > 0 || checkingInRaw.length > 0;
    if (!hasAny) {
      setCheckingOut([]);
      setCheckingIn([]);
      return;
    }

    const tick = () => {
      const now = Date.now();

      const computeDisplay = (raw) => {
        return raw
          .map(e => {
            const elapsed = now - e.firedAt;
            const remaining = Math.max(0, Math.ceil((e.durationMs - elapsed) / 1000));
            const fading = elapsed >= e.durationMs;
            const expired = elapsed >= e.durationMs + FADE_DURATION_MS;
            return { ...e, remaining, fading, expired };
          })
          .filter(e => !e.expired);
      };

      const outDisplay = computeDisplay(checkingOutRaw);
      const inDisplay = computeDisplay(checkingInRaw);

      setCheckingOut(outDisplay);
      setCheckingIn(inDisplay);

      // Prune expired entries from raw stores
      const outExpired = outDisplay.length < checkingOutRaw.length;
      const inExpired = inDisplay.length < checkingInRaw.length;
      if (outExpired) setCheckingOutRaw(prev => prev.filter(e => now - e.firedAt < e.durationMs + FADE_DURATION_MS));
      if (inExpired) setCheckingInRaw(prev => prev.filter(e => now - e.firedAt < e.durationMs + FADE_DURATION_MS));
    };

    tick(); // immediate first tick
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [checkingOutRaw, checkingInRaw]);

  /* ── TV-011 + TV-018: View-dependent hero card filter ────────────────── *
   * When a filtered view is active, only show hero cards for matching dogs.
   * Priority-based: each dog matches exactly one view.
   * ──────────────────────────────────────────────────────────────────── */
  const entryMatchesView = useCallback((entry) => {
    if (activeView === "all") return true;
    const entryDogs = entry.dogs || [entry];
    return entryDogs.some(d => {
      const dog = dogs.find(dd => dd.gingrId === Number(d.animalGingrId) || dd.id === `g${d.animalGingrId}`);
      const rType = d.resType || "boarding";
      const playgroup = getDogPlaygroup(dog, { ...d, type: rType }, playgroupMap, allDogTags);

      switch (activeView) {
        case "large-daycare":  return playgroup === "large";
        case "small-daycare":  return playgroup === "small";
        case "private-play":   return playgroup === "private_play";
        case "evaluation":     return playgroup === "evaluation";
        case "both-daycares":  return playgroup === "both_daycares";
        case "unclassified":   return playgroup === null;
        default:               return true;
      }
    });
  }, [activeView, dogs, playgroupMap, allDogTags]);

  /* ── TV-015: All active notices rendered as full cards ────────────────
   * No more "active + queue" split. Every notice gets a full hero card.
   * Cards scale down when there are multiple to fit up to 5 on screen.
   * ──────────────────────────────────────────────────────────────────── */
  const viewCheckingIn = checkingIn.filter(entryMatchesView);
  const viewCheckingOut = checkingOut.filter(entryMatchesView);
  const viewNoticeItems = useMemo(() => {
    const items = [];
    const pushEntry = (entry, type) => {
      const entryDogs = entry.dogs || [entry];
      entryDogs.forEach((dogEntry, dogIndex) => {
        items.push({
          ...normalizeNoticeDog(entry, dogEntry, { dogs, animalIcons, dogPhotoMap, playgroupMap, type }),
          sortKey: `${entry.firedAt}-${type}-${dogIndex}`,
        });
      });
    };
    viewCheckingIn.forEach(entry => pushEntry(entry, "in"));
    viewCheckingOut.forEach(entry => pushEntry(entry, "out"));
    return items.sort((a, b) => (a.firedAt - b.firedAt) || a.sortKey.localeCompare(b.sortKey));
  }, [viewCheckingIn, viewCheckingOut, dogs, animalIcons, dogPhotoMap, playgroupMap]);
  const spotlightNotices = viewNoticeItems.slice(-5);
  const overflowNotices = viewNoticeItems.slice(0, Math.max(0, viewNoticeItems.length - 5));
  const totalNotices = tvSettings.notificationStyle === "spotlight"
    ? viewNoticeItems.length
    : viewCheckingIn.length + viewCheckingOut.length;
  // compact=true when 2+ notices — shrinks cards to fit more on screen
  const compactNotices = totalNotices >= 2;

  // Set of dogIds currently checking out — used to keep them in the grid visually
  const checkingOutDogIds = useMemo(() => {
    const ids = new Set();
    for (const e of checkingOut) {
      // TV-008b: entries now have a dogs array
      if (e.dogs) {
        for (const d of e.dogs) {
          if (d.animalGingrId) ids.add(`g${d.animalGingrId}`);
        }
      } else if (e.animalGingrId) {
        ids.add(`g${e.animalGingrId}`);
      }
    }
    return ids;
  }, [checkingOut]);

  const timeStr = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });
  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  /* ── Image preloader: prefetch all dog photos when the list changes ── */
  useEffect(() => {
    const urls = new Set();
    for (const r of uniqueDogs) {
      const d = dogs.find(dd => dd.id === r.dogId);
      const icon = animalIcons[d?.gingrId];
      const url = dogPhotoMap[d?.gingrId] || icon?.icon_url || d?._image;
      if (url) urls.add(url);
    }
    urls.forEach(u => { const img = new Image(); img.src = u; });
  }, [uniqueDogs, dogs, animalIcons, dogPhotoMap]);

  /* DogCardImage + DogCard extracted outside component body — see above */

  /* DogCard is now extracted outside the component body — see above */
  // Shared props for all DogCard instances (avoids repeating in 6+ places)
  const dogCardProps = useMemo(() => ({
    dogs, clients, animalIcons, dogPhotoMap, playgroupMap, allDogTags, checkingOutDogIds, firstDayDogIds, compact: isCompactTv,
  }), [dogs, clients, animalIcons, dogPhotoMap, playgroupMap, allDogTags, checkingOutDogIds, firstDayDogIds, isCompactTv]);

  /* ── TV-003: Enhanced Section Label with dog count and colored accent ── */
  const SectionLabel = ({ label, count, color, subtitle }) => (
    <div style={{ display: "flex", alignItems: "center", gap: isCompactTv ? 10 : 12, marginBottom: isCompactTv ? 12 : 16, marginTop: isCompactTv ? 22 : 28 }}>
      <div style={{ width: 6, height: isCompactTv ? 28 : 32, borderRadius: 3, background: color, flexShrink: 0 }} />
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: isCompactTv ? 19 : 22, fontWeight: 900, color: "#fff", letterSpacing: 0 }}>{label}</div>
          <div style={{
            fontSize: isCompactTv ? 16 : 18, fontWeight: 800, color, background: `${color}22`,
            padding: isCompactTv ? "1px 10px" : "2px 12px", borderRadius: 8,
          }}>
            {count}
          </div>
        </div>
        {subtitle && (
          <div style={{ fontSize: isCompactTv ? 11 : 12, color: "rgba(255,255,255,0.35)", fontWeight: 600, marginTop: 2 }}>{subtitle}</div>
        )}
      </div>
    </div>
  );

  const hasCheckouts = viewCheckingOut.length > 0;
  const hasCheckIns = viewCheckingIn.length > 0;

  /* ── TV-005 + TV-018: Determine which sections to render ────────────── */
  // For filtered views (not "all"), skip the section header and show a flat grid
  const isFilteredView = activeView !== "all";

  // Get the filtered dogs for single-category views
  const filteredDogList = useMemo(() => {
    switch (activeView) {
      case "small-daycare": return smallDaycare;
      case "large-daycare": return largeDaycare;
      case "private-play": return privatePlayDogs;
      case "evaluation": return evaluationDogs;
      case "both-daycares": return bothDaycareDogs;
      case "unclassified": return unclassifiedDogs;
      default: return null; // "all" uses the sectioned layout
    }
  }, [activeView, smallDaycare, largeDaycare, privatePlayDogs, evaluationDogs, bothDaycareDogs, unclassifiedDogs]);

  // Get accent color & label for filtered view
  const filteredViewMeta = NAV_VIEWS.find(v => v.id === activeView);
  const rootPadding = isShortTv ? "14px 20px" : isCompactTv ? "18px 24px" : "32px 40px";
  const dogGridStyle = {
    display: "grid",
    gridTemplateColumns: `repeat(auto-fill, minmax(${isCompactTv ? 132 : 150}px, 1fr))`,
    gap: isCompactTv ? 10 : 12,
    alignItems: "start",
  };

  return (
    <div ref={tvRootRef} style={{
      minHeight: "100vh", background: "linear-gradient(180deg, #001A33 0%, #00112A 50%, #000A1A 100%)",
      padding: rootPadding, fontFamily: "'Outfit', -apple-system, sans-serif", overflow: "auto",
      boxSizing: "border-box",
    }}>
      {/* Header — K9 Operations branding */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: isCompactTv ? 6 : 8, gap: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: isCompactTv ? 12 : 16, minWidth: 0 }}>
          {/* K9 Operations logo icon (white for dark bg) */}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="163.70 160.20 678.60 678.60" style={{ width: isCompactTv ? 42 : 48, height: isCompactTv ? 42 : 48, flexShrink: 0 }}>
            <g transform="translate(0,1024) scale(0.1,-0.1)" fill="#84CC16" stroke="none">
              <path d="M5710 7969 c-414 -27 -846 -110 -1098 -210 -265 -105 -456 -268 -513-438 -29 -86 -19 -111 46 -111 51 0 141 29 230 73 l60 29 -25 -27 c-79 -86-250 -164 -455 -208 -158 -35 -260 -40 -545 -31 -490 15 -595 10 -800 -38-107 -25 -251 -93 -312 -147 -127 -113 -173 -275 -133 -463 7 -37 21 -79 29-95 15 -27 15 -25 16 60 0 51 4 87 10 87 6 0 10 -17 10 -37 0 -96 52 -308 134-550 19 -57 32 -103 30 -103 -10 0 -74 149 -104 242 -17 51 -33 100 -36 108-8 22 -38 -32 -68 -122 -42 -124 -67 -293 -73 -498 -19 -618 159 -1097 489-1316 67 -45 97 -54 62 -19 -30 29 -123 206 -154 293 -79 219 -77 465 6 599 10 15 33 44 51 64 l34 35 -25 55 c-31 68 -72 216 -91 334 -16 97 -20 221 -7 229 4 2 18 -45 30 -106 46 -224 124 -422 201 -510 29 -32 72 -63 138 -97 125-66 228 -136 393 -267 430 -340 698 -468 1135 -541 84 -14 160 -18 320 -17 215 1 281 9 502 61 40 9 75 14 78 11 11 -11 -7 -56 -37 -92 -127 -154 -504-153 -998 3 -52 17 -96 29 -98 27 -4 -5 77 -50 173 -95 341 -162 704 -218 922-141 229 80 307 285 193 510 -56 110 -121 193 -434 549 -69 79 -126 146 -126 148 0 7 22 -10 84 -65 73 -64 224 -160 371 -237 177 -92 257 -146 345 -235 81-81 140 -177 140 -229 0 -17 5 -31 10 -31 6 0 10 30 10 70 0 78 -23 152 -69 220 -38 56 -138 158 -176 178 -26 14 -27 16 -10 20 46 8 217 67 310 108 324 139 604 361 779 618 122 179 173 338 256 801 62 347 100 485 173 630 154 310 406 498 774 581 l81 18 -66 29 c-78 33 -294 106 -402 136 -201 55 -483 104-790 137 -173 18 -779 27 -980 13z m-2468 -973 c142 -42 242 -106 277 -179 12-24 21 -54 21 -68 0 -33 -19 -99 -29 -99 -4 0 -13 22 -20 50 -9 34 -27 66 -58 100 -83 92 -330 193 -506 207 -43 3 -80 11 -84 16 -4 7 48 8 153 4 129 -4 175-10 246 -31z m-529 -359 c18 -8 39 -22 47 -32 14 -18 14 -18 -10 -2 -14 9 -43 19 -65 22 -36 6 -45 3 -73 -23 -41 -38 -41 -61 1 -165 86 -212 179 -287 322-257 140 29 343 165 472 318 29 34 53 60 53 57 0 -35 -136 -222 -208 -287-282 -252 -600 -248 -720 11 -37 77 -43 210 -14 267 46 89 118 123 195 91z M2633 5000 c-106 -64 -125 -336 -39 -563 86 -229 310 -432 583 -531 140 -50 211 -60 565 -85 116 -8 134 -12 200 -44 88 -42 238 -166 337 -277 39 -44 135-160 213 -258 277 -345 478 -564 628 -683 69 -55 82 -57 20 -3 -187 164 -357 364 -615 724 -194 270 -256 351 -335 434 -41 44 -68 77 -60 74 9 -3 52 -16 95-28 133 -37 335 -124 430 -185 93 -59 101 -57 30 10 -119 111 -301 228 -427 274 -145 54 -254 70 -538 81 -129 5 -270 16 -313 24 -291 57 -503 208 -617 439 -27 56 -57 129 -65 162 -28 109 -15 217 27 231 61 19 191 -39 428 -189 74-47 136 -84 138 -82 9 9 -272 264 -428 390 -129 104 -192 125 -257 85z"/>
            </g>
          </svg>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: isCompactTv ? 24 : 28, fontWeight: 900, color: "#fff", letterSpacing: 0, whiteSpace: "nowrap" }}>K9 Operations</div>
            <div style={{ fontSize: isCompactTv ? 10 : 12, color: "rgba(132,204,22,0.6)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>The Operating System for Pet Care Facilities</div>
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: isCompactTv ? 31 : 36, fontWeight: 900, color: "#fff", fontVariantNumeric: "tabular-nums", lineHeight: 1.05 }}>{timeStr}</div>
          <div style={{ fontSize: isCompactTv ? 12 : 13, color: "rgba(255,255,255,0.4)", fontWeight: 500 }}>{dateStr}</div>
        </div>
      </div>

      {/* TV-005: Navigation bar — large, touch-friendly buttons */}
      <div style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fit, minmax(${isCompactTv ? 148 : 172}px, 1fr))`,
        gridAutoRows: isCompactTv ? 54 : 64,
        alignItems: "stretch",
        gap: isCompactTv ? 8 : 10,
        padding: isCompactTv ? "10px 0" : "12px 0", marginBottom: 4,
        borderTop: "1px solid rgba(255,255,255,0.06)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        overflow: "visible",
        animation: "tvNavFadeIn 0.4s ease-out",
      }}>
        {NAV_VIEWS.map(view => (
          <TVNavButton
            key={view.id}
            view={view}
            isActive={activeView === view.id}
            count={viewCounts[view.id]}
            onClick={() => handleViewChange(view.id)}
            compact={isCompactTv}
          />
        ))}

        <CheckoutTvHealthButton
          status={checkoutPresenceHealthStatus}
          refreshState={checkoutHealthRefreshState}
          onClick={() => setHealthOpen(true)}
          compact={isCompactTv}
        />
        <CheckoutTvActionButton ariaLabel="Open Checkout TV settings" title="Settings" onClick={() => setSettingsOpen(true)} compact={isCompactTv}>
          <svg width={isCompactTv ? "19" : "21"} height={isCompactTv ? "19" : "21"} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 15.4A3.4 3.4 0 1 0 12 8.6a3.4 3.4 0 0 0 0 6.8Z" stroke="currentColor" strokeWidth="2.1" />
            <path d="M19.4 15a1.9 1.9 0 0 0 .38 2.1l.06.06a2.3 2.3 0 0 1-3.25 3.25l-.06-.06a1.9 1.9 0 0 0-2.1-.38 1.9 1.9 0 0 0-1.15 1.74V22a2.3 2.3 0 0 1-4.6 0v-.09A1.9 1.9 0 0 0 7.54 20a1.9 1.9 0 0 0-2.1.38l-.06.06a2.3 2.3 0 1 1-3.25-3.25l.06-.06A1.9 1.9 0 0 0 2.56 15a1.9 1.9 0 0 0-1.74-1.15H.73a2.3 2.3 0 1 1 0-4.6h.09A1.9 1.9 0 0 0 2.56 8a1.9 1.9 0 0 0-.38-2.1l-.06-.06a2.3 2.3 0 1 1 3.25-3.25l.06.06A1.9 1.9 0 0 0 7.54 3a1.9 1.9 0 0 0 1.15-1.74V1.2a2.3 2.3 0 1 1 4.6 0v.09A1.9 1.9 0 0 0 14.46 3a1.9 1.9 0 0 0 2.1-.38l.06-.06a2.3 2.3 0 1 1 3.25 3.25l-.06.06A1.9 1.9 0 0 0 19.44 8c.21.73.88 1.24 1.64 1.24h.19a2.3 2.3 0 1 1 0 4.6h-.19A1.9 1.9 0 0 0 19.4 15Z" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </CheckoutTvActionButton>
      </div>

      {/* Stats bar — Icon-based classification counts */}
      <div style={{ display: "flex", gap: isCompactTv ? 16 : 24, padding: isCompactTv ? "8px 0" : "10px 0", marginBottom: isCompactTv ? 6 : 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: isCompactTv ? 13 : 14, color: "rgba(255,255,255,0.5)" }}>Total: <span style={{ fontWeight: 800, color: "#fff" }}>{uniqueDogs.length}</span></div>
        <div style={{ fontSize: isCompactTv ? 13 : 14, color: "rgba(255,255,255,0.5)" }}>
          Large: <span style={{ fontWeight: 800, color: SIZE_THEME.large.accent }}>{viewCounts["large-daycare"]}</span>
        </div>
        <div style={{ fontSize: isCompactTv ? 13 : 14, color: "rgba(255,255,255,0.5)" }}>
          Small: <span style={{ fontWeight: 800, color: SIZE_THEME.small.accent }}>{viewCounts["small-daycare"]}</span>
        </div>
        <div style={{ fontSize: isCompactTv ? 13 : 14, color: "rgba(255,255,255,0.5)" }}>PP: <span style={{ fontWeight: 800, color: "#EF4444" }}>{viewCounts["private-play"]}</span></div>
        {viewCounts["evaluation"] > 0 && <div style={{ fontSize: isCompactTv ? 13 : 14, color: "rgba(255,255,255,0.5)" }}>Eval: <span style={{ fontWeight: 800, color: "#EAB308" }}>{viewCounts["evaluation"]}</span></div>}
        {viewCounts["both-daycares"] > 0 && <div style={{ fontSize: isCompactTv ? 13 : 14, color: "rgba(255,255,255,0.5)" }}>Both: <span style={{ fontWeight: 800, color: SIZE_THEME.both_daycares.accent }}>{viewCounts["both-daycares"]}</span></div>}
        {viewCounts["unclassified"] > 0 && <div style={{ fontSize: isCompactTv ? 13 : 14, color: "rgba(255,255,255,0.5)" }}>Unclassified: <span style={{ fontWeight: 800, color: "#6B7280" }}>{viewCounts["unclassified"]}</span></div>}
        {hasCheckIns && (
          <div style={{ fontSize: isCompactTv ? 13 : 14, color: "rgba(255,255,255,0.5)", marginLeft: hasCheckouts ? 0 : "auto" }}>
            Checking in: <span style={{ fontWeight: 800, color: "#38BDF8" }}>{viewCheckingIn.filter(e => !e.fading).length}</span>
          </div>
        )}
        {hasCheckouts && (
          <div style={{ fontSize: isCompactTv ? 13 : 14, color: "rgba(255,255,255,0.5)", marginLeft: hasCheckIns ? 0 : "auto" }}>
            Checking out: <span style={{ fontWeight: 800, color: "#EF4444" }}>{viewCheckingOut.filter(e => !e.fading).length}</span>
          </div>
        )}
      </div>

      {/* TV-015: Unified notice section — all check-in + check-out cards shown simultaneously */}
      {totalNotices > 0 && (
        tvSettings.notificationStyle === "spotlight" ? (
          <SpotlightNoticeStage
            notices={spotlightNotices}
            overflowNotices={overflowNotices}
            density={tvSettings.photoDensity}
            showDetails={tvSettings.showNoticeDetails}
            compactLayout={isCompactTv}
          />
        ) : (
          <div style={{
            display: "flex", flexDirection: "column", gap: compactNotices ? 8 : 12,
            marginBottom: 16,
            animation: "tvGridFadeIn 0.35s ease-out",
          }}>
            {/* Check-in cards first */}
            {viewCheckingIn.map(entry => (
              <HeroCheckInCard
                key={`in-${entry.id}`}
                entry={entry}
                dogs={dogs}
                animalIcons={animalIcons}
                dogPhotoMap={dogPhotoMap}
                fading={entry.fading}
                compact={compactNotices}
                playgroupMap={playgroupMap}
              />
            ))}
            {/* Then check-out cards */}
            {viewCheckingOut.map(entry => (
              <HeroCheckoutCard
                key={`out-${entry.id}`}
                entry={entry}
                dogs={dogs}
                clients={clients}
                fading={entry.fading}
                animalIcons={animalIcons}
                dogPhotoMap={dogPhotoMap}
                compact={compactNotices}
                playgroupMap={playgroupMap}
              />
            ))}
          </div>
        )
      )}

      {/* TV-005 + TV-008c: Grid content with smooth reflow transition */}
      <div key={gridKey} style={{ animation: "tvGridFadeIn 0.35s ease-out", transition: "all 0.4s ease" }}>
        {isFilteredView && filteredDogList ? (
          /* ── Filtered single-category view ────────────────────────────── */
          <>
            {filteredDogList.length > 0 ? (
              <div>
                <SectionLabel
                  label={filteredViewMeta?.label || ""}
                  count={viewCounts[activeView] ?? filteredDogList.length}
                  color={filteredViewMeta?.color || "#fff"}
                  subtitle={
                    activeView === "evaluation" ? "Needs evaluation (Gingr icon)" :
                    activeView === "both-daycares" ? "Has both large and small daycare icons" :
                    activeView === "unclassified" ? "No play icon in Gingr — please assign" :
                    `${filteredDogList.length} dogs`
                  }
                />
                <div style={dogGridStyle}>
                  {filteredDogList.map(r => (
                    <DogCard
                      key={r.id}
                      res={r}
                      {...dogCardProps}
                      sizeGroup={
                        activeView === "large-daycare" ? "large" :
                        activeView === "small-daycare" ? "small" :
                        activeView === "private-play" ? "private_play" :
                        activeView === "evaluation" ? "evaluation" :
                        activeView === "both-daycares" ? "both_daycares" :
                        activeView === "unclassified" ? "unclassified" :
                        undefined
                      }
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "80px 0" }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: "rgba(255,255,255,0.3)" }}>
                  No {filteredViewMeta?.label?.toLowerCase()} dogs checked in
                </div>
              </div>
            )}
          </>
        ) : (
          /* ── "All" view — sectioned layout (original) ─────────────────── */
          <>
            {/* Large Dog Daycare — dogs with "Large Dog Playgroup" icon */}
            {largeDaycare.length > 0 && (
              <div>
                <SectionLabel
                  label="Large Dog Daycare"
                  count={viewCounts["large-daycare"]}
                  color={SIZE_THEME.large.accent}
                  subtitle={`${largeDaycare.length} dogs`}
                />
                <div style={dogGridStyle}>
                  {largeDaycare.map(r => <DogCard key={r.id} res={r} {...dogCardProps} sizeGroup="large" />)}
                </div>
              </div>
            )}

            {/* Small Dog Daycare — dogs with "Small Dog Playgroup" icon */}
            {smallDaycare.length > 0 && (
              <div>
                <SectionLabel
                  label="Small Dog Daycare"
                  count={viewCounts["small-daycare"]}
                  color={SIZE_THEME.small.accent}
                  subtitle={`${smallDaycare.length} dogs`}
                />
                <div style={dogGridStyle}>
                  {smallDaycare.map(r => <DogCard key={r.id} res={r} {...dogCardProps} sizeGroup="small" />)}
                </div>
              </div>
            )}

            {/* Private Play — dogs with "Private Play" icon or dayboarding type */}
            {privatePlayDogs.length > 0 && (
              <div>
                <SectionLabel
                  label="Private Play"
                  count={viewCounts["private-play"]}
                  color="#EF4444"
                  subtitle={`${privatePlayDogs.length} dogs`}
                />
                <div style={dogGridStyle}>
                  {privatePlayDogs.map(r => <DogCard key={r.id} res={r} {...dogCardProps} sizeGroup="private_play" />)}
                </div>
              </div>
            )}

            {/* Evaluation — dogs with "Evaluation" icon */}
            {evaluationDogs.length > 0 && (
              <div>
                <SectionLabel
                  label="Evaluation"
                  count={viewCounts["evaluation"]}
                  color="#EAB308"
                />
                <div style={dogGridStyle}>
                  {evaluationDogs.map(r => <DogCard key={r.id} res={r} {...dogCardProps} sizeGroup="evaluation" />)}
                </div>
              </div>
            )}

            {/* Both Daycares — dogs with both large and small Gingr play icons */}
            {bothDaycareDogs.length > 0 && (
              <div>
                <SectionLabel
                  label="Both Daycares"
                  count={viewCounts["both-daycares"]}
                  color={SIZE_THEME.both_daycares.accent}
                  subtitle="Has both large and small daycare icons"
                />
                <div style={dogGridStyle}>
                  {bothDaycareDogs.map(r => <DogCard key={r.id} res={r} {...dogCardProps} sizeGroup="both_daycares" />)}
                </div>
              </div>
            )}

            {/* Unclassified — dogs with no play icon in Gingr */}
            {unclassifiedDogs.length > 0 && (
              <div>
                <SectionLabel
                  label="Unclassified"
                  count={viewCounts["unclassified"]}
                  color="#6B7280"
                  subtitle="No play icon assigned in Gingr"
                />
                <div style={dogGridStyle}>
                  {unclassifiedDogs.map(r => <DogCard key={r.id} res={r} {...dogCardProps} sizeGroup="unclassified" />)}
                </div>
              </div>
            )}

            {uniqueDogs.length === 0 && checkingOut.length === 0 && checkingIn.length === 0 && (
              <div style={{ textAlign: "center", padding: "80px 0" }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: "rgba(255,255,255,0.3)" }}>No dogs checked in today</div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div style={{ textAlign: "center", marginTop: 40, padding: "16px 0", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.15)" }}>K9 Operations · Server presence sync · Canonical: {facilityPresence.counts.inHouse} active · Supabase: {reservations.filter(r => r.status === "checked-in").length} in-house</div>
      </div>

      {settingsOpen && (
        <CheckoutTvSettingsModal
          settings={tvSettings}
          onChange={updateTvSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {healthOpen && (
        <CheckoutTvHealthModal
          sections={checkoutHealth}
          overallStatus={checkoutHealthStatus}
          nowMs={nowMs}
          audit={presenceAudit}
          auditLoading={presenceAuditLoading}
          onClose={() => setHealthOpen(false)}
        />
      )}

      {/* Floating Fullscreen Button */}
      <button
        type="button"
        onClick={toggleFullscreen}
        onMouseEnter={e => { e.currentTarget.style.opacity = 1; e.currentTarget.style.background = "rgba(255,255,255,0.15)"; }}
        onMouseLeave={e => { e.currentTarget.style.opacity = 0.3; e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
        aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        style={{
          position: "fixed", top: 16, left: 60, zIndex: 100,
          width: 36, height: 36, borderRadius: 10,
          background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)",
          color: "rgba(255,255,255,0.8)", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          opacity: 0.3,
          transition: "opacity 0.2s, background 0.2s",
        }}
        title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
      >
        {isFullscreen ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {/* Floating Exit Button — subtle, top-left corner */}
      <button
        type="button"
        onClick={() => nav("ops-hub")}
        onMouseEnter={e => { e.currentTarget.style.opacity = 1; e.currentTarget.style.background = "rgba(255,255,255,0.15)"; }}
        onMouseLeave={e => { e.currentTarget.style.opacity = 0.3; e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
        style={{
          position: "fixed", top: 16, left: 16, zIndex: 100,
          width: 36, height: 36, borderRadius: 10,
          background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)",
          color: "rgba(255,255,255,0.8)", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 16, fontWeight: 700, opacity: 0.3,
          transition: "opacity 0.2s, background 0.2s",
        }}
        title="Exit Checkout TV"
      >
        ✕
      </button>
    </div>
  );
}


export default CheckoutTVPage;

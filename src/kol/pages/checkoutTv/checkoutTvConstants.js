// K9 Operations — CheckoutTVPage constants
// Extracted verbatim from CheckoutTVPage.jsx. Pure data only — no behavior change.

/* ── Playgroup theme colors ───────────────────────────────────────────── */
export const SIZE_THEME = {
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
export const NAV_VIEWS = [
  { id: "all",           label: "All",            color: "#fff",     colorRgb: "255,255,255" },
  { id: "small-daycare", label: "Small Daycare",  color: "#0EA5E9",  colorRgb: "14,165,233" },
  { id: "large-daycare", label: "Large Daycare",  color: "#84CC16",  colorRgb: "132,204,22" },
  { id: "private-play",  label: "Private Play",   color: "#EF4444",  colorRgb: "239,68,68" },
  { id: "evaluation",    label: "Evaluation",     color: "#EAB308",  colorRgb: "234,179,8" },
  { id: "both-daycares", label: "Both Daycares",  color: "#14B8A6",  colorRgb: "20,184,166" },
  { id: "unclassified",  label: "Unclassified",   color: "#6B7280",  colorRgb: "107,114,128" },
];

export const DEFAULT_NOTICE_DURATION_MS = 60_000;
export const FADE_DURATION_MS = 1_200;
export const PRESENCE_READ_INTERVAL_MS = 5_000;
export const PLAYGROUP_REFRESH_INTERVAL_MS = 60_000;
export const FIRST_DAY_REFRESH_INTERVAL_MS = 60_000;
export const ASSET_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
export const CHECKOUT_TV_SETTINGS_KEY = "checkout_tv_settings_v1";
export const PLAYGROUP_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

export const DEFAULT_TV_SETTINGS = {
  notificationStyle: "spotlight",
  noticeDurationSec: 60,
  showNoticeDetails: true,
  photoDensity: "large",
};

export const NOTICE_REPEAT_SUPPRESSION_MS = 45_000;
export const OPPOSITE_NOTICE_REPLACE_MS = 45_000;

export const CHECKOUT_HEALTH_SPECS = {
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
    description: "Reads v_dog_playgroup_assignments_current, falls back to Gingr icons, and prewarms scheduled dogs.",
  },
  reservations: {
    title: "Reservation Window",
    frequencyLabel: "useGingrData foreground refresh",
    staleAfterMs: 180_000,
    description: "Loads checked-in dogs and mid-stay dogs from Supabase reservations synced from Gingr.",
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
    description: "Loads cached profile photos and Gingr profile icons for TV cards and spotlight notices.",
  },
  photoSync: {
    title: "Server Photo Pull",
    frequencyLabel: "Every 15 minutes from Gingr sync",
    staleAfterMs: 30 * 60_000,
    description: "Tracks current Gingr animal photo URLs and Supabase Storage downloads.",
  },
};

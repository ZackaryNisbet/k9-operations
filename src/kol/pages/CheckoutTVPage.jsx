// K9 Operations — CheckoutTVPage
// Isolated page component. See AGENTS.md for development contract.
// Fixes: TV-001 (daycare count), TV-002 (checkout detection), TV-003 (large/small dog differentiation),
//        TV-004 (room numbers), TV-006 (checkout highlight animation)

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "../../supabaseClient";
import { C, todayStr } from "../../shared/theme";
import { classifyReservationType, classifyReservationStatus } from "../../shared/opsHelpers";

/* ── CSS Keyframes (injected once) ────────────────────────────────────── */
const STYLE_ID = "checkout-tv-styles";
if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes checkoutPulse {
      0%, 100% { box-shadow: 0 0 20px 4px rgba(175,141,84,0.4), 0 0 60px 8px rgba(175,141,84,0.15); }
      50% { box-shadow: 0 0 30px 8px rgba(175,141,84,0.7), 0 0 80px 16px rgba(175,141,84,0.3); }
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
      0%, 100% { box-shadow: 0 0 40px 10px rgba(175,141,84,0.35), 0 0 120px 30px rgba(175,141,84,0.1), inset 0 1px 0 rgba(255,255,255,0.08); }
      50% { box-shadow: 0 0 60px 20px rgba(175,141,84,0.55), 0 0 160px 50px rgba(175,141,84,0.2), inset 0 1px 0 rgba(255,255,255,0.08); }
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
  `;
  document.head.appendChild(style);
}

/* ── TV-003: Size classification — matches getDogDaycareSize in App.jsx ── */
const SIZE_THRESHOLD = 35; // lbs
function getDogSize(dog) {
  if (!dog) return "large";
  if (dog.daycareGroupOverride) return dog.daycareGroupOverride;
  const w = parseInt(dog.fields?.weight);
  if (!w || isNaN(w)) return "large"; // default if no weight
  return w < SIZE_THRESHOLD ? "small" : "large";
}

/* ── TV-003: Size theme colors ────────────────────────────────────────── */
const SIZE_THEME = {
  large: {
    accent: "#0EA5E9",     // Sky blue
    accentRgb: "14,165,233",
    label: "Large Dog Daycare",
    badge: "LG",
    icon: "L",
  },
  small: {
    accent: "#8B5CF6",     // Violet/purple
    accentRgb: "139,92,246",
    label: "Small Dog Daycare",
    badge: "SM",
    icon: "S",
  },
};

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

/* ── Large Countdown Timer (SVG circle) — for hero card ──────────────── */
function CountdownCircle({ remaining, total = 60, size = 56, strokeWidth = 4 }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = remaining / total;
  const offset = circumference * (1 - progress);
  const isUrgent = remaining <= 10;
  const color = isUrgent ? "#EF4444" : "#AF8D54";

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

/* ── TV-003: Size Badge — visible indicator on dog cards ──────────────── */
function SizeBadge({ size }) {
  const theme = SIZE_THEME[size] || SIZE_THEME.large;
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

/* ── TV-006: Hero Checkout Card — enlarged, prominent, center-stage ──── */
function HeroCheckoutCard({ entry, dogs, clients, fading, animalIcons }) {
  const dog = dogs.find(d => d.gingrId === Number(entry.animalGingrId) || d.id === `g${entry.animalGingrId}`);
  const name = dog?.fields?.name || entry.animalName || "Unknown";
  const breed = dog?.fields?.breed || "";
  const ownerLast = entry.ownerLastName || "";
  const roomInfo = parseRoom(entry.room);
  const iconData = animalIcons[dog?.gingrId];
  const image = iconData?.icon_url || dog?._image;
  const isUrgent = entry.remaining <= 10;
  const size = getDogSize(dog);
  const theme = SIZE_THEME[size];

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 36,
      padding: "32px 40px",
      background: "linear-gradient(135deg, rgba(175,141,84,0.22) 0%, rgba(175,141,84,0.08) 50%, rgba(0,26,51,0.95) 100%)",
      borderRadius: 28,
      border: `3px solid ${isUrgent ? "rgba(239,68,68,0.6)" : "rgba(175,141,84,0.6)"}`,
      animation: fading
        ? "heroFadeOut 1s ease-out forwards"
        : `heroEnter 0.6s cubic-bezier(0.34, 1.56, 0.64, 1), heroPulse 2.5s ease-in-out infinite 0.6s`,
      minHeight: 140,
      position: "relative",
      overflow: "hidden",
      transition: "border-color 0.3s",
    }}>
      {/* Subtle background glow */}
      <div style={{
        position: "absolute", top: "-50%", left: "-20%",
        width: "60%", height: "200%",
        background: `radial-gradient(ellipse, ${isUrgent ? "rgba(239,68,68,0.08)" : "rgba(175,141,84,0.08)"} 0%, transparent 70%)`,
        pointerEvents: "none",
        transition: "background 0.3s",
      }} />

      {/* Dog image / avatar — large */}
      {image ? (
        <img src={image} alt={name} style={{
          width: 120, height: 120, borderRadius: 24, objectFit: "cover",
          border: `4px solid ${isUrgent ? "rgba(239,68,68,0.5)" : "rgba(175,141,84,0.6)"}`,
          flexShrink: 0, position: "relative", zIndex: 1,
          transition: "border-color 0.3s",
        }} />
      ) : (
        <div style={{
          width: 120, height: 120, borderRadius: 24, flexShrink: 0,
          background: isUrgent ? "rgba(239,68,68,0.2)" : "rgba(175,141,84,0.25)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 48, fontWeight: 900,
          color: isUrgent ? "#EF4444" : "#AF8D54",
          position: "relative", zIndex: 1,
          border: `4px solid ${isUrgent ? "rgba(239,68,68,0.4)" : "rgba(175,141,84,0.4)"}`,
          transition: "background 0.3s, color 0.3s, border-color 0.3s",
        }}>
          {name[0]}
        </div>
      )}

      {/* Info — large text for TV visibility */}
      <div style={{ flex: 1, minWidth: 0, position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 8 }}>
          <span style={{
            fontSize: 14, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase",
            color: isUrgent ? "#EF4444" : "#AF8D54",
            background: isUrgent ? "rgba(239,68,68,0.15)" : "rgba(175,141,84,0.15)",
            padding: "5px 14px", borderRadius: 8,
            animation: isUrgent ? "urgentShake 0.5s ease-in-out infinite" : "none",
            transition: "color 0.3s, background 0.3s",
          }}>
            {isUrgent ? "Leaving Now" : "Checking Out"}
          </span>
          {/* TV-003: Size badge on hero card */}
          <span style={{
            fontSize: 13, fontWeight: 800, letterSpacing: "0.08em",
            color: theme.accent,
            background: `rgba(${theme.accentRgb},0.15)`,
            padding: "5px 14px", borderRadius: 8,
          }}>
            {theme.badge === "LG" ? "LARGE" : "SMALL"}
          </span>
          {roomInfo.number && (
            <span style={{
              fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.5)",
              background: "rgba(255,255,255,0.06)", padding: "5px 14px", borderRadius: 8,
            }}>
              {roomInfo.label} {roomInfo.number}
            </span>
          )}
        </div>
        <div style={{
          fontSize: 42, fontWeight: 900, color: "#fff",
          lineHeight: 1.1, marginBottom: 6,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          letterSpacing: "-0.01em",
        }}>
          {name}
        </div>
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          {breed && <span style={{ fontSize: 17, color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>{breed}</span>}
          {ownerLast && (
            <span style={{ fontSize: 17, color: "rgba(175,141,84,0.8)", fontWeight: 700 }}>
              Owner: {ownerLast}
            </span>
          )}
          {dog?.fields?.weight && (
            <span style={{ fontSize: 15, color: "rgba(255,255,255,0.35)", fontWeight: 600 }}>
              {dog.fields.weight} lbs
            </span>
          )}
        </div>
      </div>

      {/* Large Countdown */}
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
        position: "relative", zIndex: 1,
        animation: isUrgent ? "heroCountdownPulse 1s ease-in-out infinite" : "none",
      }}>
        <CountdownCircle remaining={entry.remaining} total={60} size={100} strokeWidth={6} />
        <span style={{
          fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.35)",
          textTransform: "uppercase", letterSpacing: "0.08em",
        }}>
          seconds
        </span>
      </div>
    </div>
  );
}

/* ── TV-006: Queue indicator for waiting checkouts ───────────────────── */
function QueueCard({ entry, dogs, index }) {
  const dog = dogs.find(d => d.gingrId === Number(entry.animalGingrId) || d.id === `g${entry.animalGingrId}`);
  const name = dog?.fields?.name || entry.animalName || "Unknown";
  const image = dog?._image;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 14,
      padding: "12px 18px",
      background: "rgba(255,255,255,0.04)",
      borderRadius: 14,
      border: "1px solid rgba(175,141,84,0.2)",
      animation: `queueSlideIn 0.3s ease-out ${index * 0.1}s both`,
    }}>
      <div style={{
        fontSize: 12, fontWeight: 800, color: "rgba(175,141,84,0.5)",
        width: 22, textAlign: "center",
      }}>
        {index + 2}
      </div>
      {image ? (
        <img src={image} alt={name} style={{
          width: 40, height: 40, borderRadius: 10, objectFit: "cover",
          border: "2px solid rgba(175,141,84,0.3)",
        }} />
      ) : (
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: "rgba(175,141,84,0.15)", display: "flex",
          alignItems: "center", justifyContent: "center",
          fontSize: 16, fontWeight: 800, color: "#AF8D54",
        }}>
          {name[0]}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{name}</div>
        <div style={{ fontSize: 11, color: "rgba(175,141,84,0.6)", fontWeight: 600 }}>Up next</div>
      </div>
      <CountdownCircle remaining={entry.remaining} total={60} size={36} strokeWidth={3} />
    </div>
  );
}

/* ── Main Component ───────────────────────────────────────────────────── */
function CheckoutTVPage({ data, nav, profile }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const reservations = data.reservations || [];
  const dogs = data.dogs || [];
  const clients = data.clients || [];

  /* ── TV-003: Fetch animal icons from Supabase ─────────────────────── */
  const locationId = profile?.location_id;
  const [animalIcons, setAnimalIcons] = useState({}); // keyed by animal_gingr_id

  useEffect(() => {
    if (!locationId) return;
    let cancelled = false;

    const fetchIcons = async () => {
      try {
        const { data: icons, error } = await supabase
          .from("gingr_animal_icons")
          .select("animal_gingr_id,icon_url,icon_type,is_primary")
          .eq("location_id", locationId);

        if (cancelled || error) return;

        // Build lookup: prefer is_primary, then photo type, then any
        const map = {};
        for (const icon of (icons || [])) {
          const existing = map[icon.animal_gingr_id];
          if (!existing || icon.is_primary || (!existing.is_primary && icon.icon_type === "photo")) {
            map[icon.animal_gingr_id] = icon;
          }
        }
        setAnimalIcons(map);
      } catch (e) {
        // Silently ignore — icons are a progressive enhancement
      }
    };

    fetchIcons();
    // Refresh icons every 5 minutes
    const interval = setInterval(fetchIcons, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [locationId]);

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

  const daycareDogs = uniqueDogs.filter(r => DAYCARE_TYPES.has(r.type));
  const boardingDogs = uniqueDogs.filter(r => BOARDING_TYPES.has(r.type));

  /* ── TV-003: Split daycare dogs into large and small groups ─────────── */
  const { largeDaycare, smallDaycare } = useMemo(() => {
    const large = [];
    const small = [];
    for (const res of daycareDogs) {
      const dog = dogs.find(d => d.id === res.dogId);
      const size = getDogSize(dog);
      if (size === "small") {
        small.push(res);
      } else {
        large.push(res);
      }
    }
    return { largeDaycare: large, smallDaycare: small };
  }, [daycareDogs, dogs]);

  /* ── TV-002: Checkout detection polling ─────────────────────────────── */
  const prevCheckedInRef = useRef(null);     // Set of gingr_ids from last poll
  const [checkingOut, setCheckingOut] = useState([]); // { id, animalGingrId, animalName, ownerLastName, room, remaining, fading }
  const checkingOutRef = useRef(checkingOut);
  checkingOutRef.current = checkingOut;

  // Poll Supabase every 3 seconds for currently checked-in reservations
  useEffect(() => {
    if (!locationId) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const { data: rows, error } = await supabase
          .from("gingr_reservations")
          .select("gingr_id,animal_gingr_id,animal_name,owner_last_name,reservation_type_name,check_out_date")
          .eq("location_id", locationId)
          .not("check_in_date", "is", null)
          .is("check_out_date", null)
          .is("cancelled_date", null);

        if (cancelled || error) return;

        // Only include types we care about on the TV
        const relevant = (rows || []).filter(r => {
          const t = classifyReservationType(r.reservation_type_name);
          return ALL_TYPES.has(t);
        });

        const currentIds = new Set(relevant.map(r => r.gingr_id));
        const prev = prevCheckedInRef.current;

        if (prev !== null) {
          // Find IDs that were in prev but not in current = checked out
          const departed = [];
          for (const id of prev) {
            if (!currentIds.has(id)) {
              // Find info about this dog from the previous data or current reservations
              const resInfo = reservations.find(r => r.gingrId === id)
                || (rows || []).find(r => r.gingr_id === id);
              departed.push({
                id,
                animalGingrId: resInfo?.animal_gingr_id || resInfo?.dogId?.replace("g", "") || "",
                animalName: resInfo?.animal_name || resInfo?._animalName || "Unknown",
                ownerLastName: resInfo?.owner_last_name || resInfo?._ownerName?.split(" ").pop() || "",
                room: resInfo?.room || "",
                remaining: 60,
                fading: false,
              });
            }
          }

          if (departed.length > 0) {
            setCheckingOut(prev => {
              const existingIds = new Set(prev.map(e => e.id));
              const newEntries = departed.filter(d => !existingIds.has(d.id));
              return [...prev, ...newEntries];
            });
          }
        }

        prevCheckedInRef.current = currentIds;
      } catch (e) {
        // Silently ignore polling errors
      }
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [locationId, reservations]);

  // Countdown timer — tick every second
  useEffect(() => {
    if (checkingOut.length === 0) return;
    const id = setInterval(() => {
      setCheckingOut(prev => {
        const updated = prev.map(e => {
          if (e.fading) return e;
          const next = e.remaining - 1;
          if (next <= 0) return { ...e, remaining: 0, fading: true };
          return { ...e, remaining: next };
        });
        return updated;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [checkingOut.length > 0]);

  // Clean up faded entries after animation completes
  useEffect(() => {
    const fading = checkingOut.filter(e => e.fading);
    if (fading.length === 0) return;
    const timeout = setTimeout(() => {
      setCheckingOut(prev => prev.filter(e => !e.fading));
    }, 1200);
    return () => clearTimeout(timeout);
  }, [checkingOut]);

  /* ── TV-006: Compute active (hero) and queued checkouts ────────────── */
  const activeCheckout = checkingOut.find(e => !e.fading) || checkingOut.find(e => e.fading) || null;
  const fadingCheckouts = activeCheckout ? checkingOut.filter(e => e.fading && e !== activeCheckout) : [];
  const queuedCheckouts = checkingOut.filter(e => !e.fading && e !== activeCheckout);

  // Set of dogIds currently checking out — used to keep them in the grid visually
  const checkingOutDogIds = useMemo(() => {
    const ids = new Set();
    for (const e of checkingOut) {
      if (e.animalGingrId) {
        ids.add(`g${e.animalGingrId}`);
      }
    }
    return ids;
  }, [checkingOut]);

  const timeStr = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });
  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  /* ── TV-003 + TV-004: DogCard with size differentiation + fixed room parsing */
  const DogCard = ({ res, sizeGroup }) => {
    const dog = dogs.find(d => d.id === res.dogId);
    const client = clients.find(c => c.id === res.clientId);
    const name = dog?.fields?.name || res._animalName || "Unknown";
    const breed = dog?.fields?.breed || "";
    const ownerLast = client?.fields?.last_name || res._ownerName?.split(" ").pop() || "";
    const roomInfo = parseRoom(res.room);
    const roomDisplay = roomInfo.number
      ? `${roomInfo.label} ${roomInfo.number}`
      : roomInfo.label || "";

    // TV-003: Get dog photo from animal icons or fall back to _image
    const iconData = animalIcons[dog?.gingrId];
    const image = iconData?.icon_url || dog?._image;
    const size = sizeGroup || getDogSize(dog);
    const theme = SIZE_THEME[size] || SIZE_THEME.large;

    // TV-006: Dim dogs that are being checked out (they appear in hero card above)
    const isCheckingOut = checkingOutDogIds.has(res.dogId);

    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", padding: "16px 12px",
        background: isCheckingOut ? "rgba(175,141,84,0.08)" : "rgba(255,255,255,0.06)",
        borderRadius: 16,
        border: isCheckingOut
          ? "1px solid rgba(175,141,84,0.2)"
          : `2px solid rgba(${theme.accentRgb},0.25)`,
        minWidth: 140, transition: "transform 0.2s, opacity 0.5s, background 0.3s",
        opacity: isCheckingOut ? 0.35 : 1,
        position: "relative",
      }}>
        {/* TV-003: Size badge — top-right corner */}
        <div style={{
          position: "absolute", top: 8, right: 8,
        }}>
          <SizeBadge size={size} />
        </div>

        {/* Dog photo/icon from gingr_animal_icons or fallback */}
        {image ? (
          <img src={image} alt={name} style={{
            width: 64, height: 64, borderRadius: 14, objectFit: "cover",
            border: `2px solid rgba(${theme.accentRgb},0.4)`,
            marginBottom: 8,
          }} />
        ) : (
          <div style={{
            width: 64, height: 64, borderRadius: 14,
            background: `rgba(${theme.accentRgb},0.15)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 24, fontWeight: 800,
            color: theme.accent,
            marginBottom: 8,
            border: `2px solid rgba(${theme.accentRgb},0.3)`,
          }}>
            {name[0]}
          </div>
        )}
        <div style={{ fontSize: 16, fontWeight: 800, color: "#fff", textAlign: "center", lineHeight: 1.2 }}>{name}</div>
        {breed && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2, textAlign: "center" }}>{breed}</div>}
        <div style={{ fontSize: 11, color: `rgba(${theme.accentRgb},0.8)`, marginTop: 4, fontWeight: 600 }}>{ownerLast}</div>
        {roomDisplay && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{roomDisplay}</div>}
      </div>
    );
  };

  /* ── TV-003: Enhanced Section Label with dog count and colored accent ── */
  const SectionLabel = ({ label, count, color, subtitle }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, marginTop: 28 }}>
      <div style={{ width: 6, height: 32, borderRadius: 3, background: color }} />
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", letterSpacing: "0.02em" }}>{label}</div>
          <div style={{
            fontSize: 18, fontWeight: 800, color, background: `${color}22`,
            padding: "2px 12px", borderRadius: 8,
          }}>
            {count}
          </div>
        </div>
        {subtitle && (
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", fontWeight: 600, marginTop: 2 }}>{subtitle}</div>
        )}
      </div>
    </div>
  );

  const hasCheckouts = checkingOut.length > 0;

  return (
    <div style={{
      minHeight: "100vh", background: "linear-gradient(180deg, #001A33 0%, #00112A 50%, #000A1A 100%)",
      padding: "32px 40px", fontFamily: "'GT Eesti', -apple-system, sans-serif", overflow: "auto",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 900, color: "#fff", letterSpacing: "-0.02em" }}>K9 Cherry Hill</div>
          <div style={{ fontSize: 13, color: "rgba(175,141,84,0.7)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 2 }}>Checkout Board</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 36, fontWeight: 900, color: "#fff", fontVariantNumeric: "tabular-nums" }}>{timeStr}</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", fontWeight: 500 }}>{dateStr}</div>
        </div>
      </div>

      {/* Stats bar — TV-003: Updated with large/small daycare counts */}
      <div style={{ display: "flex", gap: 24, padding: "14px 0", borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)", marginBottom: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>Total: <span style={{ fontWeight: 800, color: "#fff" }}>{uniqueDogs.length}</span></div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>
          Large Daycare: <span style={{ fontWeight: 800, color: SIZE_THEME.large.accent }}>{largeDaycare.length}</span>
        </div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>
          Small Daycare: <span style={{ fontWeight: 800, color: SIZE_THEME.small.accent }}>{smallDaycare.length}</span>
        </div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>Boarding: <span style={{ fontWeight: 800, color: "#AF8D54" }}>{boardingDogs.length}</span></div>
        {hasCheckouts && (
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", marginLeft: "auto" }}>
            Checking out: <span style={{ fontWeight: 800, color: "#EF4444" }}>{checkingOut.filter(e => !e.fading).length}</span>
          </div>
        )}
      </div>

      {/* TV-006: Hero checkout card — enlarged, prominent, above the grid */}
      {hasCheckouts && (
        <div style={{ marginBottom: 20 }}>
          {/* Active hero card */}
          {activeCheckout && (
            <HeroCheckoutCard
              key={activeCheckout.id}
              entry={activeCheckout}
              dogs={dogs}
              clients={clients}
              fading={activeCheckout.fading}
              animalIcons={animalIcons}
            />
          )}

          {/* Fading out cards (previous heroes completing their fade animation) */}
          {fadingCheckouts.map(entry => (
            <div key={entry.id} style={{ marginTop: 8 }}>
              <HeroCheckoutCard
                entry={entry}
                dogs={dogs}
                clients={clients}
                fading={true}
                animalIcons={animalIcons}
              />
            </div>
          ))}

          {/* Queued checkouts — compact cards showing who's next */}
          {queuedCheckouts.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.3)",
                textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8,
                paddingLeft: 4,
              }}>
                Up Next ({queuedCheckouts.length} waiting)
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {queuedCheckouts.map((entry, i) => (
                  <QueueCard
                    key={entry.id}
                    entry={entry}
                    dogs={dogs}
                    index={i}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TV-003: Large Dog Daycare section */}
      {largeDaycare.length > 0 && (
        <div>
          <SectionLabel
            label="Large Dog Daycare"
            count={largeDaycare.length}
            color={SIZE_THEME.large.accent}
            subtitle={`Dogs ${SIZE_THRESHOLD}+ lbs`}
          />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
            {largeDaycare.map(r => <DogCard key={r.id} res={r} sizeGroup="large" />)}
          </div>
        </div>
      )}

      {/* TV-003: Small Dog Daycare section */}
      {smallDaycare.length > 0 && (
        <div>
          <SectionLabel
            label="Small Dog Daycare"
            count={smallDaycare.length}
            color={SIZE_THEME.small.accent}
            subtitle={`Dogs under ${SIZE_THRESHOLD} lbs`}
          />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
            {smallDaycare.map(r => <DogCard key={r.id} res={r} sizeGroup="small" />)}
          </div>
        </div>
      )}

      {/* Boarding section */}
      {boardingDogs.length > 0 && (
        <div>
          <SectionLabel label="Boarding" count={boardingDogs.length} color="#AF8D54" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
            {boardingDogs.map(r => <DogCard key={r.id} res={r} />)}
          </div>
        </div>
      )}

      {uniqueDogs.length === 0 && checkingOut.length === 0 && (
        <div style={{ textAlign: "center", padding: "80px 0" }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "rgba(255,255,255,0.3)" }}>No dogs checked in today</div>
        </div>
      )}

      {/* Footer */}
      <div style={{ textAlign: "center", marginTop: 40, padding: "16px 0", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.15)" }}>K9 Operations Lite · Auto-refreshes in real-time</div>
      </div>

      {/* Floating Exit Button — subtle, top-left corner */}
      <button
        onClick={() => nav("operations")}
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

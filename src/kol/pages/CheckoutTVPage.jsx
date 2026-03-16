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
import { C, todayStr } from "../../shared/theme";
import K9LoadingAnimation from "../../shared/K9LoadingAnimation";

/* ── CSS Keyframes (injected once) ────────────────────────────────────── */
const STYLE_ID = "checkout-tv-styles";
if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
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

/* ── Private Play detection helper ─────────────────────────────────────── *
 * TV-018: Enhanced to also check room/reservation type for private play rooms.
 * Boarding dogs in private play rooms are classified as private play.
 * ──────────────────────────────────────────────────────────────────────── */
function hasPrivatePlay(res) {
  // Check services for "private play"
  const svcs = res._services;
  if (svcs) {
    const arr = Array.isArray(svcs) ? svcs : [];
    const hasPPService = arr.some(s => {
      const name = typeof s === "string" ? s : (s && s.name ? s.name : "");
      return name.toLowerCase().includes("private play");
    });
    if (hasPPService) return true;
  }
  // Check room name for private play room
  const room = (res.room || "").toLowerCase();
  if (room.includes("private play")) return true;
  // Check reservation type name
  const typeName = (res._resTypeName || "").toLowerCase();
  if (typeName.includes("private play")) return true;
  return false;
}

/* ── TV-003: Size theme colors ────────────────────────────────────────── */
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
];

const AUTO_CYCLE_INTERVAL = 30000; // 30 seconds

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

/* ── TV-006 + TV-008b + TV-015: Hero Checkout Card — compact mode for multi-notice ── */
function HeroCheckoutCard({ entry, dogs: allDogs, clients, fading, animalIcons, compact }) {
  const entryDogs = entry.dogs || [entry];
  const resolvedDogs = entryDogs.map(d => {
    const dog = allDogs.find(dd => dd.gingrId === Number(d.animalGingrId) || dd.id === `g${d.animalGingrId}`);
    const iconData = animalIcons[dog?.gingrId];
    return {
      ...d, dog,
      name: dog?.fields?.name || d.animalName || "Unknown",
      breed: dog?.fields?.breed || "",
      image: iconData?.icon_url || dog?._image,
      size: getDogSize(dog),
    };
  });
  const ownerLast = entry.ownerLastName || "";
  const isUrgent = entry.remaining <= 10;
  const allNames = resolvedDogs.map(d => d.name).join(" & ");
  const firstDog = resolvedDogs[0];
  const theme = SIZE_THEME[firstDog.size];

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
            <img key={rd.id || i} src={rd.image} alt={rd.name} style={{
              width: imgSize, height: imgSize,
              borderRadius: compact ? 16 : 24, objectFit: "cover",
              border: `${compact ? 3 : 4}px solid ${isUrgent ? "rgba(239,68,68,0.5)" : "rgba(132,204,22,0.6)"}`,
            }} />
          ) : (
            <div key={rd.id || i} style={{
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
            {theme.badge === "LG" ? "LARGE" : "SMALL"}
          </span>
        </div>
        <div style={{
          fontSize: nameSize, fontWeight: 900, color: "#fff",
          lineHeight: 1.1, marginBottom: compact ? 2 : 6,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          letterSpacing: "-0.01em",
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
          </div>
        )}
        {compact && ownerLast && (
          <span style={{ fontSize: 13, color: "rgba(132,204,22,0.7)", fontWeight: 600 }}>
            {firstDog.breed ? `${firstDog.breed} · ` : ""}Owner: {ownerLast}
          </span>
        )}
      </div>

      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: compact ? 4 : 8,
        position: "relative", zIndex: 1,
        animation: isUrgent ? "heroCountdownPulse 1s ease-in-out infinite" : "none",
      }}>
        <CountdownCircle remaining={entry.remaining} total={60} size={countdownSize} strokeWidth={compact ? 4 : 6} />
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
function HeroCheckInCard({ entry, dogs: allDogs, animalIcons, fading, compact }) {
  const entryDogs = entry.dogs || [entry];
  const resolvedDogs = entryDogs.map(d => {
    const dog = allDogs.find(dd => dd.gingrId === Number(d.animalGingrId) || dd.id === `g${d.animalGingrId}`);
    const iconData = animalIcons[dog?.gingrId];
    return {
      ...d, dog,
      name: dog?.fields?.name || d.animalName || "Unknown",
      breed: dog?.fields?.breed || "",
      image: iconData?.icon_url || dog?._image,
      size: getDogSize(dog),
    };
  });
  const ownerLast = entry.ownerLastName || "";
  const allNames = resolvedDogs.map(d => d.name).join(" & ");
  const firstDog = resolvedDogs[0];
  const theme = SIZE_THEME[firstDog.size];

  // TV-018: Boarding dogs now labeled by their play category, not "BOARDING"
  const resType = (entry.dogs?.[0]?.resType || entry.resType || "");
  const entryHasPP = (entry.dogs || [entry]).some(d => {
    const tempRes = { _services: d._services || [], room: d.room || "", _resTypeName: "", type: d.resType || "" };
    return hasPrivatePlay(tempRes) || d.resType === "dayboarding";
  });
  const groupLabel = (resType === "dayboarding" || (resType === "boarding" && entryHasPP)) ? "PRIVATE PLAY"
    : firstDog.size === "small" ? "SMALL DAYCARE" : "LARGE DAYCARE";
  const groupColor = (resType === "dayboarding" || (resType === "boarding" && entryHasPP)) ? "#EF4444"
    : theme?.accent || "#84CC16";

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
            <img key={rd.id || i} src={rd.image} alt={rd.name} style={{
              width: imgSize, height: imgSize,
              borderRadius: compact ? 16 : 24, objectFit: "cover",
              border: `${compact ? 3 : 4}px solid rgba(56,189,248,0.6)`,
            }} />
          ) : (
            <div key={rd.id || i} style={{
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
          letterSpacing: "-0.01em",
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
          </div>
        )}
        {compact && ownerLast && (
          <span style={{ fontSize: 13, color: "rgba(56,189,248,0.7)", fontWeight: 600 }}>
            {firstDog.breed ? `${firstDog.breed} · ` : ""}Owner: {ownerLast}
          </span>
        )}
      </div>

      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: compact ? 4 : 8,
        position: "relative", zIndex: 1,
      }}>
        <CountdownCircle remaining={entry.remaining} total={60} size={countdownSize} strokeWidth={compact ? 4 : 6} accentColor="#38BDF8" />
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
function TVNavButton({ view, isActive, count, onClick }) {
  const [hovered, setHovered] = useState(false);
  const { label, color, colorRgb } = view;

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
        height: 64, minWidth: 160, padding: "0 28px",
        borderRadius: 16,
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
        fontSize: 18, fontWeight: isActive ? 900 : 700,
        color: isActive ? color : hovered ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.55)",
        letterSpacing: isActive ? "0.02em" : "0",
        transition: "all 0.25s ease",
        position: "relative", zIndex: 1,
        whiteSpace: "nowrap",
      }}>
        {label}
      </span>
      {/* Count badge */}
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontSize: 15, fontWeight: 900,
        color: isActive ? color : "rgba(255,255,255,0.4)",
        background: isActive ? `rgba(${colorRgb},0.2)` : "rgba(255,255,255,0.06)",
        border: `1.5px solid ${isActive ? `rgba(${colorRgb},0.4)` : "rgba(255,255,255,0.08)"}`,
        borderRadius: 10, padding: "2px 10px", minWidth: 32,
        transition: "all 0.25s ease",
        position: "relative", zIndex: 1,
        fontVariantNumeric: "tabular-nums",
      }}>
        {count}
      </span>
    </button>
  );
}

/* ── Main Component ───────────────────────────────────────────────────── */
function CheckoutTVPage({ data, nav, profile }) {
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
  return <CheckoutTVContent data={data} nav={nav} profile={profile} />;
}

function CheckoutTVContent({ data, nav, profile }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  /* ── TV-005: Navigation state ──────────────────────────────────────── */
  const [activeView, setActiveView] = useState("all");
  const [autoCycle, setAutoCycle] = useState(false);
  const [gridKey, setGridKey] = useState(0); // triggers fade animation on view change

  // TV-005: Auto-cycle through views
  useEffect(() => {
    if (!autoCycle) return;
    const interval = setInterval(() => {
      setActiveView(prev => {
        const idx = NAV_VIEWS.findIndex(v => v.id === prev);
        const next = (idx + 1) % NAV_VIEWS.length;
        return NAV_VIEWS[next].id;
      });
      setGridKey(k => k + 1);
    }, AUTO_CYCLE_INTERVAL);
    return () => clearInterval(interval);
  }, [autoCycle]);

  const handleViewChange = useCallback((viewId) => {
    setActiveView(viewId);
    setGridKey(k => k + 1);
    // Reset auto-cycle timer on manual interaction
    if (autoCycle) {
      setAutoCycle(false);
      setTimeout(() => setAutoCycle(true), 0);
    }
  }, [autoCycle]);

  const baseReservations = data.reservations || [];
  const baseDogs = data.dogs || [];
  const clients = data.clients || [];

  /* ── TV-010 + TV-012: Direct Gingr back_of_house polling ────────────
   * Single source of truth for ALL active dogs (boarding + daycare).
   * Polls every 10s, compares previous → current state, and fires
   * TV notices (check-in / check-out hero cards) on transitions.
   * Also provides daycare dogs for the grid (Supabase doesn't sync them).
   * ──────────────────────────────────────────────────────────────────── */
  const [gingrActiveDogs, setGingrActiveDogs] = useState([]);   // all checked-in dogs from BOH
  const [gingrDaycareDogs, setGingrDaycareDogs] = useState([]); // daycare subset for grid merge
  const [gingrBoardingDogs, setGingrBoardingDogs] = useState([]); // boarding dogs from Gingr reservations API
  const prevBohIdsRef = useRef(null);     // Map<id, dogRecord> from previous poll
  const bohPollCountRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const GINGR_KEY = "a0fec5e66b3c3be8b6085b2708b3806e";
    const BOH_URL = `https://k9cherryhill.gingrapp.com/api/v1/back_of_house?key=${GINGR_KEY}&location_id=1&full_day=true&include_daycare=true`;

    const classifyBohType = (typeStr) => {
      const t = (typeStr || "").toLowerCase();
      if (t.includes("evaluation")) return "evaluation";
      if (t.includes("day boarding") && !t.includes("daycare")) return "dayboarding";
      if (t.includes("daycare")) return "daycare";
      if (t.includes("boarding")) return "boarding";
      return "boarding";
    };

    const isDaycareType = (typeStr) => {
      const t = (typeStr || "").toLowerCase();
      return t.includes("daycare") || t.includes("day boarding") || t.includes("evaluation");
    };

    const fetchBoh = async () => {
      try {
        const resp = await fetch(BOH_URL);
        if (!resp.ok || cancelled) return;
        const json = await resp.json();
        const d = json.data || {};
        // checking_out = dogs that ARE checked in (here now)
        const active = d.checking_out || [];

        // Build current state map: id → dog record
        const currentMap = new Map();
        for (const dog of active) currentMap.set(dog.id, dog);

        // Detect transitions (skip first poll — no previous state)
        const prev = prevBohIdsRef.current;
        if (prev !== null && !cancelled) {
          // Arrivals: in current but not in prev
          const arrivals = [];
          for (const [id, dog] of currentMap) {
            if (!prev.has(id)) {
              arrivals.push({
                id: Number(id),
                animalGingrId: dog.animal_id || "",
                animalName: (dog.a_first || "Unknown").trim(),
                ownerLastName: (dog.o_last || "").trim(),
                room: dog.run_name || "",
                resType: classifyBohType(dog.type),
              });
            }
          }

          // Departures: in prev but not in current
          const departed = [];
          for (const [id, dog] of prev) {
            if (!currentMap.has(id)) {
              departed.push({
                id: Number(id),
                animalGingrId: dog.animal_id || "",
                animalName: (dog.a_first || "Unknown").trim(),
                ownerLastName: (dog.o_last || "").trim(),
                room: dog.run_name || "",
                resType: classifyBohType(dog.type),
              });
            }
          }

          // Fire check-in TV notices (TV-013: timestamp-based, persistent)
          if (arrivals.length > 0) {
            const byOwner = {};
            for (const a of arrivals) {
              const key = a.ownerLastName || a.id;
              if (!byOwner[key]) byOwner[key] = [];
              byOwner[key].push(a);
            }
            const firedAt = Date.now();
            const grouped = Object.values(byOwner).map(group => ({
              id: group.map(a => a.id).join('+'),
              dogs: group,
              ownerLastName: group[0].ownerLastName,
              firedAt,
              durationMs: 60_000,
            }));
            setCheckingInRaw(p => {
              const existing = new Set(p.map(e => e.id));
              return [...p, ...grouped.filter(g => !existing.has(g.id))];
            });
          }

          // Fire check-out TV notices (TV-013: timestamp-based, persistent)
          if (departed.length > 0) {
            const byOwner = {};
            for (const d of departed) {
              const key = d.ownerLastName || d.id;
              if (!byOwner[key]) byOwner[key] = [];
              byOwner[key].push(d);
            }
            const firedAt = Date.now();
            const grouped = Object.values(byOwner).map(group => ({
              id: group.map(d => d.id).join('+'),
              dogs: group,
              ownerLastName: group[0].ownerLastName,
              firedAt,
              durationMs: 60_000,
            }));
            setCheckingOutRaw(p => {
              const existing = new Set(p.map(e => e.id));
              return [...p, ...grouped.filter(g => !existing.has(g.id))];
            });
          }
        }

        // Store current state for next comparison
        prevBohIdsRef.current = currentMap;
        bohPollCountRef.current += 1;

        // Update display state
        if (!cancelled) {
          setGingrActiveDogs(active);
          setGingrDaycareDogs(active.filter(dog => isDaycareType(dog.type)));
        }
      } catch (e) {
        // Silently ignore — Supabase boarding data still works as fallback
      }
    };

    fetchBoh();
    const interval = setInterval(fetchBoh, 10000); // 10s poll
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  /* ── TV-014: Direct Gingr reservations poll for ALL checked-in dogs ───
   * Polls the Gingr reservations API directly for ALL checked-in
   * reservations (boarding + daycare + evaluation + day boarding).
   * This is the SINGLE authoritative source for who is in-house.
   *
   * Returns boarding dogs in gingrBoardingDogs (used by merge as primary
   * boarding source) and daycare dogs in gingrDaycareFromRes (used to
   * replace stale Supabase/BOH daycare data).
   * ──────────────────────────────────────────────────────────────────── */
  const [gingrDaycareFromRes, setGingrDaycareFromRes] = useState([]);
  useEffect(() => {
    let cancelled = false;
    const GINGR_KEY = "a0fec5e66b3c3be8b6085b2708b3806e";
    const GINGR_RES_URL = "https://k9cherryhill.gingrapp.com/api/v1/reservations";

    const classifyType = (typeStr) => {
      const t = (typeStr || "").toLowerCase();
      if (t.includes("evaluation")) return "evaluation";
      if (t.includes("day boarding") && !t.includes("daycare")) return "dayboarding";
      if (t.includes("daycare")) return "daycare";
      if (t.includes("boarding")) return "boarding";
      return "boarding";
    };

    const fetchAllCheckedIn = async () => {
      try {
        const resp = await fetch(GINGR_RES_URL, {
          method: "POST",
          body: new URLSearchParams({ key: GINGR_KEY, checked_in: "true" }),
        });
        if (!resp.ok || cancelled) return;
        const json = await resp.json();
        const resData = json.data || {};

        // resData is an object keyed by reservation_id
        const allDogs = Object.values(resData).map(r => ({
          reservation_id: String(r.reservation_id),
          animal_id: String(r.animal?.id || ""),
          animal_name: (r.animal?.name || "Unknown").trim(),
          breed: r.animal?.breed || "",
          owner_id: String(r.owner?.id || ""),
          owner_first: (r.owner?.first_name || "").trim(),
          owner_last: (r.owner?.last_name || "").trim(),
          start_date: r.start_date || "",
          end_date: r.end_date || "",
          check_in_date: r.check_in_date || "",
          check_out_date: r.check_out_date || null,
          run_name: r.run?.name || "",
          services: r.services || [],
          resType: classifyType(r.reservation_type?.type),
        }));

        const boarding = allDogs.filter(d => d.resType === "boarding");
        const daycare = allDogs.filter(d => d.resType !== "boarding");

        if (!cancelled) {
          console.log('[TV-014] Gingr poll:', allDogs.length, 'total,', boarding.length, 'boarding,', daycare.length, 'daycare/eval/db');
          setGingrBoardingDogs(boarding);
          setGingrDaycareFromRes(daycare);
        }
      } catch (e) {
        console.error('[TV-014] Gingr reservations poll error:', e.message || e);
      }
    };

    fetchAllCheckedIn();
    const interval = setInterval(fetchAllCheckedIn, 60000); // 60s poll
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  /* ── TV-POLL: Supabase reconciliation sync (every 60s) ──────────────
   * Calls the gingr-sync edge function in tv-poll mode to reconcile
   * stale Supabase records (e.g. dogs that checked out but Supabase
   * didn't update due to sync lag). Runs alongside BOH polling.
   * Uses the existing supabase client (imported at top) so it picks
   * up VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY automatically.
   * ──────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    const TV_POLL_INTERVAL = 60_000; // 60 seconds

    const triggerTvPoll = async () => {
      if (cancelled) return;
      try {
        await supabase.functions.invoke("gingr-sync", {
          body: {
            location_id: "8ea382b0-63f7-44ac-b6f8-83243c03d946",
            sync_type: "tv-poll",
          },
        });
      } catch (e) {
        // Silently ignore — sync will retry on next interval
      }
    };

    // Initial sync after 5s delay (let BOH fetch settle first)
    const initTimer = setTimeout(triggerTvPoll, 5000);
    const interval = setInterval(triggerTvPoll, TV_POLL_INTERVAL);
    return () => { cancelled = true; clearTimeout(initTimer); clearInterval(interval); };
  }, []);

  /* ── Merge BOH live data + Gingr reservations with Supabase ─────────── *
   * This is the SINGLE source-of-truth computation for all checked-in dogs.
   * It combines:
   *   1. Supabase boarding reservations (fallback, may be stale)
   *   2. BOH daycare/eval/dayboarding dogs (live from Gingr back_of_house)
   *   3. Gingr reservations API boarding dogs (TV-014 — primary boarding source)
   *
   * TV-014: gingrBoardingDogs (from the reservations API with checked_in=true)
   * is now the PRIMARY source for boarding dogs. It returns ALL checked-in
   * boarding reservations directly from Gingr, unlike BOH which only has
   * dogs in checking_out (going home today). This ensures multi-night boarders
   * and newly checked-in dogs always appear on the TV.
   * ──────────────────────────────────────────────────────────────────── */
  const { reservations, dogs } = useMemo(() => {
    const today = todayStr();
    const hasGingrRes = gingrBoardingDogs.length > 0 || gingrDaycareFromRes.length > 0;
    console.log('[TV-MERGE] gingrBoarding:', gingrBoardingDogs.length, 'gingrDaycare:', gingrDaycareFromRes.length, 'baseRes:', baseReservations.length);

    // Build the complete set of Gingr-confirmed animal IDs
    const gingrAllAnimalIds = new Set([
      ...gingrBoardingDogs.map(d => d.animal_id),
      ...gingrDaycareFromRes.map(d => d.animal_id),
    ]);

    // ── Step 1: Filter Supabase reservations ────────────────────────
    // When Gingr reservations API is available, it's the authoritative
    // source for who's checked in. Drop Supabase checked-in records whose
    // animal isn't confirmed by Gingr. Keep non-checked-in records (history).
    const filteredBaseRes = baseReservations.filter(r => {
      if (r.status !== "checked-in") return true;
      if (r._fromGingrApi) return true;
      if (!hasGingrRes) return true; // Gingr API not loaded yet, keep everything
      const animalId = r.dogId?.startsWith("g") ? r.dogId.slice(1) : null;
      return animalId && gingrAllAnimalIds.has(animalId);
    });

    // ── Step 2: Build synthetic reservations from Gingr API ───────────
    // Build reservation objects for boarding dogs from Gingr API
    const gingrBoardingRes = gingrBoardingDogs.map(gd => ({
      id: `gingr-res-${gd.reservation_id}`,
      gingrId: Number(gd.reservation_id),
      dogId: `g${gd.animal_id}`,
      clientId: `g${gd.owner_id}`,
      type: "boarding",
      status: "checked-in",
      _animalName: gd.animal_name,
      _ownerName: gd.owner_last,
      _services: gd.services || [],
      room: gd.run_name || "",
      checkIn: gd.start_date ? gd.start_date.slice(0, 10) : today,
      checkOut: gd.end_date ? gd.end_date.slice(0, 10) : today,
      _fromGingrApi: true,
    }));

    // Build reservation objects for daycare/eval/dayboarding dogs from Gingr API
    const gingrDaycareRes = gingrDaycareFromRes.map(gd => ({
      id: `gingr-res-${gd.reservation_id}`,
      gingrId: Number(gd.reservation_id),
      dogId: `g${gd.animal_id}`,
      clientId: `g${gd.owner_id}`,
      type: gd.resType || "daycare",
      status: "checked-in",
      _animalName: gd.animal_name,
      _ownerName: gd.owner_last,
      _services: gd.services || [],
      room: gd.run_name || "",
      checkIn: gd.start_date ? gd.start_date.slice(0, 10) : today,
      checkOut: gd.end_date ? gd.end_date.slice(0, 10) : today,
      _fromGingrApi: true,
    }));

    // ── Step 3: Build synthetic dog objects for display ───────────────
    const syntheticDogSources = [
      ...gingrBoardingDogs.map(gd => ({
        animal_id: gd.animal_id,
        name: gd.animal_name,
        breed: gd.breed || "",
      })),
      ...gingrDaycareFromRes.map(gd => ({
        animal_id: gd.animal_id,
        name: gd.animal_name,
        breed: gd.breed || "",
      })),
      ...(gingrDaycareDogs || []).map(gd => ({
        animal_id: gd.animal_id,
        name: (gd.a_first || "Unknown").trim(),
        breed: gd.breed_name || "",
      })),
    ];
    const seenAnimalIds = new Set();
    const syntheticDogs = syntheticDogSources
      .filter(gd => {
        if (seenAnimalIds.has(gd.animal_id)) return false;
        seenAnimalIds.add(gd.animal_id);
        const existing = baseDogs.find(d => d.gingrId === Number(gd.animal_id) || d.id === `g${gd.animal_id}`);
        return !existing;
      })
      .map(gd => ({
        id: `g${gd.animal_id}`,
        gingrId: Number(gd.animal_id),
        fields: {
          name: gd.name,
          breed: gd.breed,
          weight: null,
        },
        _image: null,
      }));

    // ── Step 4: Merge — deduplicate against checked-in Supabase records ──
    // Only deduplicate against CHECKED-IN reservations from Supabase.
    // Historical (checked-out) records must not block new check-ins.
    const checkedInBaseRes = filteredBaseRes.filter(r => r.status === 'checked-in');
    const existingGingrIds = new Set(checkedInBaseRes.map(r => r.gingrId).filter(Boolean));
    const existingDogIds = new Set(checkedInBaseRes.map(r => r.dogId).filter(Boolean));

    const newBoardingRes = gingrBoardingRes.filter(r =>
      !existingGingrIds.has(r.gingrId) && !existingDogIds.has(r.dogId)
    );
    const newDaycareRes = gingrDaycareRes.filter(r =>
      !existingGingrIds.has(r.gingrId) && !existingDogIds.has(r.dogId)
    );

    const allRes = [...filteredBaseRes, ...newBoardingRes, ...newDaycareRes];
    const allDogs = [...baseDogs, ...syntheticDogs];

    console.log('[TV-MERGE] filteredBase:', filteredBaseRes.length, 'newBoarding:', newBoardingRes.length, 'newDaycare:', newDaycareRes.length, 'total:', allRes.length);
    return {
      reservations: allRes,
      dogs: allDogs,
    };
  }, [baseReservations, baseDogs, gingrDaycareDogs, gingrActiveDogs, gingrBoardingDogs, gingrDaycareFromRes]);

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

  /* ── TV-018: Unified classification — no more Boarding section ────────
   * ALL dogs (daycare, boarding, evaluation, dayboarding) are classified into:
   *   - Large Daycare: dogs >= SIZE_THRESHOLD lbs (includes boarding without PP)
   *   - Small Daycare: dogs < SIZE_THRESHOLD lbs (includes boarding without PP)
   *   - Private Play: dogs with PP services, PP rooms, or dayboarding type
   *
   * Dual-tagged dogs: A dog that belongs to a group (large/small) AND has
   * private play appears in BOTH sections. Counted as 0.5 in each for
   * accurate capacity tracking.
   *
   * Display: Each dog card still appears in full in both sections — the 0.5
   * only affects the count badges.
   * ──────────────────────────────────────────────────────────────────────── */
  const { largeDaycare, smallDaycare, privatePlayDogs, dualTaggedIds } = useMemo(() => {
    const large = [];
    const small = [];
    const pp = [];
    const dualIds = new Set();

    for (const res of uniqueDogs) {
      const dog = dogs.find(d => d.id === res.dogId);
      const size = getDogSize(dog);
      const isPP = hasPrivatePlay(res) || res.type === "dayboarding";

      if (isPP) {
        pp.push(res);

        // Dayboarding-only dogs go ONLY in PP (they're not in group play)
        if (res.type === "dayboarding" && !DAYCARE_TYPES.has(res.type)) {
          // dayboarding IS in DAYCARE_TYPES, so this is actually dual-tagged
        }

        // If the dog is also in group play (daycare or boarding entering group),
        // it's dual-tagged — appears in both daycare by size AND private play
        if (res.type !== "dayboarding") {
          // Boarding dog with PP or daycare dog with PP → dual-tagged
          dualIds.add(res.dogId);
          if (size === "small") {
            small.push(res);
          } else {
            large.push(res);
          }
        }
      } else {
        // No private play — goes into daycare by size (whether daycare or boarding type)
        if (size === "small") {
          small.push(res);
        } else {
          large.push(res);
        }
      }
    }

    return { largeDaycare: large, smallDaycare: small, privatePlayDogs: pp, dualTaggedIds: dualIds };
  }, [uniqueDogs, dogs]);

  /* ── TV-018: Counts with 0.5 logic for dual-tagged dogs ────────────── *
   * Dual-tagged dogs are counted as 0.5 in their daycare group and 0.5
   * in private play. The "all" count stays as the true unique dog count.
   * ──────────────────────────────────────────────────────────────────── */
  const viewCounts = useMemo(() => {
    // Count with 0.5 adjustment for dual-tagged dogs
    let largeCount = 0;
    for (const r of largeDaycare) {
      largeCount += dualTaggedIds.has(r.dogId) ? 0.5 : 1;
    }
    let smallCount = 0;
    for (const r of smallDaycare) {
      smallCount += dualTaggedIds.has(r.dogId) ? 0.5 : 1;
    }
    let ppCount = 0;
    for (const r of privatePlayDogs) {
      ppCount += dualTaggedIds.has(r.dogId) ? 0.5 : 1;
    }

    return {
      "all": uniqueDogs.length,
      "small-daycare": smallCount,
      "large-daycare": largeCount,
      "private-play": ppCount,
    };
  }, [uniqueDogs, smallDaycare, largeDaycare, privatePlayDogs, dualTaggedIds]);

  /* ── TV-012/TV-013: Persistent TV notice system ────────────────────── *
   * Notices (check-in / check-out hero cards) are stored with a timestamp
   * (`firedAt`) and a fixed duration. A single 1-second interval drives
   * the countdown for ALL active notices, computing `remaining` from
   * wall-clock time so they are immune to re-renders, BOH poll cycles,
   * or React state batching. Once fired, a notice lives for its full
   * duration no matter what.
   * ──────────────────────────────────────────────────────────────────── */
  const NOTICE_DURATION_MS = 60_000; // 60 seconds
  const FADE_DURATION_MS = 1_200;    // fade-out animation length

  // Raw notice stores — entries have { id, dogs, ownerLastName, firedAt, durationMs }
  const [checkingOutRaw, setCheckingOutRaw] = useState([]);
  const [checkingInRaw, setCheckingInRaw] = useState([]);

  // Derived display state — recomputed every tick
  const [checkingOut, setCheckingOut] = useState([]);
  const [checkingIn, setCheckingIn] = useState([]);

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
   * TV-018: All dogs (including boarding) route to daycare by size.
   * Dogs with PP match the private-play view. Dual-tagged match both.
   * ──────────────────────────────────────────────────────────────────── */
  const entryMatchesView = useCallback((entry) => {
    if (activeView === "all") return true;
    const entryDogs = entry.dogs || [entry];
    return entryDogs.some(d => {
      const rType = d.resType || "boarding";
      const isPP = hasPrivatePlay({ _services: [], room: d.room || "", _resTypeName: "", type: rType }) || rType === "dayboarding";
      const dog = dogs.find(dd => dd.gingrId === Number(d.animalGingrId) || dd.id === `g${d.animalGingrId}`);
      const size = getDogSize(dog);

      switch (activeView) {
        case "large-daycare":  return size === "large" && rType !== "dayboarding";
        case "small-daycare":  return size === "small" && rType !== "dayboarding";
        case "private-play":   return isPP;
        default:               return true;
      }
    });
  }, [activeView, dogs]);

  /* ── TV-015: All active notices rendered as full cards ────────────────
   * No more "active + queue" split. Every notice gets a full hero card.
   * Cards scale down when there are multiple to fit up to 5 on screen.
   * ──────────────────────────────────────────────────────────────────── */
  const viewCheckingIn = checkingIn.filter(entryMatchesView);
  const viewCheckingOut = checkingOut.filter(entryMatchesView);
  const totalNotices = viewCheckingIn.length + viewCheckingOut.length;
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

    // TV-005: Private play badge
    const isPP = hasPrivatePlay(res) || res.type === "dayboarding";

    // TV-018: Boarding label — distinguishes boarding dogs from day-only dogs
    const isBoarding = res.type === "boarding";

    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", padding: "16px 12px",
        background: isCheckingOut ? "rgba(132,204,22,0.08)" : "rgba(255,255,255,0.06)",
        borderRadius: 16,
        border: isCheckingOut
          ? "1px solid rgba(132,204,22,0.2)"
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

        {/* TV-005: Private Play badge — top-left corner */}
        {isPP && (
          <div style={{
            position: "absolute", top: 8, left: 8,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontSize: 10, fontWeight: 900, letterSpacing: "0.06em",
            color: "#EF4444",
            background: "rgba(239,68,68,0.15)",
            border: "1.5px solid rgba(239,68,68,0.35)",
            borderRadius: 6, padding: "2px 6px",
            lineHeight: 1.4,
          }}>
            PP
          </div>
        )}

        {/* TV-018: Boarding label — bottom-center of card */}
        {isBoarding && (
          <div style={{
            position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontSize: 9, fontWeight: 900, letterSpacing: "0.08em",
            color: "#60A5FA",
            background: "rgba(96,165,250,0.15)",
            border: "1.5px solid rgba(96,165,250,0.35)",
            borderRadius: 6, padding: "2px 5px",
            lineHeight: 1.4,
          }}>
            BOARDING
          </div>
        )}

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

  const hasCheckouts = viewCheckingOut.length > 0;
  const hasCheckIns = viewCheckingIn.length > 0;

  /* ── TV-005 + TV-018: Determine which sections to render ────────────── */
  const showLargeDaycare = activeView === "all" || activeView === "large-daycare";
  const showSmallDaycare = activeView === "all" || activeView === "small-daycare";
  const showPrivatePlay = activeView === "all" || activeView === "private-play";

  // For filtered views (not "all"), skip the section header and show a flat grid
  const isFilteredView = activeView !== "all";

  // Get the filtered dogs for single-category views
  const filteredDogList = useMemo(() => {
    switch (activeView) {
      case "small-daycare": return smallDaycare;
      case "large-daycare": return largeDaycare;
      case "private-play": return privatePlayDogs;
      default: return null; // "all" uses the sectioned layout
    }
  }, [activeView, smallDaycare, largeDaycare, privatePlayDogs]);

  // Get accent color & label for filtered view
  const filteredViewMeta = NAV_VIEWS.find(v => v.id === activeView);

  return (
    <div style={{
      minHeight: "100vh", background: "linear-gradient(180deg, #001A33 0%, #00112A 50%, #000A1A 100%)",
      padding: "32px 40px", fontFamily: "'Outfit', -apple-system, sans-serif", overflow: "auto",
    }}>
      {/* Header — K9 Operations branding */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* K9 Operations logo icon (white for dark bg) */}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="163.70 160.20 678.60 678.60" style={{ width: 48, height: 48, flexShrink: 0 }}>
            <g transform="translate(0,1024) scale(0.1,-0.1)" fill="#84CC16" stroke="none">
              <path d="M5710 7969 c-414 -27 -846 -110 -1098 -210 -265 -105 -456 -268 -513-438 -29 -86 -19 -111 46 -111 51 0 141 29 230 73 l60 29 -25 -27 c-79 -86-250 -164 -455 -208 -158 -35 -260 -40 -545 -31 -490 15 -595 10 -800 -38-107 -25 -251 -93 -312 -147 -127 -113 -173 -275 -133 -463 7 -37 21 -79 29-95 15 -27 15 -25 16 60 0 51 4 87 10 87 6 0 10 -17 10 -37 0 -96 52 -308 134-550 19 -57 32 -103 30 -103 -10 0 -74 149 -104 242 -17 51 -33 100 -36 108-8 22 -38 -32 -68 -122 -42 -124 -67 -293 -73 -498 -19 -618 159 -1097 489-1316 67 -45 97 -54 62 -19 -30 29 -123 206 -154 293 -79 219 -77 465 6 599 10 15 33 44 51 64 l34 35 -25 55 c-31 68 -72 216 -91 334 -16 97 -20 221 -7 229 4 2 18 -45 30 -106 46 -224 124 -422 201 -510 29 -32 72 -63 138 -97 125-66 228 -136 393 -267 430 -340 698 -468 1135 -541 84 -14 160 -18 320 -17 215 1 281 9 502 61 40 9 75 14 78 11 11 -11 -7 -56 -37 -92 -127 -154 -504-153 -998 3 -52 17 -96 29 -98 27 -4 -5 77 -50 173 -95 341 -162 704 -218 922-141 229 80 307 285 193 510 -56 110 -121 193 -434 549 -69 79 -126 146 -126 148 0 7 22 -10 84 -65 73 -64 224 -160 371 -237 177 -92 257 -146 345 -235 81-81 140 -177 140 -229 0 -17 5 -31 10 -31 6 0 10 30 10 70 0 78 -23 152 -69 220 -38 56 -138 158 -176 178 -26 14 -27 16 -10 20 46 8 217 67 310 108 324 139 604 361 779 618 122 179 173 338 256 801 62 347 100 485 173 630 154 310 406 498 774 581 l81 18 -66 29 c-78 33 -294 106 -402 136 -201 55 -483 104-790 137 -173 18 -779 27 -980 13z m-2468 -973 c142 -42 242 -106 277 -179 12-24 21 -54 21 -68 0 -33 -19 -99 -29 -99 -4 0 -13 22 -20 50 -9 34 -27 66 -58 100 -83 92 -330 193 -506 207 -43 3 -80 11 -84 16 -4 7 48 8 153 4 129 -4 175-10 246 -31z m-529 -359 c18 -8 39 -22 47 -32 14 -18 14 -18 -10 -2 -14 9 -43 19 -65 22 -36 6 -45 3 -73 -23 -41 -38 -41 -61 1 -165 86 -212 179 -287 322-257 140 29 343 165 472 318 29 34 53 60 53 57 0 -35 -136 -222 -208 -287-282 -252 -600 -248 -720 11 -37 77 -43 210 -14 267 46 89 118 123 195 91z M2633 5000 c-106 -64 -125 -336 -39 -563 86 -229 310 -432 583 -531 140 -50 211 -60 565 -85 116 -8 134 -12 200 -44 88 -42 238 -166 337 -277 39 -44 135-160 213 -258 277 -345 478 -564 628 -683 69 -55 82 -57 20 -3 -187 164 -357 364 -615 724 -194 270 -256 351 -335 434 -41 44 -68 77 -60 74 9 -3 52 -16 95-28 133 -37 335 -124 430 -185 93 -59 101 -57 30 10 -119 111 -301 228 -427 274 -145 54 -254 70 -538 81 -129 5 -270 16 -313 24 -291 57 -503 208 -617 439 -27 56 -57 129 -65 162 -28 109 -15 217 27 231 61 19 191 -39 428 -189 74-47 136 -84 138 -82 9 9 -272 264 -428 390 -129 104 -192 125 -257 85z"/>
            </g>
          </svg>
          <div>
            <div style={{ fontSize: 28, fontWeight: 900, color: "#fff", letterSpacing: "-0.02em" }}>K9 Operations</div>
            <div style={{ fontSize: 12, color: "rgba(132,204,22,0.6)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 1 }}>The Operating System for Pet Resorts</div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 36, fontWeight: 900, color: "#fff", fontVariantNumeric: "tabular-nums" }}>{timeStr}</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", fontWeight: 500 }}>{dateStr}</div>
        </div>
      </div>

      {/* TV-005: Navigation bar — large, touch-friendly buttons */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "12px 0", marginBottom: 4,
        borderTop: "1px solid rgba(255,255,255,0.06)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        overflowX: "auto",
        animation: "tvNavFadeIn 0.4s ease-out",
      }}>
        {NAV_VIEWS.map(view => (
          <TVNavButton
            key={view.id}
            view={view}
            isActive={activeView === view.id}
            count={viewCounts[view.id]}
            onClick={() => handleViewChange(view.id)}
          />
        ))}

        {/* Auto-cycle toggle */}
        <div style={{ marginLeft: "auto", flexShrink: 0 }}>
          <button
            onClick={() => setAutoCycle(prev => !prev)}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = autoCycle ? "rgba(132,204,22,0.12)" : "rgba(255,255,255,0.03)"; }}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              height: 48, padding: "0 20px",
              borderRadius: 12,
              border: autoCycle ? "2px solid rgba(132,204,22,0.4)" : "2px solid rgba(255,255,255,0.08)",
              background: autoCycle ? "rgba(132,204,22,0.12)" : "rgba(255,255,255,0.03)",
              cursor: "pointer",
              transition: "all 0.25s ease",
            }}
          >
            {/* Rotating icon indicator */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
              style={{
                transition: "transform 0.3s",
                transform: autoCycle ? "rotate(360deg)" : "rotate(0deg)",
              }}
            >
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10"
                stroke={autoCycle ? "#84CC16" : "rgba(255,255,255,0.35)"}
                strokeWidth="2.5" strokeLinecap="round" />
              <path d="M22 4l-2 6-6-2"
                stroke={autoCycle ? "#84CC16" : "rgba(255,255,255,0.35)"}
                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={{
              fontSize: 14, fontWeight: 700,
              color: autoCycle ? "#84CC16" : "rgba(255,255,255,0.35)",
              transition: "color 0.25s",
              whiteSpace: "nowrap",
            }}>
              {autoCycle ? "Auto" : "Auto"}
            </span>
          </button>
        </div>
      </div>

      {/* Stats bar — TV-003 + TV-018: Updated with 0.5 counting */}
      <div style={{ display: "flex", gap: 24, padding: "10px 0", marginBottom: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>Total: <span style={{ fontWeight: 800, color: "#fff" }}>{uniqueDogs.length}</span></div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>
          Large Daycare: <span style={{ fontWeight: 800, color: SIZE_THEME.large.accent }}>{viewCounts["large-daycare"] % 1 === 0 ? viewCounts["large-daycare"] : viewCounts["large-daycare"].toFixed(1)}</span>
        </div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>
          Small Daycare: <span style={{ fontWeight: 800, color: SIZE_THEME.small.accent }}>{viewCounts["small-daycare"] % 1 === 0 ? viewCounts["small-daycare"] : viewCounts["small-daycare"].toFixed(1)}</span>
        </div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>Private Play: <span style={{ fontWeight: 800, color: "#EF4444" }}>{viewCounts["private-play"] % 1 === 0 ? viewCounts["private-play"] : viewCounts["private-play"].toFixed(1)}</span></div>
        {hasCheckIns && (
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", marginLeft: hasCheckouts ? 0 : "auto" }}>
            Checking in: <span style={{ fontWeight: 800, color: "#38BDF8" }}>{viewCheckingIn.filter(e => !e.fading).length}</span>
          </div>
        )}
        {hasCheckouts && (
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", marginLeft: hasCheckIns ? 0 : "auto" }}>
            Checking out: <span style={{ fontWeight: 800, color: "#EF4444" }}>{viewCheckingOut.filter(e => !e.fading).length}</span>
          </div>
        )}
      </div>

      {/* TV-015: Unified notice section — all check-in + check-out cards shown simultaneously */}
      {totalNotices > 0 && (
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
              fading={entry.fading}
              compact={compactNotices}
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
              compact={compactNotices}
            />
          ))}
        </div>
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
                  count={viewCounts[activeView] != null ? (viewCounts[activeView] % 1 === 0 ? viewCounts[activeView] : viewCounts[activeView].toFixed(1)) : filteredDogList.length}
                  color={filteredViewMeta?.color || "#fff"}
                  subtitle={
                    activeView === "large-daycare" ? `Dogs ${SIZE_THRESHOLD}+ lbs` :
                    activeView === "small-daycare" ? `Dogs under ${SIZE_THRESHOLD} lbs` :
                    activeView === "private-play" ? "Dogs with private play services" :
                    undefined
                  }
                />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
                  {filteredDogList.map(r => (
                    <DogCard
                      key={r.id}
                      res={r}
                      sizeGroup={
                        activeView === "large-daycare" ? "large" :
                        activeView === "small-daycare" ? "small" :
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
            {/* TV-003 + TV-018: Large Dog Daycare section — includes boarding dogs by size */}
            {largeDaycare.length > 0 && (
              <div>
                <SectionLabel
                  label="Large Dog Daycare"
                  count={viewCounts["large-daycare"] % 1 === 0 ? viewCounts["large-daycare"] : viewCounts["large-daycare"].toFixed(1)}
                  color={SIZE_THEME.large.accent}
                  subtitle={`Dogs ${SIZE_THRESHOLD}+ lbs`}
                />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
                  {largeDaycare.map(r => <DogCard key={r.id} res={r} sizeGroup="large" />)}
                </div>
              </div>
            )}

            {/* TV-003 + TV-018: Small Dog Daycare section — includes boarding dogs by size */}
            {smallDaycare.length > 0 && (
              <div>
                <SectionLabel
                  label="Small Dog Daycare"
                  count={viewCounts["small-daycare"] % 1 === 0 ? viewCounts["small-daycare"] : viewCounts["small-daycare"].toFixed(1)}
                  color={SIZE_THEME.small.accent}
                  subtitle={`Dogs under ${SIZE_THRESHOLD} lbs`}
                />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
                  {smallDaycare.map(r => <DogCard key={r.id} res={r} sizeGroup="small" />)}
                </div>
              </div>
            )}

            {/* Private Play section — TV-018: Now includes boarding dogs with PP services */}
            {privatePlayDogs.length > 0 && (
              <div>
                <SectionLabel
                  label="Private Play"
                  count={viewCounts["private-play"] % 1 === 0 ? viewCounts["private-play"] : viewCounts["private-play"].toFixed(1)}
                  color="#EF4444"
                  subtitle="Dogs with private play services"
                />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
                  {privatePlayDogs.map(r => <DogCard key={r.id} res={r} />)}
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
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.15)" }}>K9 Operations · Auto-refreshes in real-time · Gingr: {gingrBoardingDogs.length + gingrDaycareFromRes.length} in-house ({gingrBoardingDogs.length}B + {gingrDaycareFromRes.length}D)</div>
      </div>

      {/* Floating Exit Button — subtle, top-left corner */}
      <button
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

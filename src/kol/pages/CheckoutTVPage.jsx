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
  `;
  document.head.appendChild(style);
}

/* ── Playgroup classification via Gingr Icons ────────────────────────── *
 * Icons from gingr_animal_icons_live are the source of truth for which
 * playgroup a dog belongs to. Title-based matching for multi-location
 * resilience. No fallback to weight — unclassified dogs are surfaced
 * so staff can fix the missing icon in Gingr.
 * ──────────────────────────────────────────────────────────────────────── */
function getPlaygroupFromIcons(animalGingrId, playgroupMap) {
  if (!animalGingrId || !playgroupMap) return null;
  return playgroupMap[String(animalGingrId)] || null;
}

function getDogPlaygroup(dog, res, playgroupMap) {
  const animalId = dog?.gingrId || res?.animalGingrId;
  const pg = getPlaygroupFromIcons(animalId, playgroupMap);
  if (pg) return pg; // 'large', 'small', 'private_play', 'evaluation'
  // Day boarding always goes to private play regardless of icon
  if (res?.type === "dayboarding") return "private_play";
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
  { id: "unclassified",  label: "Unclassified",   color: "#6B7280",  colorRgb: "107,114,128" },
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
function HeroCheckoutCard({ entry, dogs: allDogs, clients, fading, animalIcons, compact, playgroupMap }) {
  const entryDogs = entry.dogs || [entry];
  const resolvedDogs = entryDogs.map(d => {
    const dog = allDogs.find(dd => dd.gingrId === Number(d.animalGingrId) || dd.id === `g${d.animalGingrId}`);
    const iconData = animalIcons[dog?.gingrId];
    const animalId = String(dog?.gingrId || d.animalGingrId);
    return {
      ...d, dog,
      name: dog?.fields?.name || d.animalName || "Unknown",
      breed: dog?.fields?.breed || "",
      image: iconData?.icon_url || dog?._image,
      size: playgroupMap[animalId] || "unclassified",
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
            <img key={rd.id || i} src={rd.image} alt={rd.name} loading="eager" decoding="async" style={{
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
function HeroCheckInCard({ entry, dogs: allDogs, animalIcons, fading, compact, playgroupMap }) {
  const entryDogs = entry.dogs || [entry];
  const resolvedDogs = entryDogs.map(d => {
    const dog = allDogs.find(dd => dd.gingrId === Number(d.animalGingrId) || dd.id === `g${d.animalGingrId}`);
    const iconData = animalIcons[dog?.gingrId];
    const animalId = String(dog?.gingrId || d.animalGingrId);
    return {
      ...d, dog,
      name: dog?.fields?.name || d.animalName || "Unknown",
      breed: dog?.fields?.breed || "",
      image: iconData?.icon_url || dog?._image,
      size: playgroupMap[animalId] || "unclassified",
    };
  });
  const ownerLast = entry.ownerLastName || "";
  const allNames = resolvedDogs.map(d => d.name).join(" & ");
  const firstDog = resolvedDogs[0];
  const theme = SIZE_THEME[firstDog.size] || SIZE_THEME.unclassified;

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
            <img key={rd.id || i} src={rd.image} alt={rd.name} loading="eager" decoding="async" style={{
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
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // ── Dynamic Gingr credentials (loaded via k9_gingr_credentials) ────

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
   * Event-detection-only: polls every 10s, compares previous → current
   * state, and fires TV notices (hero cards) on transitions. Triggers
   * an immediate Supabase sync so the grid refreshes from Supabase data.
   * ──────────────────────────────────────────────────────────────────── */
  const [gingrActiveDogCount, setGingrActiveDogCount] = useState(0); // BOH count for footer debug
  const prevBohIdsRef = useRef(null);     // Map<id, dogRecord> from previous poll
  const bohPollCountRef = useRef(0);

  // ── Dynamic Gingr credentials from k9_gingr_credentials ────────────────
  const tvLocationId = propLocationId || profile?.location_id;
  const [gingrCreds, setGingrCreds] = useState(null);
  useEffect(() => {
    if (!tvLocationId) return;
    supabase
      .from("k9_gingr_credentials")
      .select("gingr_subdomain, gingr_api_key, gingr_location_id")
      .eq("location_id", tvLocationId)
      .maybeSingle()
      .then(({ data: row }) => {
        if (row) {
          setGingrCreds({
            subdomain: row.gingr_subdomain,
            apiKey: row.gingr_api_key,
            gingrLocationId: row.gingr_location_id || "1",
          });
        }
      });
  }, [tvLocationId]);

  /* ── TV-POLL: Supabase reconciliation sync ──────────────────────────
   * Calls the gingr-sync edge function in tv-poll mode to reconcile
   * stale Supabase records. Called on an interval AND on BOH transitions.
   * ──────────────────────────────────────────────────────────────────── */
  const triggerTvPoll = useCallback(async () => {
    if (!tvLocationId) return;
    try {
      await supabase.functions.invoke("gingr-sync", {
        body: { location_id: tvLocationId, sync_type: "tv-poll" },
      });
    } catch (e) {
      // Silently ignore — sync will retry on next interval
    }
  }, [tvLocationId]);

  useEffect(() => {
    const initTimer = setTimeout(triggerTvPoll, 5000);
    const interval = setInterval(triggerTvPoll, 60_000);
    return () => { clearTimeout(initTimer); clearInterval(interval); };
  }, [triggerTvPoll]);

  useEffect(() => {
    if (!gingrCreds) return;
    let cancelled = false;
    const BOH_URL = `https://${gingrCreds.subdomain}.gingrapp.com/api/v1/back_of_house?key=${gingrCreds.apiKey}&location_id=${gingrCreds.gingrLocationId}&full_day=true&include_daycare=true`;

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

        // Trigger immediate Supabase sync on transitions so grid refreshes
        if (arrivals.length > 0 || departed.length > 0) {
          triggerTvPoll();
        }

        // Store current state for next comparison
        prevBohIdsRef.current = currentMap;
        bohPollCountRef.current += 1;
        if (!cancelled) setGingrActiveDogCount(active.length);
      } catch (e) {
        // Silently ignore — Supabase boarding data still works as fallback
      }
    };

    fetchBoh();
    const interval = setInterval(fetchBoh, 10000); // 10s poll
    return () => { cancelled = true; clearInterval(interval); };
  }, [gingrCreds]);

  /* ── Grid data: Supabase is the sole source of truth ─────────────── *
   * All checked-in dog data comes from Supabase tables (synced by the
   * gingr-sync edge function). BOH polling only detects transitions
   * for hero card notifications and triggers immediate Supabase syncs.
   * ──────────────────────────────────────────────────────────────────── */
  const { reservations, dogs } = useMemo(() => {
    return { reservations: baseReservations, dogs: baseDogs };
  }, [baseReservations, baseDogs]);

  /* ── Fetch animal profile icons (photos) from Supabase ────────────── */
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
    const interval = setInterval(fetchIcons, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [locationId]);

  /* ── Fetch playgroup classification from Gingr icons ────────────── *
   * Uses v_dog_playgroups view (backed by gingr_animal_icons_live).
   * Title-based matching: resilient to template ID changes across locations.
   * Returns: { animal_gingr_id → 'large' | 'small' | 'private_play' | 'evaluation' }
   * ──────────────────────────────────────────────────────────────────── */
  const [playgroupMap, setPlaygroupMap] = useState({});

  useEffect(() => {
    if (!locationId) return;
    let cancelled = false;

    const fetchPlaygroups = async () => {
      try {
        const { data, error } = await supabase
          .from("v_dog_playgroups")
          .select("animal_gingr_id, playgroup, icon_color")
          .eq("location_id", locationId);

        if (cancelled || error) return;

        const map = {};
        for (const row of (data || [])) {
          if (row.playgroup) {
            map[String(row.animal_gingr_id)] = row.playgroup;
          }
        }
        setPlaygroupMap(map);
      } catch (e) {
        // Silently ignore — classification falls back to unclassified
      }
    };

    fetchPlaygroups();
    // Refresh every 60 seconds (icons rarely change mid-day)
    const interval = setInterval(fetchPlaygroups, 60 * 1000);
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

  /* ── Icon-based classification — Gingr icons are the source of truth ──
   * ALL dogs are classified by their Gingr play icon into:
   *   - Large Daycare: dogs with "Large Dog Playgroup" icon
   *   - Small Daycare: dogs with "Small Dog Playgroup" icon
   *   - Private Play: dogs with "Private Play" icon OR dayboarding type
   *   - Evaluation: dogs with "Evaluation" icon
   *   - Unclassified: dogs with no play icon (surface to staff to fix in Gingr)
   *
   * Dual-tagged dogs: A dog in group play (large/small) that ALSO has
   * private play appears in BOTH sections. Counted as 0.5 in each.
   * ──────────────────────────────────────────────────────────────────────── */
  const { largeDaycare, smallDaycare, privatePlayDogs, evaluationDogs, unclassifiedDogs, dualTaggedIds } = useMemo(() => {
    const large = [];
    const small = [];
    const pp = [];
    const evals = [];
    const unclassified = [];
    const dualIds = new Set();

    for (const res of uniqueDogs) {
      const dog = dogs.find(d => d.id === res.dogId);
      const playgroup = getDogPlaygroup(dog, res, playgroupMap);

      if (playgroup === "private_play") {
        pp.push(res);
        // Check if also in a size group (dual-tagged)
        const animalId = String(dog?.gingrId || res?.animalGingrId || "");
        const sizeGroup = playgroupMap[animalId];
        // A PP dog might also have a size icon — check all icons for this animal
        // For now, PP-only dogs don't appear in size groups
      } else if (playgroup === "evaluation") {
        evals.push(res);
      } else if (playgroup === "large") {
        large.push(res);
        // Check if this dog also has a PP service/room (dual-tagged)
        const svcs = res._services;
        const hasPPService = Array.isArray(svcs) && svcs.some(s => {
          const name = typeof s === "string" ? s : (s?.name || "");
          return name.toLowerCase().includes("private play");
        });
        const roomIsPP = (res.room || "").toLowerCase().includes("private play");
        if (hasPPService || roomIsPP) {
          pp.push(res);
          dualIds.add(res.dogId);
        }
      } else if (playgroup === "small") {
        small.push(res);
        // Check for dual-tag with PP service/room
        const svcs = res._services;
        const hasPPService = Array.isArray(svcs) && svcs.some(s => {
          const name = typeof s === "string" ? s : (s?.name || "");
          return name.toLowerCase().includes("private play");
        });
        const roomIsPP = (res.room || "").toLowerCase().includes("private play");
        if (hasPPService || roomIsPP) {
          pp.push(res);
          dualIds.add(res.dogId);
        }
      } else {
        // No play icon — unclassified (unless dayboarding, which always = PP)
        unclassified.push(res);
      }
    }

    return { largeDaycare: large, smallDaycare: small, privatePlayDogs: pp, evaluationDogs: evals, unclassifiedDogs: unclassified, dualTaggedIds: dualIds };
  }, [uniqueDogs, dogs, playgroupMap]);

  /* ── Counts with 0.5 logic for dual-tagged dogs ─────────────────────── */
  const viewCounts = useMemo(() => {
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
      "evaluation": evaluationDogs.length,
      "unclassified": unclassifiedDogs.length,
    };
  }, [uniqueDogs, smallDaycare, largeDaycare, privatePlayDogs, evaluationDogs, unclassifiedDogs, dualTaggedIds]);

  /* ── Dual-tag subtitle strings for section headers ─────────────────── */
  const dualTagSubtitles = useMemo(() => {
    const dualInLarge = largeDaycare.filter(r => dualTaggedIds.has(r.dogId)).length;
    const dualInSmall = smallDaycare.filter(r => dualTaggedIds.has(r.dogId)).length;
    const fmt = (v) => v % 1 === 0 ? v : v.toFixed(1);
    return {
      "large-daycare": dualInLarge > 0
        ? `${largeDaycare.length} dogs, ${dualInLarge} also PP → ${fmt(viewCounts["large-daycare"])} effective`
        : `${largeDaycare.length} dogs`,
      "small-daycare": dualInSmall > 0
        ? `${smallDaycare.length} dogs, ${dualInSmall} also PP → ${fmt(viewCounts["small-daycare"])} effective`
        : `${smallDaycare.length} dogs`,
      "private-play": (dualInLarge + dualInSmall) > 0
        ? `${privatePlayDogs.length} dogs, ${dualInLarge} from large + ${dualInSmall} from small → ${fmt(viewCounts["private-play"])} effective`
        : `${privatePlayDogs.length} dogs`,
    };
  }, [largeDaycare, smallDaycare, privatePlayDogs, dualTaggedIds, viewCounts]);

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
      const dog = dogs.find(dd => dd.gingrId === Number(d.animalGingrId) || dd.id === `g${d.animalGingrId}`);
      const rType = d.resType || "boarding";
      const playgroup = getDogPlaygroup(dog, { ...d, type: rType }, playgroupMap);

      switch (activeView) {
        case "large-daycare":  return playgroup === "large";
        case "small-daycare":  return playgroup === "small";
        case "private-play":   return playgroup === "private_play";
        case "evaluation":     return playgroup === "evaluation";
        case "unclassified":   return playgroup === null;
        default:               return true;
      }
    });
  }, [activeView, dogs, playgroupMap]);

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

  /* ── Image preloader: prefetch all dog photos when the list changes ── */
  useEffect(() => {
    const urls = new Set();
    for (const r of uniqueDogs) {
      const d = dogs.find(dd => dd.id === r.dogId);
      const icon = animalIcons[d?.gingrId];
      const url = icon?.icon_url || d?._image;
      if (url) urls.add(url);
    }
    urls.forEach(u => { const img = new Image(); img.src = u; });
  }, [uniqueDogs, dogs, animalIcons]);

  /* ── DogCardImage: skeleton placeholder while loading, then fade in ── */
  const DogCardImage = ({ src, name, accentRgb, accent }) => {
    const [loaded, setLoaded] = useState(false);
    return (
      <div style={{ width: 64, height: 64, borderRadius: 14, marginBottom: 8, position: "relative", overflow: "hidden", border: `2px solid rgba(${accentRgb},0.4)` }}>
        {!loaded && (
          <div style={{
            position: "absolute", inset: 0, borderRadius: 12,
            background: `rgba(${accentRgb},0.15)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 24, fontWeight: 800, color: accent,
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
  };

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

    // Get dog photo from animal icons or fall back to _image
    const iconData = animalIcons[dog?.gingrId];
    const image = iconData?.icon_url || dog?._image;
    const playgroup = sizeGroup || getDogPlaygroup(dog, res, playgroupMap) || "unclassified";
    // Map playgroup to size theme key (large/small stay as-is, others use their own key)
    const themeKey = playgroup === "large" ? "large" : playgroup === "small" ? "small" : playgroup;
    const theme = SIZE_THEME[themeKey] || SIZE_THEME.unclassified;

    // Dim dogs that are being checked out (they appear in hero card above)
    const isCheckingOut = checkingOutDogIds.has(res.dogId);

    // Boarding label — distinguishes boarding dogs from day-only dogs
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
        {/* Playgroup badge — top-right corner */}
        <div style={{
          position: "absolute", top: 8, right: 8,
        }}>
          <SizeBadge size={themeKey} />
        </div>

        {/* Dual-tagged indicator — top-left corner for dogs in both group play + PP */}
        {dualTaggedIds.has(res.dogId) && themeKey !== "private_play" && (
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
            +PP
          </div>
        )}

        {/* TV-018: Boarding label — top-left chip (below +PP if dual-tagged) */}
        {isBoarding && (
          <div style={{
            position: "absolute", top: dualTaggedIds.has(res.dogId) && themeKey !== "private_play" ? 30 : 8, left: 8,
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

        {/* Dog photo/icon from gingr_animal_icons or fallback — skeleton + fade-in */}
        {image ? (
          <DogCardImage src={image} name={name} accentRgb={theme.accentRgb} accent={theme.accent} />
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
  // For filtered views (not "all"), skip the section header and show a flat grid
  const isFilteredView = activeView !== "all";

  // Get the filtered dogs for single-category views
  const filteredDogList = useMemo(() => {
    switch (activeView) {
      case "small-daycare": return smallDaycare;
      case "large-daycare": return largeDaycare;
      case "private-play": return privatePlayDogs;
      case "evaluation": return evaluationDogs;
      case "unclassified": return unclassifiedDogs;
      default: return null; // "all" uses the sectioned layout
    }
  }, [activeView, smallDaycare, largeDaycare, privatePlayDogs, evaluationDogs, unclassifiedDogs]);

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
            <div style={{ fontSize: 12, color: "rgba(132,204,22,0.6)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 1 }}>The Operating System for Pet Care Facilities</div>
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

      {/* Stats bar — Icon-based classification counts */}
      <div style={{ display: "flex", gap: 24, padding: "10px 0", marginBottom: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>Total: <span style={{ fontWeight: 800, color: "#fff" }}>{uniqueDogs.length}</span></div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>
          Large: <span style={{ fontWeight: 800, color: SIZE_THEME.large.accent }}>{viewCounts["large-daycare"] % 1 === 0 ? viewCounts["large-daycare"] : viewCounts["large-daycare"].toFixed(1)}</span>
        </div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>
          Small: <span style={{ fontWeight: 800, color: SIZE_THEME.small.accent }}>{viewCounts["small-daycare"] % 1 === 0 ? viewCounts["small-daycare"] : viewCounts["small-daycare"].toFixed(1)}</span>
        </div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>PP: <span style={{ fontWeight: 800, color: "#EF4444" }}>{viewCounts["private-play"] % 1 === 0 ? viewCounts["private-play"] : viewCounts["private-play"].toFixed(1)}</span></div>
        {viewCounts["evaluation"] > 0 && <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>Eval: <span style={{ fontWeight: 800, color: "#EAB308" }}>{viewCounts["evaluation"]}</span></div>}
        {viewCounts["unclassified"] > 0 && <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>Unclassified: <span style={{ fontWeight: 800, color: "#6B7280" }}>{viewCounts["unclassified"]}</span></div>}
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
              compact={compactNotices}
              playgroupMap={playgroupMap}
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
                    activeView === "large-daycare" ? dualTagSubtitles["large-daycare"] :
                    activeView === "small-daycare" ? dualTagSubtitles["small-daycare"] :
                    activeView === "private-play" ? dualTagSubtitles["private-play"] :
                    activeView === "evaluation" ? "Needs evaluation (Gingr icon)" :
                    activeView === "unclassified" ? "No play icon in Gingr — please assign" :
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
                        activeView === "private-play" ? "private_play" :
                        activeView === "evaluation" ? "evaluation" :
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
                  count={viewCounts["large-daycare"] % 1 === 0 ? viewCounts["large-daycare"] : viewCounts["large-daycare"].toFixed(1)}
                  color={SIZE_THEME.large.accent}
                  subtitle={dualTagSubtitles["large-daycare"]}
                />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
                  {largeDaycare.map(r => <DogCard key={r.id} res={r} sizeGroup="large" />)}
                </div>
              </div>
            )}

            {/* Small Dog Daycare — dogs with "Small Dog Playgroup" icon */}
            {smallDaycare.length > 0 && (
              <div>
                <SectionLabel
                  label="Small Dog Daycare"
                  count={viewCounts["small-daycare"] % 1 === 0 ? viewCounts["small-daycare"] : viewCounts["small-daycare"].toFixed(1)}
                  color={SIZE_THEME.small.accent}
                  subtitle={dualTagSubtitles["small-daycare"]}
                />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
                  {smallDaycare.map(r => <DogCard key={r.id} res={r} sizeGroup="small" />)}
                </div>
              </div>
            )}

            {/* Private Play — dogs with "Private Play" icon or dayboarding type */}
            {privatePlayDogs.length > 0 && (
              <div>
                <SectionLabel
                  label="Private Play"
                  count={viewCounts["private-play"] % 1 === 0 ? viewCounts["private-play"] : viewCounts["private-play"].toFixed(1)}
                  color="#EF4444"
                  subtitle={dualTagSubtitles["private-play"]}
                />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
                  {privatePlayDogs.map(r => <DogCard key={r.id} res={r} sizeGroup="private_play" />)}
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
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
                  {evaluationDogs.map(r => <DogCard key={r.id} res={r} sizeGroup="evaluation" />)}
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
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
                  {unclassifiedDogs.map(r => <DogCard key={r.id} res={r} sizeGroup="unclassified" />)}
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
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.15)" }}>K9 Operations · Auto-refreshes in real-time · BOH: {gingrActiveDogCount} active · Supabase: {reservations.filter(r => r.status === "checked-in").length} in-house</div>
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

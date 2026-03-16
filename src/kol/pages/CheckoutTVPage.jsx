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

/* ── Private Play detection helper ─────────────────────────────────────── */
function hasPrivatePlay(res) {
  const svcs = res._services;
  if (!svcs) return false;
  const arr = Array.isArray(svcs) ? svcs : [];
  return arr.some(s => {
    const name = typeof s === "string" ? s : (s && s.name ? s.name : "");
    return name.toLowerCase().includes("private play");
  });
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

/* ── TV-005: Navigation view definitions ──────────────────────────────── */
const NAV_VIEWS = [
  { id: "all",           label: "All",            color: "#fff",     colorRgb: "255,255,255" },
  { id: "small-daycare", label: "Small Daycare",  color: "#0EA5E9",  colorRgb: "14,165,233" },
  { id: "large-daycare", label: "Large Daycare",  color: "#84CC16",  colorRgb: "132,204,22" },
  { id: "private-play",  label: "Private Play",   color: "#EF4444",  colorRgb: "239,68,68" },
  { id: "boarding",      label: "Boarding",        color: "#A78BFA",  colorRgb: "167,139,250" },
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

/* ── TV-006 + TV-008b: Hero Checkout Card — supports grouped multi-dog entries ── */
function HeroCheckoutCard({ entry, dogs: allDogs, clients, fading, animalIcons }) {
  // TV-008b: entry.dogs is an array of individual dog entries
  const entryDogs = entry.dogs || [entry];
  const resolvedDogs = entryDogs.map(d => {
    const dog = allDogs.find(dd => dd.gingrId === Number(d.animalGingrId) || dd.id === `g${d.animalGingrId}`);
    const iconData = animalIcons[dog?.gingrId];
    return {
      ...d,
      dog,
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

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 36,
      padding: "32px 40px",
      background: "linear-gradient(135deg, rgba(132,204,22,0.22) 0%, rgba(132,204,22,0.08) 50%, rgba(0,26,51,0.95) 100%)",
      borderRadius: 28,
      border: `3px solid ${isUrgent ? "rgba(239,68,68,0.6)" : "rgba(132,204,22,0.6)"}`,
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
        background: `radial-gradient(ellipse, ${isUrgent ? "rgba(239,68,68,0.08)" : "rgba(132,204,22,0.08)"} 0%, transparent 70%)`,
        pointerEvents: "none",
        transition: "background 0.3s",
      }} />

      {/* TV-008b: Dog photos — side by side for multi-dog */}
      <div style={{ display: "flex", gap: 12, flexShrink: 0, position: "relative", zIndex: 1 }}>
        {resolvedDogs.map((rd, i) => (
          rd.image ? (
            <img key={rd.id || i} src={rd.image} alt={rd.name} style={{
              width: resolvedDogs.length > 1 ? 96 : 120, height: resolvedDogs.length > 1 ? 96 : 120,
              borderRadius: 24, objectFit: "cover",
              border: `4px solid ${isUrgent ? "rgba(239,68,68,0.5)" : "rgba(132,204,22,0.6)"}`,
              transition: "border-color 0.3s",
            }} />
          ) : (
            <div key={rd.id || i} style={{
              width: resolvedDogs.length > 1 ? 96 : 120, height: resolvedDogs.length > 1 ? 96 : 120,
              borderRadius: 24,
              background: isUrgent ? "rgba(239,68,68,0.2)" : "rgba(132,204,22,0.25)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: resolvedDogs.length > 1 ? 36 : 48, fontWeight: 900,
              color: isUrgent ? "#EF4444" : "#84CC16",
              border: `4px solid ${isUrgent ? "rgba(239,68,68,0.4)" : "rgba(132,204,22,0.4)"}`,
              transition: "background 0.3s, color 0.3s, border-color 0.3s",
            }}>
              {rd.name[0]}
            </div>
          )
        ))}
      </div>

      {/* Info — large text for TV visibility */}
      <div style={{ flex: 1, minWidth: 0, position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 8, flexWrap: "wrap" }}>
          <span style={{
            fontSize: 14, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase",
            color: isUrgent ? "#EF4444" : "#84CC16",
            background: isUrgent ? "rgba(239,68,68,0.15)" : "rgba(132,204,22,0.15)",
            padding: "5px 14px", borderRadius: 8,
            animation: isUrgent ? "urgentShake 0.5s ease-in-out infinite" : "none",
            transition: "color 0.3s, background 0.3s",
          }}>
            {isUrgent ? "Leaving Now" : "Checking Out"}
          </span>
          <span style={{
            fontSize: 13, fontWeight: 800, letterSpacing: "0.08em",
            color: theme.accent,
            background: `rgba(${theme.accentRgb},0.15)`,
            padding: "5px 14px", borderRadius: 8,
          }}>
            {theme.badge === "LG" ? "LARGE" : "SMALL"}
          </span>
        </div>
        <div style={{
          fontSize: resolvedDogs.length > 1 ? 34 : 42, fontWeight: 900, color: "#fff",
          lineHeight: 1.1, marginBottom: 6,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          letterSpacing: "-0.01em",
        }}>
          {allNames}
        </div>
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

/* ── TV-008d: Hero Check-In Card — blue themed, same layout as checkout ── */
function HeroCheckInCard({ entry, dogs: allDogs, animalIcons, fading }) {
  const entryDogs = entry.dogs || [entry];
  const resolvedDogs = entryDogs.map(d => {
    const dog = allDogs.find(dd => dd.gingrId === Number(d.animalGingrId) || dd.id === `g${d.animalGingrId}`);
    const iconData = animalIcons[dog?.gingrId];
    return {
      ...d,
      dog,
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

  // Determine group label from reservation type
  const resType = (entry.dogs?.[0]?.resType || entry.resType || "");
  const groupLabel = resType === "dayboarding" ? "PRIVATE PLAY"
    : resType === "boarding" ? "BOARDING"
    : firstDog.size === "small" ? "SMALL DAYCARE" : "LARGE DAYCARE";
  const groupColor = resType === "dayboarding" ? "#EF4444"
    : resType === "boarding" ? "#A78BFA"
    : theme?.accent || "#84CC16";

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 36,
      padding: "32px 40px",
      background: "linear-gradient(135deg, rgba(56,189,248,0.22) 0%, rgba(56,189,248,0.08) 50%, rgba(0,26,51,0.95) 100%)",
      borderRadius: 28,
      border: "3px solid rgba(56,189,248,0.6)",
      animation: fading
        ? "heroFadeOut 1s ease-out forwards"
        : `heroEnter 0.6s cubic-bezier(0.34, 1.56, 0.64, 1), checkinPulse 2.5s ease-in-out infinite 0.6s`,
      minHeight: 140,
      position: "relative",
      overflow: "hidden",
      marginBottom: 12,
    }}>
      {/* Background glow */}
      <div style={{
        position: "absolute", top: "-50%", left: "-20%",
        width: "60%", height: "200%",
        background: "radial-gradient(ellipse, rgba(56,189,248,0.08) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      {/* Dog photos */}
      <div style={{ display: "flex", gap: 12, flexShrink: 0, position: "relative", zIndex: 1 }}>
        {resolvedDogs.map((rd, i) => (
          rd.image ? (
            <img key={rd.id || i} src={rd.image} alt={rd.name} style={{
              width: resolvedDogs.length > 1 ? 96 : 120, height: resolvedDogs.length > 1 ? 96 : 120,
              borderRadius: 24, objectFit: "cover",
              border: "4px solid rgba(56,189,248,0.6)",
            }} />
          ) : (
            <div key={rd.id || i} style={{
              width: resolvedDogs.length > 1 ? 96 : 120, height: resolvedDogs.length > 1 ? 96 : 120,
              borderRadius: 24,
              background: "rgba(56,189,248,0.25)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: resolvedDogs.length > 1 ? 36 : 48, fontWeight: 900,
              color: "#38BDF8",
              border: "4px solid rgba(56,189,248,0.4)",
            }}>
              {rd.name[0]}
            </div>
          )
        ))}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0, position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 8, flexWrap: "wrap" }}>
          <span style={{
            fontSize: 14, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase",
            color: "#38BDF8",
            background: "rgba(56,189,248,0.15)",
            padding: "5px 14px", borderRadius: 8,
          }}>
            Checking In
          </span>
          <span style={{
            fontSize: 13, fontWeight: 800, letterSpacing: "0.08em",
            color: groupColor,
            background: `${groupColor}22`,
            padding: "5px 14px", borderRadius: 8,
          }}>
            {groupLabel}
          </span>
        </div>
        <div style={{
          fontSize: resolvedDogs.length > 1 ? 34 : 42, fontWeight: 900, color: "#fff",
          lineHeight: 1.1, marginBottom: 6,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          letterSpacing: "-0.01em",
        }}>
          {allNames}
        </div>
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
      </div>

      {/* Countdown */}
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
        position: "relative", zIndex: 1,
      }}>
        <CountdownCircle remaining={entry.remaining} total={30} size={100} strokeWidth={6} accentColor="#38BDF8" />
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
      border: "1px solid rgba(132,204,22,0.2)",
      animation: `queueSlideIn 0.3s ease-out ${index * 0.1}s both`,
    }}>
      <div style={{
        fontSize: 12, fontWeight: 800, color: "rgba(132,204,22,0.5)",
        width: 22, textAlign: "center",
      }}>
        {index + 2}
      </div>
      {image ? (
        <img src={image} alt={name} style={{
          width: 40, height: 40, borderRadius: 10, objectFit: "cover",
          border: "2px solid rgba(132,204,22,0.3)",
        }} />
      ) : (
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: "rgba(132,204,22,0.15)", display: "flex",
          alignItems: "center", justifyContent: "center",
          fontSize: 16, fontWeight: 800, color: "#84CC16",
        }}>
          {name[0]}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{name}</div>
        <div style={{ fontSize: 11, color: "rgba(132,204,22,0.6)", fontWeight: 600 }}>Up next</div>
      </div>
      <CountdownCircle remaining={entry.remaining} total={60} size={36} strokeWidth={3} />
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

  // Merge Gingr daycare dogs into reservations + dogs arrays
  const { reservations, dogs } = useMemo(() => {
    if (gingrDaycareDogs.length === 0) return { reservations: baseReservations, dogs: baseDogs };

    // Build synthetic reservation objects from Gingr API data
    const syntheticRes = gingrDaycareDogs.map(gd => {
      const t = (gd.type || "").toLowerCase();
      let resType = "daycare";
      if (t.includes("evaluation")) resType = "evaluation";
      else if (t.includes("day boarding") && !t.includes("daycare")) resType = "dayboarding";

      return {
        id: `gingr-boh-${gd.id}`,
        gingrId: Number(gd.id),
        dogId: `g${gd.animal_id}`,
        clientId: `g${gd.owner_id}`,
        type: resType,
        status: "checked-in",
        _animalName: (gd.a_first || "Unknown").trim(),
        _ownerName: (gd.o_last || "").trim(),
        _services: [],
        room: gd.run_name || "",
        checkIn: gd.start_date ? new Date(Number(gd.start_date) * 1000).toISOString().slice(0, 10) : todayStr(),
        checkOut: gd.end_date ? new Date(Number(gd.end_date) * 1000).toISOString().slice(0, 10) : todayStr(),
        _fromGingrApi: true,
      };
    });

    // Build synthetic dog objects so DogCard can find them
    const syntheticDogs = gingrDaycareDogs.map(gd => {
      // Don't duplicate if dog already exists in baseDogs
      const existing = baseDogs.find(d => d.gingrId === Number(gd.animal_id) || d.id === `g${gd.animal_id}`);
      if (existing) return null;
      return {
        id: `g${gd.animal_id}`,
        gingrId: Number(gd.animal_id),
        fields: {
          name: (gd.a_first || "Unknown").trim(),
          breed: gd.breed_name || "",
          weight: null, // Unknown from this API
        },
        _image: null,
      };
    }).filter(Boolean);

    // Merge — avoid duplicating reservations that might already exist
    const existingGingrIds = new Set(baseReservations.map(r => r.gingrId).filter(Boolean));
    const newRes = syntheticRes.filter(r => !existingGingrIds.has(r.gingrId));

    return {
      reservations: [...baseReservations, ...newRes],
      dogs: [...baseDogs, ...syntheticDogs],
    };
  }, [baseReservations, baseDogs, gingrDaycareDogs]);

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

  /* ── TV-005: Private play dogs ─────────────────────────────────────── */
  const privatePlayDogs = useMemo(() => {
    return uniqueDogs.filter(r => hasPrivatePlay(r) || r.type === "dayboarding");
  }, [uniqueDogs]);

  /* ── TV-005: Counts for navigation badges ──────────────────────────── */
  const viewCounts = useMemo(() => ({
    "all": uniqueDogs.length,
    "small-daycare": smallDaycare.length,
    "large-daycare": largeDaycare.length,
    "private-play": privatePlayDogs.length,
    "boarding": boardingDogs.length,
  }), [uniqueDogs, smallDaycare, largeDaycare, privatePlayDogs, boardingDogs]);

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

  /* ── TV-011: View-dependent hero card filter ────────────────────────── *
   * When a filtered view is active (e.g. Small Daycare), only show
   * check-in/check-out hero cards for dogs that belong to that view.
   * "All" view shows everything.
   * ──────────────────────────────────────────────────────────────────── */
  const entryMatchesView = useCallback((entry) => {
    if (activeView === "all") return true;
    const entryDogs = entry.dogs || [entry];
    return entryDogs.some(d => {
      const rType = d.resType || "boarding";
      const isDaycare = DAYCARE_TYPES.has(rType);
      const isBoarding = BOARDING_TYPES.has(rType);
      const isPP = rType === "dayboarding";
      // Look up dog for size classification
      const dog = dogs.find(dd => dd.gingrId === Number(d.animalGingrId) || dd.id === `g${d.animalGingrId}`);
      const size = getDogSize(dog);

      switch (activeView) {
        case "large-daycare":  return isDaycare && size === "large";
        case "small-daycare":  return isDaycare && size === "small";
        case "private-play":   return isPP;
        case "boarding":       return isBoarding;
        default:               return true;
      }
    });
  }, [activeView, dogs]);

  /* ── TV-008d: Compute active and queued check-ins (view-filtered) ──── */
  const viewCheckingIn = checkingIn.filter(entryMatchesView);
  const activeCheckIn = viewCheckingIn.find(e => !e.fading) || viewCheckingIn.find(e => e.fading) || null;
  const fadingCheckIns = activeCheckIn ? viewCheckingIn.filter(e => e.fading && e !== activeCheckIn) : [];
  const queuedCheckIns = viewCheckingIn.filter(e => !e.fading && e !== activeCheckIn);

  /* ── TV-006: Compute active (hero) and queued checkouts (view-filtered) */
  const viewCheckingOut = checkingOut.filter(entryMatchesView);
  const activeCheckout = viewCheckingOut.find(e => !e.fading) || viewCheckingOut.find(e => e.fading) || null;
  const fadingCheckouts = activeCheckout ? viewCheckingOut.filter(e => e.fading && e !== activeCheckout) : [];
  const queuedCheckouts = viewCheckingOut.filter(e => !e.fading && e !== activeCheckout);

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

  /* ── TV-005: Determine which sections to render based on active view ── */
  const showLargeDaycare = activeView === "all" || activeView === "large-daycare";
  const showSmallDaycare = activeView === "all" || activeView === "small-daycare";
  const showBoarding = activeView === "all" || activeView === "boarding";
  const showPrivatePlay = activeView === "all" || activeView === "private-play";

  // For filtered views (not "all"), skip the section header and show a flat grid
  const isFilteredView = activeView !== "all";

  // Get the filtered dogs for single-category views
  const filteredDogList = useMemo(() => {
    switch (activeView) {
      case "small-daycare": return smallDaycare;
      case "large-daycare": return largeDaycare;
      case "private-play": return privatePlayDogs;
      case "boarding": return boardingDogs;
      default: return null; // "all" uses the sectioned layout
    }
  }, [activeView, smallDaycare, largeDaycare, privatePlayDogs, boardingDogs]);

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

      {/* Stats bar — TV-003: Updated with large/small daycare counts */}
      <div style={{ display: "flex", gap: 24, padding: "10px 0", marginBottom: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>Total: <span style={{ fontWeight: 800, color: "#fff" }}>{uniqueDogs.length}</span></div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>
          Large Daycare: <span style={{ fontWeight: 800, color: SIZE_THEME.large.accent }}>{largeDaycare.length}</span>
        </div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>
          Small Daycare: <span style={{ fontWeight: 800, color: SIZE_THEME.small.accent }}>{smallDaycare.length}</span>
        </div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>Private Play: <span style={{ fontWeight: 800, color: "#EF4444" }}>{privatePlayDogs.length}</span></div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>Boarding: <span style={{ fontWeight: 800, color: "#A78BFA" }}>{boardingDogs.length}</span></div>
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

      {/* TV-008d: Check-in hero cards — ABOVE checkout cards */}
      <div style={{
        maxHeight: hasCheckIns ? 500 : 0,
        overflow: "hidden",
        transition: "max-height 0.5s ease, opacity 0.3s ease",
        opacity: hasCheckIns ? 1 : 0,
      }}>
        {activeCheckIn && (
          <HeroCheckInCard
            key={activeCheckIn.id}
            entry={activeCheckIn}
            dogs={dogs}
            animalIcons={animalIcons}
            fading={activeCheckIn.fading}
          />
        )}
        {fadingCheckIns.map(entry => (
          <HeroCheckInCard
            key={entry.id}
            entry={entry}
            dogs={dogs}
            animalIcons={animalIcons}
            fading={true}
          />
        ))}
        {queuedCheckIns.length > 0 && (
          <div style={{ marginTop: 8, marginBottom: 12 }}>
            <div style={{
              fontSize: 11, fontWeight: 700, color: "rgba(56,189,248,0.5)",
              textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6, paddingLeft: 4,
            }}>
              Also arriving ({queuedCheckIns.length})
            </div>
          </div>
        )}
      </div>

      {/* TV-006 + TV-008c: Hero checkout card section with reflow transition */}
      <div style={{
        maxHeight: hasCheckouts ? 500 : 0,
        overflow: "hidden",
        transition: "max-height 0.5s ease, opacity 0.3s ease, margin 0.5s ease",
        opacity: hasCheckouts ? 1 : 0,
        marginBottom: hasCheckouts ? 20 : 0,
      }}>
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

        {/* Fading out cards */}
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

      {/* TV-005 + TV-008c: Grid content with smooth reflow transition */}
      <div key={gridKey} style={{ animation: "tvGridFadeIn 0.35s ease-out", transition: "all 0.4s ease" }}>
        {isFilteredView && filteredDogList ? (
          /* ── Filtered single-category view ────────────────────────────── */
          <>
            {filteredDogList.length > 0 ? (
              <div>
                <SectionLabel
                  label={filteredViewMeta?.label || ""}
                  count={filteredDogList.length}
                  color={filteredViewMeta?.color || "#fff"}
                  subtitle={
                    activeView === "large-daycare" ? `Dogs ${SIZE_THRESHOLD}+ lbs` :
                    activeView === "small-daycare" ? `Dogs under ${SIZE_THRESHOLD} lbs` :
                    activeView === "private-play" ? "Dogs with private play or day boarding" :
                    activeView === "boarding" ? "Overnight boarding dogs" :
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

            {/* Private Play section */}
            {privatePlayDogs.length > 0 && (
              <div>
                <SectionLabel
                  label="Private Play"
                  count={privatePlayDogs.length}
                  color="#EF4444"
                  subtitle="Dogs with private play or day boarding"
                />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
                  {privatePlayDogs.map(r => <DogCard key={r.id} res={r} />)}
                </div>
              </div>
            )}

            {/* Boarding section */}
            {boardingDogs.length > 0 && (
              <div>
                <SectionLabel label="Boarding" count={boardingDogs.length} color="#A78BFA" subtitle="Overnight boarding dogs" />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
                  {boardingDogs.map(r => <DogCard key={r.id} res={r} />)}
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
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.15)" }}>K9 Operations · Auto-refreshes in real-time</div>
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

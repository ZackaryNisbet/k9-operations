// K9 Operations — CheckoutTVPage presentational components
// Extracted verbatim from CheckoutTVPage.jsx. Leaf/presentational components only — no behavior change.

import React, { useState } from "react";
import { getDisplayPlaygroup } from "../../../shared/playgroupAssignments";
import { shouldShowDepartingTodayLabel } from "../checkoutTvDogLabels";
import {
  SIZE_THEME,
  DEFAULT_NOTICE_DURATION_MS,
  CHECKOUT_HEALTH_SPECS,
} from "./checkoutTvConstants";
import { formatRoomDisplay, formatAuditRoomDisplay } from "./checkoutTvRooms";
import {
  healthTone,
  deriveSectionStatus,
  formatHealthAge,
  formatHealthTime,
  formatHealthDuration,
} from "./checkoutTvHealth";
import { sanitizeCheckoutTvSettings, getDogPlaygroup } from "./checkoutTvHelpers";

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
      subtitle="This is scoped to this TV surface only: live Gingr transition detection, Supabase reconciliation, playgroup classification, mid-stay reservations, first-day logic, and photo assets."
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
const DogCard = React.memo(({ res, sizeGroup, dogs, clients, animalIcons, dogPhotoMap, playgroupMap, allDogTags, checkingOutDogIds, firstDayDogIds, currentDateStr, compact = false }) => {
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
  const isDepartingToday = shouldShowDepartingTodayLabel(res, currentDateStr);

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
      {isDepartingToday && (
        <div style={{
          width: "calc(100% + 16px)",
          margin: isFirstDay ? "-6px -8px 6px" : "-8px -8px 6px",
          padding: "4px 0",
          textAlign: "center",
          background: "rgba(251,146,60,0.18)",
          borderBottom: "1.5px solid rgba(251,146,60,0.45)",
          fontSize: 10,
          fontWeight: 900,
          letterSpacing: "0.08em",
          color: "#FDBA74",
        }}>
          DEPARTING TODAY
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

export {
  CountdownCircle,
  SizeBadge,
  HeroCheckoutCard,
  HeroCheckInCard,
  TVNavButton,
  CheckoutTvActionButton,
  CheckoutTvHealthButton,
  TvModalShell,
  SettingsChoice,
  CheckoutTvSettingsModal,
  CheckoutTvHealthModal,
  HealthFact,
  SpotlightNoticeCard,
  SpotlightOverflowRow,
  SpotlightNoticeStage,
  DogCardImage,
  DogCard,
};

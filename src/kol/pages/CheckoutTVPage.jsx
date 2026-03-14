// K9 Operations — CheckoutTVPage
// Isolated page component. See AGENTS.md for development contract.
// Fixes: TV-001 (daycare count), TV-002 (checkout detection), TV-004 (room numbers)

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
  `;
  document.head.appendChild(style);
}

/* ── Room parser (TV-004) ─────────────────────────────────────────────── */
function parseRoom(room) {
  if (!room) return { label: "", number: "" };
  // Matches: "Luxury - 101", "Executive - 301 Private Play", "Double - 2C", "Single - 3A"
  const dashMatch = room.match(/^(.+?)\s*-\s*(\d{1,3}\w*)/);
  if (dashMatch) {
    const typeShort = dashMatch[1].trim().replace(/\s*(Suite|Room|Compartment)/i, "");
    return { label: typeShort, number: dashMatch[2] };
  }
  // "Luxury Suite 1" (fallback numbered) — fake room, suppress number
  const fallbackMatch = room.match(/^(.+?)\s+(\d{1,2})$/);
  if (fallbackMatch) {
    return { label: fallbackMatch[1], number: "" };
  }
  return { label: room, number: "" };
}

/* ── Countdown Timer (SVG circle) ─────────────────────────────────────── */
function CountdownCircle({ remaining, total = 60 }) {
  const size = 56;
  const stroke = 4;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = remaining / total;
  const offset = circumference * (1 - progress);
  const isUrgent = remaining <= 10;
  const color = isUrgent ? "#EF4444" : "#AF8D54";

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1s linear, stroke 0.3s" }} />
      </svg>
      <div style={{
        position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 18, fontWeight: 900, color, fontVariantNumeric: "tabular-nums",
        transition: "color 0.3s",
      }}>
        {remaining}
      </div>
    </div>
  );
}

/* ── Checkout Highlight Card ──────────────────────────────────────────── */
function CheckoutCard({ entry, dogs, clients, fading }) {
  const dog = dogs.find(d => d.gingrId === Number(entry.animalGingrId) || d.id === `g${entry.animalGingrId}`);
  const name = dog?.fields?.name || entry.animalName || "Unknown";
  const breed = dog?.fields?.breed || "";
  const ownerLast = entry.ownerLastName || "";
  const roomInfo = parseRoom(entry.room);
  const image = dog?._image;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 24,
      padding: "20px 28px",
      background: "linear-gradient(135deg, rgba(175,141,84,0.15) 0%, rgba(175,141,84,0.06) 100%)",
      borderRadius: 20,
      border: "2px solid rgba(175,141,84,0.5)",
      animation: fading
        ? "checkoutFadeOut 1s ease-out forwards"
        : "checkoutSlideIn 0.4s ease-out, checkoutPulse 2s ease-in-out infinite",
      minHeight: 100,
    }}>
      {/* Dog image / avatar */}
      {image ? (
        <img src={image} alt={name} style={{
          width: 80, height: 80, borderRadius: 18, objectFit: "cover",
          border: "3px solid rgba(175,141,84,0.6)", flexShrink: 0,
        }} />
      ) : (
        <div style={{
          width: 80, height: 80, borderRadius: 18, flexShrink: 0,
          background: "rgba(175,141,84,0.25)", display: "flex",
          alignItems: "center", justifyContent: "center",
          fontSize: 32, fontWeight: 900, color: "#AF8D54",
        }}>
          {name[0]}
        </div>
      )}

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 12, marginBottom: 4,
        }}>
          <span style={{
            fontSize: 12, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase",
            color: "#AF8D54", background: "rgba(175,141,84,0.15)",
            padding: "3px 10px", borderRadius: 6,
          }}>
            Checking Out
          </span>
          {roomInfo.number && (
            <span style={{
              fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)",
              background: "rgba(255,255,255,0.06)", padding: "3px 10px", borderRadius: 6,
            }}>
              {roomInfo.label} {roomInfo.number}
            </span>
          )}
        </div>
        <div style={{
          fontSize: 28, fontWeight: 900, color: "#fff",
          lineHeight: 1.15, marginBottom: 2,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {name}
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          {breed && <span style={{ fontSize: 13, color: "rgba(255,255,255,0.45)" }}>{breed}</span>}
          {ownerLast && <span style={{ fontSize: 13, color: "rgba(175,141,84,0.7)", fontWeight: 600 }}>{ownerLast}</span>}
        </div>
      </div>

      {/* Countdown */}
      <CountdownCircle remaining={entry.remaining} />
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

  /* ── TV-002: Checkout detection polling ─────────────────────────────── */
  const locationId = profile?.location_id;
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
              return [...newEntries, ...prev];
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
        // Remove entries that have been fading for > 1.2s (animation duration)
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

  const timeStr = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });
  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  /* ── TV-004: DogCard with fixed room parsing ────────────────────────── */
  const DogCard = ({ res }) => {
    const dog = dogs.find(d => d.id === res.dogId);
    const client = clients.find(c => c.id === res.clientId);
    const name = dog?.fields?.name || res._animalName || "Unknown";
    const breed = dog?.fields?.breed || "";
    const ownerLast = client?.fields?.last_name || res._ownerName?.split(" ").pop() || "";
    const roomInfo = parseRoom(res.room);
    const roomDisplay = roomInfo.number
      ? `${roomInfo.label} ${roomInfo.number}`
      : roomInfo.label || "";

    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", padding: "16px 12px",
        background: "rgba(255,255,255,0.06)", borderRadius: 16, border: "1px solid rgba(255,255,255,0.08)",
        minWidth: 140, transition: "transform 0.2s",
      }}>
        {dog?._image ? (
          <img src={dog._image} alt={name} style={{ width: 64, height: 64, borderRadius: 14, objectFit: "cover", border: "2px solid rgba(255,255,255,0.15)", marginBottom: 8 }} />
        ) : (
          <div style={{ width: 64, height: 64, borderRadius: 14, background: "rgba(175,141,84,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 800, color: "#AF8D54", marginBottom: 8 }}>
            {name[0]}
          </div>
        )}
        <div style={{ fontSize: 16, fontWeight: 800, color: "#fff", textAlign: "center", lineHeight: 1.2 }}>{name}</div>
        {breed && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2, textAlign: "center" }}>{breed}</div>}
        <div style={{ fontSize: 11, color: "rgba(175,141,84,0.8)", marginTop: 4, fontWeight: 600 }}>{ownerLast}</div>
        {roomDisplay && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{roomDisplay}</div>}
      </div>
    );
  };

  const SectionLabel = ({ label, count, color }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, marginTop: 24 }}>
      <div style={{ width: 6, height: 28, borderRadius: 3, background: color }} />
      <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", letterSpacing: "0.02em" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.4)" }}>({count})</div>
    </div>
  );

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

      {/* Stats bar */}
      <div style={{ display: "flex", gap: 24, padding: "14px 0", borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)", marginBottom: 8 }}>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>Total: <span style={{ fontWeight: 800, color: "#fff" }}>{uniqueDogs.length}</span></div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>Daycare: <span style={{ fontWeight: 800, color: "#0EA5E9" }}>{daycareDogs.length}</span></div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>Boarding: <span style={{ fontWeight: 800, color: "#AF8D54" }}>{boardingDogs.length}</span></div>
      </div>

      {/* TV-002: Checkout highlight cards */}
      {checkingOut.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 12 }}>
          {checkingOut.map(entry => (
            <CheckoutCard
              key={entry.id}
              entry={entry}
              dogs={dogs}
              clients={clients}
              fading={entry.fading}
            />
          ))}
        </div>
      )}

      {/* Daycare section */}
      {daycareDogs.length > 0 && (
        <div>
          <SectionLabel label="Daycare" count={daycareDogs.length} color="#0EA5E9" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
            {daycareDogs.map(r => <DogCard key={r.id} res={r} />)}
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

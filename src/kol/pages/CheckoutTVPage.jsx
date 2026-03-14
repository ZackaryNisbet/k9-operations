// K9 Operations — CheckoutTVPage
// Isolated page component. See AGENTS.md for development contract.

import React, { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
import ReactDOM from "react-dom";
import { supabase } from "../../supabaseClient";
import { C, OPERATIONS_CATALOG, OPS_TYPES, LITE_DEF_PRICING, CHART_PTS, DEF_CLIENT_FIELDS, DEF_DOG_FIELDS, DEFAULT_LIFECYCLE_BANNERS, LC_OP_LABELS, LC_FILTER_FIELDS, LITE_ACTION_LABELS, LITE_ACTION_LEVELS, DEF_LITE_EOD_TEMPLATE, DAY_NAMES_SHORT, ROOM_TYPES, K9_LOCATIONS, POS_BASE, PAGE_SLUGS, buildUrl, parseUrl, gid, titleCase, fmtPhone, fmtDate, fmtDateFull, fmtDateShort, fmtTime, fmtInstr, todayStr, addDays, formatTime12hr, countNights, countHours, DEF_OPENING_TEMPLATE, DEF_FE_TEMPLATE, DEF_BE_TEMPLATE, DEF_CLOSING_TEMPLATE, LEAN_PERMISSION_AREAS, LEAN_PERMISSION_MATRIX, LEAN_ROLES, NAV_ITEMS, K9_LOGO_SRC, K9_LOGO_PNG, SLUG_TO_PAGE, ENT_SLUG_TO_PAGE, formatDogNames, fmtPhoneInput, IDB_VERSION, idbGet, idbSet } from "../../shared/theme";
import { I, Icons } from "../../shared/icons";
import { Tip, Badge, Btn, CustomSelect, MiniDatePicker, ComplianceCheckItem, Inp, CalendarPicker, Modal, Card, K9Logo, K9LogoMini, isFieldRequired, validateClientFields } from "../../shared/ui";  // formatDogNames, fmtPhoneInput are in theme.js
import { hasPermission, hasLeanPermission, _resolveRole, LEGACY_ROLE_MAP, ROLE_CODE_MAP } from "../../shared/permissions";
import { classifyReservationType, classifyReservationStatus, extractRoomFromType, getRoomCleaningStats, resSvcIncludes, getPPStats, getOpsCardStatus, getOpsProgress, getOpsCountLabel } from "../../shared/opsHelpers";
import K9LoadingAnimation from "../../shared/K9LoadingAnimation";
import InteractiveLineChart from "../../shared/InteractiveLineChart";
import LocationSelector from "../../shared/LocationSelector";
import { applyStructuredFilters } from "../../hooks/useFilters";

function CheckoutTVPage({ data, nav }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const today = todayStr();
  const reservations = data.reservations || [];
  const dogs = data.dogs || [];
  const clients = data.clients || [];

  // All checked-in daycare + boarding dogs
  const checkedIn = reservations.filter(r =>
    (r.type === "boarding" || r.type === "daycare") &&
    r.status === "checked-in" &&
    r.checkIn <= today && r.checkOut >= today
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
    return ((aD?.fields?.name || "").localeCompare(bD?.fields?.name || ""));
  });

  const daycareDogs = uniqueDogs.filter(r => r.type === "daycare");
  const boardingDogs = uniqueDogs.filter(r => r.type === "boarding");

  const timeStr = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });
  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  const DogCard = ({ res }) => {
    const dog = dogs.find(d => d.id === res.dogId);
    const client = clients.find(c => c.id === res.clientId);
    const name = dog?.fields?.name || res._animalName || "Unknown";
    const breed = dog?.fields?.breed || "";
    const ownerLast = client?.fields?.last_name || res._ownerName?.split(" ").pop() || "";
    const roomNum = res.room ? (res.room.match(/(\d+)/) || [])[1] || "" : "";

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
        {roomNum && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>Room {roomNum}</div>}
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
          <div style={{ fontSize: 28, fontWeight: 900, color: "#fff", letterSpacing: "-0.02em" }}>K9 Adair Forsythe</div>
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

      {uniqueDogs.length === 0 && (
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

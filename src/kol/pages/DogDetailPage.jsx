// K9 Operations — DogDetailPage
// Isolated page component. See AGENTS.md for development contract.
// CLM-006: Enhanced with feeding schedule, medications, immunizations, vet contact, animal photo, temperament

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

// ─── Collapsible Section Component ──────────────────────────────────────────
function CollapsibleSection({ title, icon, badge, badgeColor, defaultOpen = false, children, urgentCount }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card style={{ marginBottom: 16, overflow: "hidden" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", width: "100%", padding: "16px 22px",
          background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
          gap: 10, transition: "background 0.15s",
        }}
        onMouseEnter={e => { e.currentTarget.style.background = C.surfaceHover; }}
        onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
      >
        <span style={{ fontSize: 18, lineHeight: 1 }}>{icon}</span>
        <span style={{ fontSize: 15, fontWeight: 700, color: C.text, flex: 1, textAlign: "left" }}>{title}</span>
        {urgentCount > 0 && (
          <span style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            minWidth: 20, height: 20, borderRadius: 10, padding: "0 6px",
            background: C.dan, color: "#fff", fontSize: 10, fontWeight: 800,
          }}>{urgentCount}</span>
        )}
        {badge && (
          <span style={{
            display: "inline-flex", padding: "3px 10px", borderRadius: 20,
            background: badgeColor === "green" ? C.sucLt : badgeColor === "red" ? C.danLt : badgeColor === "amber" ? "#FEF3C7" : C.priLt,
            color: badgeColor === "green" ? C.suc : badgeColor === "red" ? C.dan : badgeColor === "amber" ? "#92400E" : C.pri,
            fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em",
          }}>{badge}</span>
        )}
        <span style={{
          fontSize: 12, color: C.textMut, transition: "transform 0.2s",
          transform: open ? "rotate(180deg)" : "rotate(0deg)", lineHeight: 1,
        }}>&#9660;</span>
      </button>
      {open && (
        <div style={{ padding: "0 22px 18px", animation: "fadeIn 0.15s ease" }}>
          {children}
        </div>
      )}
    </Card>
  );
}

// ─── Immunization Status Helper ─────────────────────────────────────────────
function getImmunizationStatus(expirationDate, today) {
  if (!expirationDate) return { label: "Unknown", color: C.textMut, bg: C.surfaceHover };
  const exp = expirationDate.split("T")[0];
  if (exp < today) return { label: "Expired", color: C.dan, bg: C.danLt };
  const soon = new Date(); soon.setDate(soon.getDate() + 30);
  const soonStr = soon.toISOString().split("T")[0];
  if (exp <= soonStr) return { label: "Expiring Soon", color: "#92400E", bg: "#FEF3C7" };
  return { label: "Current", color: C.suc, bg: C.sucLt };
}

// ─── Row Display Helper ─────────────────────────────────────────────────────
function InfoRow({ label, value, highlight }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "baseline" }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", minWidth: 90, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: highlight ? 700 : 500, color: highlight || C.text, lineHeight: 1.5 }}>{value}</span>
    </div>
  );
}


function DogDetailPage({ data, clientId, dogId, nav, profile }) {
  const client = data.clients.find(c => c.id === clientId);
  const dog = data.dogs.find(d => d.id === dogId);
  if (!dog || !client) return <div style={{ padding: "64px 24px", textAlign: "center" }}><div style={{ width: 56, height: 56, borderRadius: 16, background: C.warnLt, display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 14, fontSize: 22 }}>?</div><div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 6 }}>Dog not found</div><div style={{ fontSize: 13, color: C.textMut }}>This dog profile may have been removed or the link is invalid.</div></div>;
  const df = dog.fields || {};

  // ─── Enrichment data state ──────────────────────────────────────────────
  const [feedingSchedules, setFeedingSchedules] = useState([]);
  const [medications, setMedications] = useState([]);
  const [immunizations, setImmunizations] = useState([]);
  const [vets, setVets] = useState([]);
  const [animalIcon, setAnimalIcon] = useState(null);
  const [enrichmentLoading, setEnrichmentLoading] = useState(true);
  const [dogPhotos, setDogPhotos] = useState([]);
  const [dogPhotosLoading, setDogPhotosLoading] = useState(true);
  const [expandedPhotoUrl, setExpandedPhotoUrl] = useState(null);

  // ─── Fetch enrichment data from Supabase ────────────────────────────────
  useEffect(() => {
    if (!profile?.location_id || !dog.gingrId) {
      setEnrichmentLoading(false);
      return;
    }
    const locId = profile.location_id;
    const animalGingrId = dog.gingrId;
    let cancelled = false;

    const fetchAll = async () => {
      setEnrichmentLoading(true);
      try {
        const [feedRes, medRes, immRes, vetRes, iconRes] = await Promise.all([
          supabase.from("gingr_feeding_schedules").select("*").eq("location_id", locId).eq("animal_gingr_id", animalGingrId).eq("is_active", true),
          supabase.from("gingr_medications").select("*").eq("location_id", locId).eq("animal_gingr_id", animalGingrId),
          supabase.from("gingr_immunizations").select("*").eq("location_id", locId).eq("animal_gingr_id", animalGingrId),
          supabase.from("gingr_vets").select("*").eq("location_id", locId).eq("animal_gingr_id", animalGingrId).eq("is_active", true),
          supabase.from("gingr_animal_icons").select("*").eq("location_id", locId).eq("animal_gingr_id", animalGingrId).order("is_primary", { ascending: false }).limit(1),
        ]);
        if (cancelled) return;
        if (feedRes.data) setFeedingSchedules(feedRes.data);
        if (medRes.data) setMedications(medRes.data);
        if (immRes.data) setImmunizations(immRes.data);
        if (vetRes.data) setVets(vetRes.data);
        if (iconRes.data && iconRes.data.length > 0) setAnimalIcon(iconRes.data[0]);
      } catch (e) {
        // Silently handle — enrichment data is supplemental
      }
      if (!cancelled) setEnrichmentLoading(false);
    };
    fetchAll();
    return () => { cancelled = true; };
  }, [profile?.location_id, dog.gingrId]);

  // ─── Fetch dog photos from Supabase ────────────────────────────────────
  useEffect(() => {
    if (!dog.gingrId) { setDogPhotosLoading(false); return; }
    let cancelled = false;
    const fetchPhotos = async () => {
      setDogPhotosLoading(true);
      const { data: rows } = await supabase
        .from("photos")
        .select("*")
        .eq("paired_dog_id", dog.gingrId)
        .order("taken_at", { ascending: false });
      if (!cancelled && rows) setDogPhotos(rows);
      if (!cancelled) setDogPhotosLoading(false);
    };
    fetchPhotos();
    return () => { cancelled = true; };
  }, [dog.gingrId]);

  // ─── Reservation data ───────────────────────────────────────────────────
  const allReservations = (data.reservations || []).filter(r => r.dogId === dogId).sort((a, b) => b.checkIn.localeCompare(a.checkIn));
  const activeRes = allReservations.filter(r => r.status === "checked-in" || r.status === "upcoming");
  const pastRes = allReservations.filter(r => r.status === "checked-out" || r.status === "completed" || r.status === "no-show");
  const today = todayStr();

  // ─── Active services ────────────────────────────────────────────────────
  const activeServices = [];
  activeRes.forEach(r => {
    const svcs = r._services;
    if (!svcs) return;
    const arr = Array.isArray(svcs) ? svcs : [];
    arr.forEach(s => {
      const name = typeof s === "string" ? s : (s && s.name ? s.name : "");
      if (name && !activeServices.includes(name)) activeServices.push(name);
    });
  });

  // ─── Derived enrichment data ────────────────────────────────────────────
  const activeMeds = medications.filter(m => m.is_active);
  const inactiveMeds = medications.filter(m => !m.is_active);
  const expiredImms = immunizations.filter(i => {
    if (!i.expiration_date) return false;
    return i.expiration_date.split("T")[0] < today;
  });
  const expiringImms = immunizations.filter(i => {
    if (!i.expiration_date) return false;
    const exp = i.expiration_date.split("T")[0];
    if (exp < today) return false;
    const soon = new Date(); soon.setDate(soon.getDate() + 30);
    return exp <= soon.toISOString().split("T")[0];
  });
  const urgentImmCount = expiredImms.length + expiringImms.length;

  // Medications that are due (active with end_date approaching)
  const medsDueSoon = activeMeds.filter(m => {
    if (!m.end_date) return false;
    const end = m.end_date.split("T")[0];
    if (end < today) return true;
    const soon = new Date(); soon.setDate(soon.getDate() + 7);
    return end <= soon.toISOString().split("T")[0];
  });

  // Temperament data from raw_data or fields
  const temperament = df.temperament || dog._temperament || dog.raw_data?.temperament || null;

  // Primary vet
  const primaryVet = vets.find(v => v.is_primary) || vets[0] || null;

  // Photo URL: prefer Supabase icon, fallback to dog._image
  const photoUrl = animalIcon?.icon_url || dog._image || null;

  // Gender label
  const genderLabel = dog._gender === "male" ? "Male" : dog._gender === "female" ? "Female" : dog._gender || "";
  const fixedLabel = df.spayed_neutered ? (dog._gender === "male" ? "Neutered" : "Spayed") : "Intact";

  const labelStyle = { fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 };
  const sectionTitle = { fontSize: 15, fontWeight: 700, color: C.text, margin: "0 0 10px" };

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      {/* Back button */}
      <button onClick={() => nav("client-detail", { clientId })} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: C.textSec, fontSize: 13, fontWeight: 600, padding: 0, marginBottom: 16, fontFamily: "inherit" }}>
        ← Back to {client.fields.first_name} {client.fields.last_name}
      </button>

      {/* Hero Card */}
      <Card style={{ padding: "24px 28px", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 20 }}>
          {/* Dog Photo / Avatar */}
          {photoUrl ? (
            <img src={photoUrl} alt={dog.fields.name} style={{ width: 88, height: 88, borderRadius: 18, objectFit: "cover", border: `3px solid ${C.border}`, boxShadow: "0 2px 12px rgba(0,0,0,0.08)" }} />
          ) : (
            <div style={{ width: 88, height: 88, borderRadius: 18, background: `linear-gradient(135deg, ${C.priLt}, ${C.accLt})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, fontWeight: 800, color: C.pri, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
              {(dog.fields.name || "?")[0]}
            </div>
          )}
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h2 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: C.text, fontFamily: "'Outfit', sans-serif", letterSpacing: "-0.02em" }}>{dog.fields.name}</h2>
              {dog._vip && <span style={{ display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: 20, background: "#FEF3C7", color: "#92400E", fontSize: 10, fontWeight: 700, letterSpacing: "0.04em" }}>VIP</span>}
              {dog._banned && <span style={{ display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: 20, background: C.danLt, color: C.dan, fontSize: 10, fontWeight: 700, letterSpacing: "0.04em" }}>BANNED</span>}
            </div>
            <div style={{ fontSize: 14, color: C.textSec, marginTop: 4 }}>
              {dog.fields.breed}{dog.fields.weight ? ` · ${dog.fields.weight} lbs` : ""}{genderLabel ? ` · ${genderLabel}` : ""}{dog.fields.age ? ` · ${dog.fields.age} yrs` : ""} · {fixedLabel}
            </div>
            {/* Tags: active services as pills */}
            {activeServices.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                {activeServices.map(svc => (
                  <span key={svc} style={{ display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: 6, background: C.priLt, color: C.pri, fontSize: 11, fontWeight: 600 }}>{svc}</span>
                ))}
              </div>
            )}
            {/* Quick status badges for urgent items */}
            {(urgentImmCount > 0 || medsDueSoon.length > 0) && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                {expiredImms.length > 0 && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 6, background: C.danLt, color: C.dan, fontSize: 11, fontWeight: 700 }}>
                    {expiredImms.length} expired vaccine{expiredImms.length > 1 ? "s" : ""}
                  </span>
                )}
                {expiringImms.length > 0 && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 6, background: "#FEF3C7", color: "#92400E", fontSize: 11, fontWeight: 700 }}>
                    {expiringImms.length} expiring soon
                  </span>
                )}
                {medsDueSoon.length > 0 && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 6, background: C.warnLt, color: C.warn, fontSize: 11, fontWeight: 700 }}>
                    {medsDueSoon.length} med{medsDueSoon.length > 1 ? "s" : ""} ending soon
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Immunization notice (legacy) */}
        {dog._nextImm && typeof dog._nextImm === "string" && (() => {
          const immDate = dog._nextImm.split("T")[0];
          const isExpired = immDate < today;
          const isSoon = !isExpired && immDate <= (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split("T")[0]; })();
          if (!isExpired && !isSoon) return null;
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderRadius: 10, background: isExpired ? C.danLt : "#FEF3C7", border: `1px solid ${isExpired ? C.dan + "30" : "#F59E0B30"}`, marginTop: 16 }}>
              <span style={{ fontSize: 16 }}>{isExpired ? "\u26A0\uFE0F" : "\uD83D\uDCCB"}</span>
              <div style={{ fontSize: 13, color: isExpired ? C.dan : "#92400E", fontWeight: 600 }}>
                {isExpired ? "Immunizations expired" : "Immunizations expiring soon"} — next expiration: {immDate}
              </div>
            </div>
          );
        })()}
      </Card>

      {/* Detail Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        {/* Notes Card */}
        {(dog._notes || dog._allergies || dog._medicines || dog._groomingNotes) && (
          <Card style={{ padding: "18px 22px", gridColumn: dog._notes && dog._notes.length > 100 ? "1 / -1" : undefined }}>
            <div style={sectionTitle}>Notes & Care</div>
            {dog._notes && (
              <div style={{ marginBottom: 12 }}>
                <div style={labelStyle}>General Notes</div>
                <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{dog._notes}</div>
              </div>
            )}
            {dog._allergies && (
              <div style={{ marginBottom: 12 }}>
                <div style={labelStyle}>Allergies</div>
                <div style={{ fontSize: 13, color: C.dan, fontWeight: 600 }}>{dog._allergies}</div>
              </div>
            )}
            {dog._medicines && (
              <div style={{ marginBottom: 12 }}>
                <div style={labelStyle}>Medications</div>
                <div style={{ fontSize: 13, color: C.text }}>{dog._medicines}</div>
              </div>
            )}
            {dog._groomingNotes && (
              <div>
                <div style={labelStyle}>Grooming Notes</div>
                <div style={{ fontSize: 13, color: C.text }}>{dog._groomingNotes}</div>
              </div>
            )}
          </Card>
        )}

        {/* Owner Card */}
        <Card style={{ padding: "18px 22px" }}>
          <div style={sectionTitle}>Owner</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: C.priLt, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800, color: C.pri }}>
              {(client.fields.first_name || "?")[0]}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, cursor: "pointer" }} onClick={() => nav("client-detail", { clientId })}>
                {client.fields.first_name} {client.fields.last_name}
              </div>
              {client.fields.phone && <div style={{ fontSize: 12, color: C.textSec }}>{client.fields.phone}</div>}
              {client.fields.email && <div style={{ fontSize: 12, color: C.textSec }}>{client.fields.email}</div>}
            </div>
          </div>
        </Card>
      </div>

      {/* ─── ENRICHMENT SECTIONS ──────────────────────────────────────────── */}
      {enrichmentLoading && (
        <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
          <K9LoadingAnimation />
        </div>
      )}

      {!enrichmentLoading && (
        <>
          {/* 1. Feeding Schedule */}
          {feedingSchedules.length > 0 && (
            <CollapsibleSection
              title="Feeding Schedule"
              icon={"\uD83C\uDF56"}
              badge={`${feedingSchedules.length} schedule${feedingSchedules.length > 1 ? "s" : ""}`}
              badgeColor="blue"
              defaultOpen={true}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {feedingSchedules.map((fs, idx) => (
                  <div key={fs.id || idx} style={{
                    padding: "14px 18px", borderRadius: 10,
                    background: C.bg, border: `1px solid ${C.borderLight}`,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      {fs.food_type && (
                        <span style={{
                          display: "inline-flex", padding: "2px 10px", borderRadius: 6,
                          background: C.accLt, color: C.accDk, fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                        }}>{fs.food_type}</span>
                      )}
                      {fs.frequency && (
                        <span style={{
                          display: "inline-flex", padding: "2px 10px", borderRadius: 6,
                          background: C.priLt, color: C.pri, fontSize: 10, fontWeight: 700,
                        }}>{fs.frequency}</span>
                      )}
                      {fs.schedule_time && (
                        <span style={{ fontSize: 12, color: C.textSec, fontWeight: 600 }}>{fs.schedule_time}</span>
                      )}
                    </div>
                    <InfoRow label="Brand" value={fs.food_brand} />
                    <InfoRow label="Amount" value={fs.amount} />
                    {fs.special_instructions && (
                      <div style={{
                        marginTop: 8, padding: "8px 12px", borderRadius: 8,
                        background: "#FEF3C7", border: "1px solid #F59E0B20",
                      }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#92400E", textTransform: "uppercase", letterSpacing: "0.05em" }}>Special Instructions</span>
                        <div style={{ fontSize: 13, color: "#78350F", marginTop: 4, lineHeight: 1.5 }}>{fs.special_instructions}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* 2. Medications */}
          {medications.length > 0 && (
            <CollapsibleSection
              title="Medications"
              icon={"\uD83D\uDC8A"}
              badge={`${activeMeds.length} active`}
              badgeColor={medsDueSoon.length > 0 ? "amber" : "green"}
              defaultOpen={true}
              urgentCount={medsDueSoon.length}
            >
              {activeMeds.length > 0 && (
                <div style={{ marginBottom: inactiveMeds.length > 0 ? 16 : 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.suc, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Active Medications</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {activeMeds.map((med, idx) => {
                      const isEnding = med.end_date && (() => {
                        const end = med.end_date.split("T")[0];
                        if (end < today) return "ended";
                        const soon = new Date(); soon.setDate(soon.getDate() + 7);
                        return end <= soon.toISOString().split("T")[0] ? "ending" : null;
                      })();
                      return (
                        <div key={med.id || idx} style={{
                          padding: "14px 18px", borderRadius: 10,
                          background: isEnding === "ended" ? C.danLt : isEnding === "ending" ? "#FFFBEB" : C.bg,
                          border: `1px solid ${isEnding === "ended" ? C.dan + "30" : isEnding === "ending" ? "#F59E0B30" : C.borderLight}`,
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{med.medication_name}</span>
                            {isEnding === "ended" && (
                              <span style={{ display: "inline-flex", padding: "2px 8px", borderRadius: 6, background: C.dan, color: "#fff", fontSize: 9, fontWeight: 800, textTransform: "uppercase" }}>Course Ended</span>
                            )}
                            {isEnding === "ending" && (
                              <span style={{ display: "inline-flex", padding: "2px 8px", borderRadius: 6, background: C.warn, color: "#fff", fontSize: 9, fontWeight: 800, textTransform: "uppercase" }}>Ending Soon</span>
                            )}
                          </div>
                          <InfoRow label="Dosage" value={med.dosage} />
                          <InfoRow label="Frequency" value={med.frequency} />
                          <InfoRow label="Route" value={med.administration_route} />
                          <InfoRow label="Prescribed by" value={med.prescribed_by} />
                          {(med.start_date || med.end_date) && (
                            <InfoRow label="Period" value={`${med.start_date ? fmtDateShort(med.start_date) : "—"} → ${med.end_date ? fmtDateShort(med.end_date) : "Ongoing"}`} />
                          )}
                          {med.special_instructions && (
                            <div style={{
                              marginTop: 6, padding: "6px 10px", borderRadius: 6,
                              background: C.priLt, fontSize: 12, color: C.pri, lineHeight: 1.5,
                            }}>
                              {med.special_instructions}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {inactiveMeds.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Past Medications</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {inactiveMeds.map((med, idx) => (
                      <div key={med.id || idx} style={{
                        padding: "10px 16px", borderRadius: 8,
                        background: C.surfaceHover, border: `1px solid ${C.borderLight}`,
                        opacity: 0.7,
                      }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: C.textSec }}>{med.medication_name}</span>
                          <span style={{ fontSize: 11, color: C.textMut }}>
                            {med.dosage}{med.frequency ? ` · ${med.frequency}` : ""}
                            {med.end_date ? ` · ended ${fmtDateShort(med.end_date)}` : ""}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CollapsibleSection>
          )}

          {/* 3. Immunizations */}
          {immunizations.length > 0 && (
            <CollapsibleSection
              title="Immunization Records"
              icon={"\uD83D\uDC89"}
              badge={expiredImms.length > 0 ? `${expiredImms.length} expired` : expiringImms.length > 0 ? `${expiringImms.length} expiring` : `${immunizations.length} on file`}
              badgeColor={expiredImms.length > 0 ? "red" : expiringImms.length > 0 ? "amber" : "green"}
              defaultOpen={urgentImmCount > 0}
              urgentCount={urgentImmCount}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {immunizations
                  .sort((a, b) => {
                    // Sort expired first, then expiring, then current
                    const sa = getImmunizationStatus(a.expiration_date, today);
                    const sb = getImmunizationStatus(b.expiration_date, today);
                    const order = { "Expired": 0, "Expiring Soon": 1, "Current": 2, "Unknown": 3 };
                    return (order[sa.label] ?? 3) - (order[sb.label] ?? 3);
                  })
                  .map((imm, idx) => {
                    const status = getImmunizationStatus(imm.expiration_date, today);
                    return (
                      <div key={imm.id || idx} style={{
                        display: "flex", alignItems: "center", gap: 14,
                        padding: "12px 16px", borderRadius: 10,
                        background: status.label === "Expired" ? C.danLt : status.label === "Expiring Soon" ? "#FFFBEB" : C.bg,
                        border: `1px solid ${status.label === "Expired" ? C.dan + "25" : status.label === "Expiring Soon" ? "#F59E0B25" : C.borderLight}`,
                      }}>
                        {/* Status dot */}
                        <div style={{
                          width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
                          background: status.color,
                          boxShadow: status.label === "Expired" ? `0 0 6px ${C.dan}60` : status.label === "Expiring Soon" ? "0 0 6px #F59E0B60" : "none",
                        }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{imm.vaccination_name || "Unknown Vaccine"}</span>
                            <span style={{
                              display: "inline-flex", padding: "1px 8px", borderRadius: 5,
                              background: status.bg, color: status.color,
                              fontSize: 9, fontWeight: 800, textTransform: "uppercase",
                            }}>{status.label}</span>
                            {imm.is_verified && (
                              <span style={{ display: "inline-flex", padding: "1px 8px", borderRadius: 5, background: C.sucLt, color: C.suc, fontSize: 9, fontWeight: 700, textTransform: "uppercase" }}>Verified</span>
                            )}
                          </div>
                          <div style={{ display: "flex", gap: 16, marginTop: 4, flexWrap: "wrap" }}>
                            {imm.date_administered && (
                              <span style={{ fontSize: 11, color: C.textSec }}>Given: {fmtDateShort(imm.date_administered)}</span>
                            )}
                            {imm.expiration_date && (
                              <span style={{ fontSize: 11, color: status.color, fontWeight: status.label !== "Current" ? 700 : 500 }}>
                                Expires: {fmtDateShort(imm.expiration_date)}
                              </span>
                            )}
                            {imm.administered_by && (
                              <span style={{ fontSize: 11, color: C.textMut }}>By: {imm.administered_by}</span>
                            )}
                            {imm.lot_number && (
                              <span style={{ fontSize: 11, color: C.textMut }}>Lot: {imm.lot_number}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </CollapsibleSection>
          )}

          {/* 4. Veterinary Contact */}
          {vets.length > 0 && (
            <CollapsibleSection
              title="Veterinary Contact"
              icon={"\uD83C\uDFE5"}
              badge={primaryVet?.is_primary ? "Primary" : undefined}
              badgeColor="blue"
              defaultOpen={false}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {vets.map((vet, idx) => (
                  <div key={vet.id || idx} style={{
                    padding: "14px 18px", borderRadius: 10,
                    background: vet.is_primary ? C.priLt : C.bg,
                    border: `1px solid ${vet.is_primary ? C.pri + "20" : C.borderLight}`,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 10,
                        background: vet.is_primary ? C.pri : C.surfaceHover,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 16, color: vet.is_primary ? "#fff" : C.textSec,
                      }}>{"\uD83E\uDE7A"}</div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{vet.vet_name}</div>
                        {vet.clinic_name && <div style={{ fontSize: 12, color: C.textSec }}>{vet.clinic_name}</div>}
                      </div>
                      {vet.is_primary && (
                        <span style={{
                          marginLeft: "auto",
                          display: "inline-flex", padding: "2px 8px", borderRadius: 6,
                          background: C.pri, color: "#fff",
                          fontSize: 9, fontWeight: 800, textTransform: "uppercase",
                        }}>Primary</span>
                      )}
                    </div>
                    {vet.phone && (
                      <InfoRow label="Phone" value={
                        <a href={`tel:${vet.phone}`} style={{ color: C.pri, textDecoration: "none", fontWeight: 600 }}>
                          {fmtPhone(vet.phone)}
                        </a>
                      } />
                    )}
                    {vet.email && <InfoRow label="Email" value={vet.email} />}
                    {(vet.address || vet.city) && (
                      <InfoRow label="Address" value={[vet.address, vet.city, vet.state, vet.zip].filter(Boolean).join(", ")} />
                    )}
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* 5. Temperament */}
          {temperament && (
            <CollapsibleSection
              title="Temperament Assessment"
              icon={"\uD83D\uDC3E"}
              defaultOpen={false}
            >
              {typeof temperament === "string" ? (
                <div style={{
                  padding: "14px 18px", borderRadius: 10,
                  background: C.bg, border: `1px solid ${C.borderLight}`,
                  fontSize: 13, color: C.text, lineHeight: 1.6, whiteSpace: "pre-wrap",
                }}>{temperament}</div>
              ) : typeof temperament === "object" ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {Object.entries(temperament).map(([key, val]) => (
                    <div key={key} style={{
                      padding: "10px 16px", borderRadius: 8,
                      background: C.bg, border: `1px solid ${C.borderLight}`,
                    }}>
                      <InfoRow label={titleCase(key.replace(/_/g, " "))} value={typeof val === "object" ? JSON.stringify(val) : String(val)} />
                    </div>
                  ))}
                </div>
              ) : null}
            </CollapsibleSection>
          )}

          {/* 6. Photos Gallery */}
          {!dogPhotosLoading && dogPhotos.length > 0 && (
            <CollapsibleSection
              title="Photos"
              icon={"\uD83D\uDCF7"}
              badge={`${dogPhotos.length} photo${dogPhotos.length !== 1 ? "s" : ""}`}
              badgeColor="blue"
              defaultOpen={false}
            >
              <div style={{ overflowX: "auto", paddingBottom: 4 }}>
                <div style={{ display: "flex", gap: 10, minWidth: "min-content" }}>
                  {dogPhotos.map(photo => {
                    const imgUrl = photo.storage_path
                      ? `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/pet-photos/${photo.storage_path}`
                      : null;
                    return (
                      <div
                        key={photo.id}
                        onClick={() => imgUrl && setExpandedPhotoUrl(imgUrl)}
                        style={{
                          flex: "0 0 auto", width: 110, cursor: imgUrl ? "pointer" : "default",
                          borderRadius: 10, overflow: "hidden",
                          border: `1px solid ${C.borderLight}`, transition: "transform 0.15s",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.04)"; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}
                      >
                        {imgUrl ? (
                          <img src={imgUrl} alt={photo.paired_dog_name || "Photo"} loading="lazy"
                            style={{ width: 110, height: 90, objectFit: "cover", display: "block" }} />
                        ) : (
                          <div style={{ width: 110, height: 90, background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", color: C.textMut, fontSize: 10 }}>No image</div>
                        )}
                        <div style={{ padding: "5px 8px", fontSize: 10, color: C.textMut, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {photo.taken_at ? fmtDateShort(photo.taken_at) : ""}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CollapsibleSection>
          )}
        </>
      )}

      {/* Expanded Photo Modal */}
      {expandedPhotoUrl && (
        <Modal title="Photo" onClose={() => setExpandedPhotoUrl(null)}>
          <img
            src={expandedPhotoUrl}
            alt="Full size"
            style={{ width: "100%", borderRadius: 10, objectFit: "contain", maxHeight: "70vh" }}
          />
        </Modal>
      )}

      {/* Active Reservations */}
      {activeRes.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={sectionTitle}>Active Reservations</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {activeRes.map(r => {
              const svcs = r._services;
              const svcNames = svcs ? (Array.isArray(svcs) ? svcs : []).map(s => typeof s === "string" ? s : (s && s.name ? s.name : "")).filter(Boolean) : [];
              return (
                <Card key={r.id} style={{ padding: "14px 20px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{r._resTypeName || titleCase(r.type)}</span>
                        <span style={{ display: "inline-flex", padding: "2px 8px", borderRadius: 6, background: r.status === "checked-in" ? C.sucLt : C.priLt, color: r.status === "checked-in" ? C.suc : C.pri, fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>{r.status}</span>
                        {r.room && <span style={{ display: "inline-flex", padding: "2px 8px", borderRadius: 6, background: C.accLt, color: C.acc, fontSize: 10, fontWeight: 700 }}>Room {(r.room.match(/(\d+[A-Za-z]*)$/) || [])[1] || r.room}</span>}
                      </div>
                      <div style={{ fontSize: 12, color: C.textSec }}>{r.checkIn} → {r.checkOut}{r.pricing?.total ? ` · $${r.pricing.total.toFixed(2)}` : ""}</div>
                    </div>
                    {svcNames.length > 0 && (
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {svcNames.slice(0, 5).map(s => <span key={s} style={{ padding: "2px 8px", borderRadius: 5, background: C.surfaceHover, fontSize: 10, color: C.textSec, fontWeight: 600 }}>{s}</span>)}
                        {svcNames.length > 5 && <span style={{ fontSize: 10, color: C.textMut }}>+{svcNames.length - 5}</span>}
                      </div>
                    )}
                  </div>
                  {r._notes && <div style={{ fontSize: 12, color: C.acc, marginTop: 6, fontStyle: "italic" }}>Note: {r._notes}</div>}
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Past Reservations */}
      {pastRes.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={sectionTitle}>Reservation History ({pastRes.length})</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {pastRes.slice(0, 20).map(r => (
              <Card key={r.id} style={{ padding: "10px 18px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.textSec }}>{r._resTypeName || titleCase(r.type)}</span>
                    <span style={{ fontSize: 11, color: C.textMut }}>{r.checkIn} → {r.checkOut}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {r.pricing?.total > 0 && <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>${r.pricing.total.toFixed(2)}</span>}
                    <span style={{ display: "inline-flex", padding: "2px 6px", borderRadius: 4, background: r.status === "checked-out" ? C.surfaceHover : C.danLt, color: r.status === "checked-out" ? C.textMut : C.dan, fontSize: 9, fontWeight: 700, textTransform: "uppercase" }}>{r.status}</span>
                  </div>
                </div>
              </Card>
            ))}
            {pastRes.length > 20 && <div style={{ fontSize: 12, color: C.textMut, textAlign: "center", padding: 8 }}>+ {pastRes.length - 20} older reservations</div>}
          </div>
        </div>
      )}

      {activeRes.length === 0 && pastRes.length === 0 && (
        <Card style={{ padding: "48px 24px", textAlign: "center" }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: C.priLt, display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 14, fontSize: 20 }}>
            <I.Calendar />
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 6 }}>No reservations yet</div>
          <div style={{ fontSize: 13, color: C.textMut, lineHeight: 1.5 }}>No reservation history found for {df.name || "this dog"}.</div>
        </Card>
      )}
    </div>
  );
}



export default DogDetailPage;

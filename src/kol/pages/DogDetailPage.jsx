// K9 Operations — DogDetailPage
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

function DogDetailPage({ data, clientId, dogId, nav }) {
  const client = data.clients.find(c => c.id === clientId);
  const dog = data.dogs.find(d => d.id === dogId);
  if (!dog || !client) return <div style={{ padding: 40, textAlign: "center", color: C.textSec }}>Dog not found</div>;
  const df = dog.fields || {}; // safe access to dog fields

  const allReservations = (data.reservations || []).filter(r => r.dogId === dogId).sort((a, b) => b.checkIn.localeCompare(a.checkIn));
  const activeRes = allReservations.filter(r => r.status === "checked-in" || r.status === "upcoming");
  const pastRes = allReservations.filter(r => r.status === "checked-out" || r.status === "completed" || r.status === "no-show");
  const today = todayStr();

  // Build service list from all active reservations
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

  const labelStyle = { fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 };
  const valStyle = { fontSize: 14, fontWeight: 600, color: C.text };
  const sectionTitle = { fontSize: 15, fontWeight: 700, color: C.text, margin: "0 0 10px" };

  // Gender label
  const genderLabel = dog._gender === "male" ? "Male" : dog._gender === "female" ? "Female" : dog._gender || "";
  const fixedLabel = df.spayed_neutered ? (dog._gender === "male" ? "Neutered" : "Spayed") : "Intact";

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      {/* Back button */}
      <button onClick={() => nav("client-detail", { clientId })} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: C.textSec, fontSize: 13, fontWeight: 600, padding: 0, marginBottom: 16, fontFamily: "inherit" }}>
        ← Back to {client.fields.first_name} {client.fields.last_name}
      </button>

      {/* Hero Card */}
      <Card style={{ padding: "24px 28px", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 20 }}>
          {/* Dog Avatar */}
          {dog._image ? (
            <img src={dog._image} alt={dog.fields.name} style={{ width: 72, height: 72, borderRadius: 16, objectFit: "cover", border: `2px solid ${C.border}` }} />
          ) : (
            <div style={{ width: 72, height: 72, borderRadius: 16, background: C.priLt, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 800, color: C.pri }}>
              {(dog.fields.name || "?")[0]}
            </div>
          )}
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: C.text }}>{dog.fields.name}</h2>
              {dog._vip && <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 6, background: "#FEF3C7", color: "#92400E", fontSize: 10, fontWeight: 700, letterSpacing: "0.04em" }}>VIP</span>}
              {dog._banned && <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 6, background: C.danLt, color: C.dan, fontSize: 10, fontWeight: 700, letterSpacing: "0.04em" }}>BANNED</span>}
            </div>
            <div style={{ fontSize: 14, color: C.textSec, marginTop: 4 }}>
              {dog.fields.breed}{dog.fields.weight ? ` · ${dog.fields.weight} lbs` : ""}{genderLabel ? ` · ${genderLabel}` : ""}{dog.fields.age ? ` · ${dog.fields.age} yrs` : ""} · {fixedLabel}
            </div>
            {/* Tags: active services as pills */}
            {activeServices.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                {activeServices.map(svc => (
                  <span key={svc} style={{ display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: 6, background: C.priLt, color: C.pri, fontSize: 11, fontWeight: 600 }}>{svc}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Immunization notice */}
        {dog._nextImm && typeof dog._nextImm === "string" && (() => {
          const immDate = dog._nextImm.split("T")[0];
          const isExpired = immDate < today;
          const isSoon = !isExpired && immDate <= (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split("T")[0]; })();
          if (!isExpired && !isSoon) return null;
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderRadius: 10, background: isExpired ? C.danLt : "#FEF3C7", border: `1px solid ${isExpired ? C.dan + "30" : "#F59E0B30"}`, marginTop: 16 }}>
              <span style={{ fontSize: 16 }}>{isExpired ? "⚠️" : "📋"}</span>
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
                        {r.room && <span style={{ display: "inline-flex", padding: "2px 8px", borderRadius: 6, background: C.accLt, color: C.acc, fontSize: 10, fontWeight: 700 }}>Room {(r.room.match(/(\d+)/) || [])[1] || r.room}</span>}
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
        <Card style={{ padding: 32, textAlign: "center" }}>
          <div style={{ fontSize: 14, color: C.textSec }}>No reservations found for {dog.fields.name}</div>
        </Card>
      )}
    </div>
  );
}



export default DogDetailPage;

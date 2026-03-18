// K9 Operations — EnterpriseOpsMatrix
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

function EnterpriseOpsMatrix({ profile, userLocationIds }) {
  const allLocations = [
    { id: "ch", name: "Cherry Hill", opening: 92, frontend: 88, backend: 95, closing: 85, rooms: 100, pictures: 70, privatePlay: 78 },
    { id: "demo", name: "Demo Location", opening: 65, frontend: 70, backend: 72, closing: 60, rooms: 80, pictures: 45, privatePlay: 55 },
  ];
  // Filter locations by user's accessible location_ids (null = all)
  const locations = userLocationIds ? allLocations.filter(l => userLocationIds.includes(l.id)) : allLocations;

  const categories = ["Opening", "Front-End", "Back-End", "Closing", "Rooms", "Pictures", "Private Play"];

  const getColor = (val) => {
    if (val >= 80) return C.suc;
    if (val >= 50) return C.warn;
    return C.dan;
  };

  return (
    <div>
      <h2 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 700, color: C.text, fontFamily: "'Outfit', sans-serif" }}>Enterprise Operations Overview</h2>
      <p style={{ margin: "0 0 24px", fontSize: 14, color: C.textSec }}>Completion percentages across all locations.</p>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10 }}>
          <thead>
            <tr style={{ background: C.bg, borderBottom: `1.5px solid ${C.border}` }}>
              <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 700, color: C.text, minWidth: 140 }}>Location</th>
              {categories.map(cat => (
                <th key={cat} style={{ padding: "12px 16px", textAlign: "center", fontWeight: 700, color: C.text, minWidth: 100 }}>{cat}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {locations.map((loc, idx) => (
              <tr key={loc.id} style={{ borderBottom: `1px solid ${C.borderLight}`, background: idx % 2 === 0 ? C.surface : "rgba(245,246,248,0.5)" }}>
                <td style={{ padding: "12px 16px", fontWeight: 600, color: C.text }}>{loc.name}</td>
                {categories.map(cat => {
                  const key = cat.toLowerCase().replace(/\s+/g, "").replace("-", "");
                  const val = loc[key] || 0;
                  return (
                    <td key={cat} style={{ padding: "12px 16px", textAlign: "center" }}>
                      <div style={{ display: "inline-block", padding: "6px 12px", borderRadius: 6, background: `${getColor(val)}15`, color: getColor(val), fontWeight: 600 }}>{val}%</div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Enterprise Attendance ────────────────────────────────────────────────

export default EnterpriseOpsMatrix;

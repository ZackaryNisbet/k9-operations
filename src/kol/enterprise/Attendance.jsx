// K9 Operations — EnterpriseAttendance
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

function EnterpriseAttendance({ profile, userLocationIds }) {
  const allLocationStats = [
    { id: "ch", name: "Adair Forsythe", activeStaff: 12, tardies: 3, callOuts: 2, perfectAttendance: 83 },
  ];
  // Filter locations by user's accessible location_ids (null = all)
  const locationStats = userLocationIds ? allLocationStats.filter(l => userLocationIds.includes(l.id)) : allLocationStats;

  return (
    <div>
      <h2 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 700, color: C.text, fontFamily: "'Outfit', sans-serif" }}>Enterprise Attendance</h2>
      <p style={{ margin: "0 0 24px", fontSize: 14, color: C.textSec }}>Aggregated attendance data across all locations (30-day period).</p>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10 }}>
          <thead>
            <tr style={{ background: C.bg, borderBottom: `1.5px solid ${C.border}` }}>
              <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 700, color: C.text }}>Location</th>
              <th style={{ padding: "12px 16px", textAlign: "center", fontWeight: 700, color: C.text }}>Active Staff</th>
              <th style={{ padding: "12px 16px", textAlign: "center", fontWeight: 700, color: C.text }}>Tardies (30d)</th>
              <th style={{ padding: "12px 16px", textAlign: "center", fontWeight: 700, color: C.text }}>Call Outs (30d)</th>
              <th style={{ padding: "12px 16px", textAlign: "center", fontWeight: 700, color: C.text }}>Perfect Attendance %</th>
            </tr>
          </thead>
          <tbody>
            {locationStats.map((loc, idx) => (
              <tr key={loc.id} style={{ borderBottom: `1px solid ${C.borderLight}`, background: idx % 2 === 0 ? C.surface : "rgba(245,246,248,0.5)" }}>
                <td style={{ padding: "12px 16px", fontWeight: 600, color: C.text }}>{loc.name}</td>
                <td style={{ padding: "12px 16px", textAlign: "center", color: C.text }}>{loc.activeStaff}</td>
                <td style={{ padding: "12px 16px", textAlign: "center", color: C.text }}>{loc.tardies}</td>
                <td style={{ padding: "12px 16px", textAlign: "center", color: C.text }}>{loc.callOuts}</td>
                <td style={{ padding: "12px 16px", textAlign: "center" }}>
                  <div style={{ display: "inline-block", padding: "4px 10px", borderRadius: 6, background: loc.perfectAttendance >= 80 ? C.sucLt : C.warnLt, color: loc.perfectAttendance >= 80 ? C.suc : C.warn, fontWeight: 600, fontSize: 12 }}>{loc.perfectAttendance}%</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Enterprise User Management ───────────────────────────────────────────

export default EnterpriseAttendance;

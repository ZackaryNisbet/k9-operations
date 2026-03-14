// K9 Operations — EnterpriseUserManagement
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

function EnterpriseUserManagement({ profile }) {
  const isEnterpriseAdmin = profile?.role === "enterprise_admin" || profile?.role === "owner";
  const [adminEmail, setAdminEmail] = useState("");
  const [adminName, setAdminName] = useState("");

  const enterprises = [
    { id: "ch", name: "Cherry Hill", adminName: "Alice Johnson", adminEmail: "alice@k9resorts.com" },
    { id: "demo", name: "Demo Location", adminName: "Bob Smith", adminEmail: "bob@k9resorts.com" },
  ];

  return (
    <div>
      <h2 style={{ margin: "0 0 24px", fontSize: 22, fontWeight: 700, color: C.text, fontFamily: "'Canela', Georgia, serif" }}>User Management</h2>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div>
          <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700, color: C.text }}>Enterprise Admins</h3>
          <Card style={{ padding: "16px 20px", background: C.bg, marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: C.textSec, marginBottom: 12 }}>Current Enterprise Admins can add new Enterprise Admins. {!isEnterpriseAdmin && "You don't have permission to create Enterprise Admins."}</div>
            {isEnterpriseAdmin && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 12, alignItems: "flex-end" }}>
                <input type="text" value={adminName} onChange={e => setAdminName(e.target.value)} placeholder="Full name" style={{ padding: "10px 12px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit" }} />
                <input type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} placeholder="Email" style={{ padding: "10px 12px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit" }} />
                <button style={{ padding: "10px 20px", background: isEnterpriseAdmin ? C.pri : C.textMut, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: isEnterpriseAdmin ? "pointer" : "default", fontFamily: "inherit", opacity: isEnterpriseAdmin ? 1 : 0.5 }}>Create Admin</button>
              </div>
            )}
          </Card>
        </div>

        <div>
          <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700, color: C.text }}>Locations & Admins</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {enterprises.map(loc => (
              <Card key={loc.id} style={{ padding: "16px 20px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{loc.name}</div>
                    <div style={{ fontSize: 13, color: C.textSec, marginTop: 4 }}>Admin: {loc.adminName} ({loc.adminEmail})</div>
                  </div>
                  <button style={{ padding: "8px 16px", background: C.pri, color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Manage Users</button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Revenue Intelligence Reports (Lite) ────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════
// CHECKOUT TV PAGE
// ════════════════════════════════════════════════════════════════════════════

export default EnterpriseUserManagement;

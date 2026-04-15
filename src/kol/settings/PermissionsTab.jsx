// K9 Operations — PermissionsTab
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

function PermissionsTab() {
  // Editable permission state — starts from the built-in matrix
  const [permMatrix, setPermMatrix] = useState(() => {
    const m = {};
    LEAN_ROLES.forEach(r => { m[r.id] = { ...LEAN_PERMISSION_MATRIX[r.id] }; });
    return m;
  });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load persisted overrides from Supabase on mount
  useEffect(() => {
    supabase.from("lite_permissions").select("*").then(({ data: rows }) => {
      if (rows && rows.length > 0) {
        const m = {};
        LEAN_ROLES.forEach(r => { m[r.id] = { ...LEAN_PERMISSION_MATRIX[r.id] }; });
        rows.forEach(r => { if (m[r.role_id]) m[r.role_id][r.permission_key] = r.granted; });
        // Enterprise admin always full access
        LEAN_PERMISSION_AREAS.forEach(k => { m.enterprise_admin[k] = true; });
        setPermMatrix(m);
      }
    });
  }, []);

  const LITE_PERM_CATEGORIES = [
    { key: "dashboard", label: "Dashboard & Reporting", permissions: [
      { key: "Dashboard", label: "Dashboard", desc: "View the main dashboard with today's metrics" },
      { key: "Financial Reporting", label: "Financial Reporting", desc: "View revenue, transactions, refunds, and financial charts" },
      { key: "Occupancy Reports", label: "Occupancy Reports", desc: "View occupancy trends and reports" },
    ]},
    { key: "pages", label: "Module Access", permissions: [
      { key: "Customer Lifecycle", label: "Customer Lifecycle", desc: "View and manage customer lifecycle stages" },
      { key: "Operations Hub", label: "Operations Hub", desc: "Access daily operations checklists" },
      { key: "Training Management", label: "Labor Management", desc: "Access labor home, roster, training, templates, reviews, certifications, and notes" },
      { key: "Photos Module", label: "Photos", desc: "View and manage pet photos" },
      { key: "Services Management", label: "Services", desc: "View and manage bathing, enrichment, pamper, and ice cream services" },
      { key: "Inventory Management", label: "Inventory", desc: "Manage inventory counts and orders" },
    ]},
    { key: "ops", label: "Operations & Tools", permissions: [
      { key: "EOD Reports", label: "EOD Reports", desc: "View end-of-day financial reports" },
      { key: "Attendance Tracker", label: "Attendance", desc: "Track team attendance and records" },
      { key: "Checklist Templates", label: "Checklist Templates", desc: "Customize operation checklists" },
      { key: "Enterprise View", label: "Enterprise View", desc: "Access cross-location enterprise dashboard" },
    ]},
    { key: "settings", label: "Settings & Admin", permissions: [
      { key: "Gingr Integration", label: "Gingr Integration", desc: "Configure Gingr API connection" },
      { key: "User Management", label: "User Management", desc: "Manage team members and invites" },
      { key: "Permissions Management", label: "Permissions", desc: "View and edit role permissions" },
    ]},
  ];

  const allPermKeys = LITE_PERM_CATEGORIES.flatMap(c => c.permissions.map(p => p.key));

  const ROLE_COLORS = {
    pct: { bg: "#F3F4F6", text: "#6B7280" },
    csr: { bg: "#D1FAE5", text: "#059669" },
    supervisor: { bg: "#FEF3C7", text: "#D97706" },
    manager: { bg: "#DBEAFE", text: "#2563EB" },
    location_admin: { bg: "#E0E7FF", text: "#4F46E5" },
    multi_location_admin: { bg: "#FCE7F3", text: "#DB2777" },
    enterprise_admin: { bg: "#F5F3FF", text: "#7C3AED" },
  };

  const enabledCount = (roleId) => allPermKeys.filter(k => permMatrix[roleId]?.[k]).length;
  const isEntAdmin = (roleId) => roleId === "enterprise_admin";

  const togglePerm = (roleId, permKey) => {
    if (isEntAdmin(roleId)) return; // Enterprise admin is always full
    setPermMatrix(prev => {
      const next = { ...prev, [roleId]: { ...prev[roleId], [permKey]: !prev[roleId][permKey] } };
      return next;
    });
    setDirty(true);
    setSaved(false);
  };

  const toggleAllForRole = (roleId) => {
    if (isEntAdmin(roleId)) return;
    const allOn = allPermKeys.every(k => permMatrix[roleId]?.[k]);
    setPermMatrix(prev => {
      const next = { ...prev, [roleId]: { ...prev[roleId] } };
      allPermKeys.forEach(k => { next[roleId][k] = !allOn; });
      return next;
    });
    setDirty(true);
    setSaved(false);
  };

  const toggleCatForRole = (roleId, catKey) => {
    if (isEntAdmin(roleId)) return;
    const cat = LITE_PERM_CATEGORIES.find(c => c.key === catKey);
    if (!cat) return;
    const allOn = cat.permissions.every(p => permMatrix[roleId]?.[p.key]);
    setPermMatrix(prev => {
      const next = { ...prev, [roleId]: { ...prev[roleId] } };
      cat.permissions.forEach(p => { next[roleId][p.key] = !allOn; });
      return next;
    });
    setDirty(true);
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Build rows for all non-enterprise-admin permissions
      const rows = [];
      LEAN_ROLES.filter(r => r.id !== "enterprise_admin").forEach(role => {
        allPermKeys.forEach(k => {
          rows.push({ role_id: role.id, permission_key: k, granted: !!permMatrix[role.id]?.[k] });
        });
      });
      const { error } = await supabase.from("lite_permissions").upsert(rows, { onConflict: "role_id,permission_key" });
      if (error) console.log("[K9 Lite] Permission save error:", error.message);
      // Also update the in-memory LEAN_PERMISSION_MATRIX so other components see changes
      LEAN_ROLES.filter(r => r.id !== "enterprise_admin").forEach(role => {
        allPermKeys.forEach(k => { LEAN_PERMISSION_MATRIX[role.id][k] = !!permMatrix[role.id]?.[k]; });
      });
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.log("[K9 Lite] Permission save error:", err.message);
    }
    setSaving(false);
  };

  const Chk = ({ on, onClick, disabled }) => (
    <button onClick={disabled ? undefined : onClick} style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${disabled ? C.border + "60" : on ? C.pri : C.border}`, background: disabled ? (on ? C.pri + "40" : C.surfaceHover) : on ? C.pri : "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0, flexShrink: 0, cursor: disabled ? "not-allowed" : "pointer", transition: "all 0.12s", opacity: disabled ? 0.5 : 1 }}>
      {on && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={disabled ? "#fff" : "#fff"} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
    </button>
  );

  const colW = Math.max(100, Math.min(130, Math.floor(700 / LEAN_ROLES.length)));
  const labelW = 220;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Roles & Permissions</div>
          <div style={{ fontSize: 13, color: C.textSec, marginTop: 2 }}>Configure permissions for each role. Enterprise Admin always has full access.</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {saved && <span style={{ fontSize: 12, fontWeight: 600, color: C.suc }}>✓ Saved</span>}
          {dirty && <Btn onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save Changes"}</Btn>}
        </div>
      </div>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: labelW + LEAN_ROLES.length * colW }}>
            <thead>
              <tr style={{ background: `linear-gradient(135deg, ${C.pri}08, ${C.bg})` }}>
                <th style={{ position: "sticky", left: 0, background: C.bg, zIndex: 2, width: labelW, minWidth: labelW, padding: "16px 20px", textAlign: "left", borderBottom: `2px solid ${C.border}`, borderRight: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em" }}>Permission</div>
                </th>
                {LEAN_ROLES.map(role => {
                  const ec = enabledCount(role.id);
                  const rc = ROLE_COLORS[role.id] || ROLE_COLORS.pct;
                  const isEnt = isEntAdmin(role.id);
                  return (
                    <th key={role.id} style={{ width: colW, minWidth: colW, padding: "12px 8px", textAlign: "center", borderBottom: `2px solid ${C.border}`, borderRight: `1px solid ${C.borderLight}`, verticalAlign: "bottom", background: isEnt ? "#F5F3FF20" : "transparent" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                        <span style={{ display: "inline-block", padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700, background: rc.bg, color: rc.text, whiteSpace: "nowrap" }}>{role.shortName}</span>
                        <div style={{ fontSize: 11, fontWeight: 600, color: C.textMut }}>{ec}/{allPermKeys.length}</div>
                        {isEnt && <div style={{ fontSize: 9, fontWeight: 700, color: "#7C3AED", textTransform: "uppercase", letterSpacing: "0.04em" }}>Full Access</div>}
                      </div>
                    </th>
                  );
                })}
              </tr>
              {/* Toggle All row */}
              <tr style={{ background: C.bg }}>
                <td style={{ position: "sticky", left: 0, background: C.bg, zIndex: 2, padding: "8px 20px", borderBottom: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}`, fontSize: 11, fontWeight: 700, color: C.pri, textTransform: "uppercase" }}>
                  Toggle All
                </td>
                {LEAN_ROLES.map(role => {
                  const allOn = allPermKeys.every(k => permMatrix[role.id]?.[k]);
                  const isEnt = isEntAdmin(role.id);
                  return (
                    <td key={role.id} style={{ padding: "8px", textAlign: "center", borderBottom: `1px solid ${C.border}`, borderRight: `1px solid ${C.borderLight}`, background: isEnt ? "#F5F3FF20" : "transparent" }}>
                      {isEnt ? (
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#7C3AED", opacity: 0.5 }}>Always On</span>
                      ) : (
                        <button onClick={() => toggleAllForRole(role.id)} style={{ fontSize: 10, fontWeight: 700, color: allOn ? C.dan : C.suc, background: "none", border: `1.5px solid ${allOn ? C.dan + "40" : C.suc + "40"}`, borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontFamily: "inherit" }}>
                          {allOn ? "None" : "All"}
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {LITE_PERM_CATEGORIES.map(cat => (
                <React.Fragment key={cat.key}>
                  <tr>
                    <td colSpan={1 + LEAN_ROLES.length} style={{ position: "sticky", left: 0, padding: "10px 20px", background: `linear-gradient(90deg, ${C.pri}0A, ${C.bg})`, borderBottom: `1px solid ${C.border}`, borderTop: `1px solid ${C.border}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: C.pri, textTransform: "uppercase", letterSpacing: "0.06em" }}>{cat.label}</div>
                        <div style={{ flex: 1, height: 1, background: C.border }} />
                        <div style={{ display: "flex", gap: 4 }}>
                          {LEAN_ROLES.map(role => {
                            const isEnt = isEntAdmin(role.id);
                            const catAllOn = cat.permissions.every(p => permMatrix[role.id]?.[p.key]);
                            const catSomeOn = cat.permissions.some(p => permMatrix[role.id]?.[p.key]);
                            return (
                              <button key={role.id} onClick={() => !isEnt && toggleCatForRole(role.id, cat.key)} title={isEnt ? "Enterprise Admin: always full access" : `${catAllOn ? "Deselect" : "Select"} all ${cat.label} for ${role.name}`}
                                style={{ width: 20, height: 20, borderRadius: 5, border: `1.5px solid ${isEnt ? "#7C3AED40" : catAllOn ? C.suc : catSomeOn ? C.pri + "60" : C.border}`, background: isEnt ? "#7C3AED20" : catAllOn ? C.suc : catSomeOn ? C.pri + "20" : "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: isEnt ? "not-allowed" : "pointer", fontSize: 9, color: isEnt ? "#7C3AED" : catAllOn ? "#fff" : C.textMut, fontWeight: 700, opacity: isEnt ? 0.5 : 1 }}>
                                {(catAllOn || isEnt) ? "✓" : catSomeOn ? "•" : ""}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </td>
                  </tr>
                  {cat.permissions.map((perm, pi) => (
                    <tr key={perm.key} style={{ background: pi % 2 === 0 ? C.surface : C.bg }}>
                      <td style={{ position: "sticky", left: 0, background: pi % 2 === 0 ? C.surface : C.bg, zIndex: 1, padding: "10px 20px", borderBottom: `1px solid ${C.borderLight}`, borderRight: `1px solid ${C.border}` }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text, lineHeight: 1.3 }}>{perm.label}</div>
                        <div style={{ fontSize: 11, color: C.textMut, lineHeight: 1.3, marginTop: 1 }}>{perm.desc}</div>
                      </td>
                      {LEAN_ROLES.map(role => {
                        const isEnt = isEntAdmin(role.id);
                        const on = isEnt ? true : (permMatrix[role.id]?.[perm.key] === true);
                        return (
                          <td key={role.id} style={{ padding: "10px 8px", textAlign: "center", borderBottom: `1px solid ${C.borderLight}`, borderRight: `1px solid ${C.borderLight}`, background: isEnt ? "#F5F3FF20" : "transparent" }}>
                            <Chk on={on} onClick={() => togglePerm(role.id, perm.key)} disabled={isEnt} />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: C.bg }}>
                <td style={{ position: "sticky", left: 0, background: C.bg, zIndex: 2, padding: "14px 20px", borderTop: `2px solid ${C.border}`, borderRight: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: C.text, textTransform: "uppercase", letterSpacing: "0.04em" }}>Total Enabled</div>
                </td>
                {LEAN_ROLES.map(role => {
                  const ec = enabledCount(role.id);
                  const pct = Math.round((ec / allPermKeys.length) * 100);
                  const isEnt = isEntAdmin(role.id);
                  return (
                    <td key={role.id} style={{ padding: "14px 8px", textAlign: "center", borderTop: `2px solid ${C.border}`, borderRight: `1px solid ${C.borderLight}`, background: isEnt ? "#F5F3FF20" : "transparent" }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: pct === 100 ? C.suc : pct > 50 ? C.pri : C.warn }}>{ec}</div>
                      <div style={{ fontSize: 11, color: C.textMut }}>of {allPermKeys.length}</div>
                      <div style={{ width: "80%", height: 4, borderRadius: 2, background: C.surfaceHover, margin: "6px auto 0", overflow: "hidden" }}>
                        <div style={{ width: pct + "%", height: "100%", borderRadius: 2, background: pct === 100 ? C.suc : pct > 50 ? C.pri : pct > 0 ? C.warn : C.border, transition: "width 0.3s" }} />
                      </div>
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ─── Required Fields Tab ──────────────────────────────────────────────────

export default PermissionsTab;

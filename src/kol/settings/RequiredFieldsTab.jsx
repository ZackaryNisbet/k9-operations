// K9 Operations — RequiredFieldsTab
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

function RequiredFieldsTab() {
  const clientFields = DEF_CLIENT_FIELDS;
  const dogFields = DEF_DOG_FIELDS;
  const ACTION_LEVELS_FULL = ["create", "tour", "eval", "reservation"];
  const ACTION_LABELS_FULL = { create: "Create", tour: "Tour", eval: "Eval", reservation: "Res" };

  return (
    <div>
      <h3 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 700, color: C.text }}>Required Fields</h3>
      <p style={{ margin: "0 0 16px", fontSize: 14, color: C.textSec }}>Configure which fields are required at each stage of the customer lifecycle.</p>

      <div style={{ padding: "12px 16px", borderRadius: 10, background: C.priLt, border: `1.5px solid ${C.pri}20`, marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: C.text, lineHeight: 1.5 }}><strong>How it works:</strong> Fields required at a lower level are automatically required at higher levels. Only the "Create" column is active in K9 Operations Lite. Other columns show the POS configuration for reference.</div>
      </div>

      {[{ label: "Client Fields", fields: clientFields }, { label: "Dog Fields", fields: dogFields }].map(section => {
        const colW = "1fr 70px 58px 52px 62px";
        return (
          <Card key={section.label} style={{ padding: 0, overflow: "hidden", marginBottom: 16 }}>
            <div style={{ padding: "14px 20px", background: C.bg, borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.text, textTransform: "uppercase", letterSpacing: "0.06em" }}>{section.label}</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: colW, padding: "10px 20px", borderBottom: `1px solid ${C.border}`, fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", alignItems: "center" }}>
              <div>Field</div>
              <div>Type</div>
              {ACTION_LEVELS_FULL.map(lvl => (
                <div key={lvl} style={{ textAlign: "center", opacity: lvl === "create" ? 1 : 0.4 }}>{ACTION_LABELS_FULL[lvl]}</div>
              ))}
            </div>
            {section.fields.map(f => {
              const rf = f.requiredFor || [];
              return (
                <div key={f.id} style={{ display: "grid", gridTemplateColumns: colW, padding: "10px 20px", borderBottom: `1px solid ${C.borderLight}`, alignItems: "center" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.name}</div>
                  <div><span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 600, background: C.surfaceHover, color: C.textSec }}>{f.type}</span></div>
                  {ACTION_LEVELS_FULL.map(lvl => {
                    const isActive = rf.includes(lvl);
                    const minLevel = rf.length > 0 ? Math.min(...rf.map(a => ACTION_LEVELS_FULL.indexOf(a)).filter(i => i >= 0)) : 999;
                    const isInherited = !isActive && ACTION_LEVELS_FULL.indexOf(lvl) > minLevel && minLevel < 999;
                    const filled = isActive || isInherited;
                    const isCreateCol = lvl === "create";
                    const isLocked = f.isKey && lvl === "create";
                    return (
                      <div key={lvl} style={{ textAlign: "center", opacity: isCreateCol ? 1 : 0.35 }}>
                        <div style={{ width: 18, height: 18, borderRadius: 9, border: `2px solid ${filled ? C.pri : C.border}`, background: filled ? (isInherited ? C.priLt : C.pri) : (isCreateCol ? "#fff" : "#f3f3f3"), display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: isCreateCol && !isLocked ? "pointer" : "not-allowed", opacity: isLocked ? 0.6 : 1 }}>
                          {filled && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={isInherited ? C.pri : "#fff"} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </Card>
        );
      })}
    </div>
  );
}

// ─── Checklist Templates Tab ──────────────────────────────────────────────

export default RequiredFieldsTab;

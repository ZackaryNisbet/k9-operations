// K9 Operations — NewClientPage
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

function NewClientPage({ data, save, nav, profile, addGlobalToast }) {
  const clientFields = data.clientFields || DEF_CLIENT_FIELDS;
  const dogFields = data.dogFields || DEF_DOG_FIELDS;
  const [fields, setFields] = useState({});
  const [dogFields_, setDogFields_] = useState({});
  const [errors, setErrors] = useState({});
  const [addDog, setAddDog] = useState(false);

  const handleSave = async () => {
    const errs = validateClientFields(clientFields, fields);
    if (fields.phone) {
      const ex = data.clients.find(c => c.fields.phone === (fields.phone || "").replace(/\D/g, ""));
      if (ex) errs.phone = "Phone already exists";
    }
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    const nc = { id: "lc_" + Date.now() + "_" + Math.random().toString(36).slice(2,8), fields: { ...fields, phone: (fields.phone || "").replace(/\D/g, "") }, createdAt: new Date().toISOString().slice(0,10), agreements: {} };
    const newClients = [...data.clients, nc];
    let newDogs = data.dogs;
    if (addDog && dogFields_.name) {
      const nd = { id: "ld_" + Date.now() + "_" + Math.random().toString(36).slice(2,8), clientId: nc.id, fields: { ...dogFields_ }, tags: [] };
      newDogs = [...data.dogs, nd];
    }
    await save({ ...data, clients: newClients, dogs: newDogs });
    const name = `${nc.fields.first_name || ""} ${nc.fields.last_name || ""}`.trim();
    if (addGlobalToast) addGlobalToast({ message: `Client "${name}" created` });
    nav("client-detail", { clientId: nc.id });
  };

  return (
    <div>
      <h2 style={{ margin: "0 0 24px", fontSize: 22, fontWeight: 800, color: C.text }}>New Client</h2>
      <Card style={{ padding: 28 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 16 }}>Client Information</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {clientFields.filter(f => f.type !== "textarea").map(f => (
            <div key={f.id}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.textSec, marginBottom: 4 }}>
                {f.name}{isFieldRequired(f, "create") && <span style={{ color: C.dan }}> *</span>}
              </label>
              {f.type === "select" ? (
                <select value={fields[f.id] || ""} onChange={e => { setFields({ ...fields, [f.id]: e.target.value }); setErrors({ ...errors, [f.id]: undefined }); }}
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: `1.5px solid ${errors[f.id] ? C.dan : C.border}`, fontSize: 14, fontFamily: "inherit", background: C.bg, color: C.text }}>
                  <option value="">Select...</option>
                  {(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input type={f.type || "text"} value={fields[f.id] || ""} onChange={e => { setFields({ ...fields, [f.id]: e.target.value }); setErrors({ ...errors, [f.id]: undefined }); }}
                  placeholder={f.isKey ? "Primary key - must be unique" : ""}
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: `1.5px solid ${errors[f.id] ? C.dan : C.border}`, fontSize: 14, fontFamily: "inherit", background: C.bg, color: C.text, outline: "none", boxSizing: "border-box" }} />
              )}
              {errors[f.id] && <div style={{ color: C.dan, fontSize: 12, marginTop: 4, fontWeight: 600 }}>{errors[f.id]}</div>}
            </div>
          ))}
        </div>
        {clientFields.filter(f => f.type === "textarea").map(f => (
          <div key={f.id} style={{ marginTop: 16 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.textSec, marginBottom: 4 }}>{f.name}</label>
            <textarea value={fields[f.id] || ""} onChange={e => setFields({ ...fields, [f.id]: e.target.value })}
              style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14, fontFamily: "inherit", background: C.bg, color: C.text, minHeight: 80, resize: "vertical", boxSizing: "border-box" }} />
          </div>
        ))}

        {/* Add Dog Section */}
        <div style={{ marginTop: 24, borderTop: `1.5px solid ${C.border}`, paddingTop: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Dog Information</div>
            <button onClick={() => setAddDog(!addDog)} style={{ padding: "6px 14px", borderRadius: 8, border: `1.5px solid ${addDog ? C.dan : C.pri}`, background: addDog ? C.danLt : C.priLt, color: addDog ? C.dan : C.pri, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              {addDog ? "Remove Dog" : "+ Add Dog"}
            </button>
          </div>
          {addDog && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {dogFields.filter(f => f.type !== "textarea").map(f => (
                <div key={f.id}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.textSec, marginBottom: 4 }}>{f.name}</label>
                  {f.type === "select" ? (
                    <select value={dogFields_[f.id] || ""} onChange={e => setDogFields_({ ...dogFields_, [f.id]: e.target.value })}
                      style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14, fontFamily: "inherit", background: C.bg, color: C.text }}>
                      <option value="">Select...</option>
                      {(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input type={f.type || "text"} value={dogFields_[f.id] || ""} onChange={e => setDogFields_({ ...dogFields_, [f.id]: e.target.value })}
                      style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14, fontFamily: "inherit", background: C.bg, color: C.text, outline: "none", boxSizing: "border-box" }} />
                  )}
                </div>
              ))}
              {dogFields.filter(f => f.type === "textarea").map(f => (
                <div key={f.id} style={{ gridColumn: "1 / -1" }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.textSec, marginBottom: 4 }}>{f.name}</label>
                  <textarea value={dogFields_[f.id] || ""} onChange={e => setDogFields_({ ...dogFields_, [f.id]: e.target.value })}
                    style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14, fontFamily: "inherit", background: C.bg, color: C.text, minHeight: 80, resize: "vertical", boxSizing: "border-box" }} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 28 }}>
          <button onClick={() => nav("lifecycle")} style={{ padding: "10px 20px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 600, color: C.textSec }}>Cancel</button>
          <Btn onClick={handleSave}>Create Client</Btn>
        </div>
      </Card>
    </div>
  );
}

// ─── Enterprise Operations Matrix ─────────────────────────────────────────

export default NewClientPage;

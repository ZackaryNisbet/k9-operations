// K9 Operations — IgniteSettingsTab
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
import { useAuth } from "../../AuthProvider";

function IgniteSettingsTab() {
  const { profile } = useAuth();
  const [profileNum, setProfileNum] = useState("");
  const [emailForward, setEmailForward] = useState("");
  const [connected, setConnected] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Load persisted ignite config from lite_settings
  useEffect(() => {
    const locationId = profile?.location_id || "cherry-hill";
    supabase.from("lite_settings").select("setting_value").eq("location_id", locationId).eq("setting_key", "ignite_config").then(({ data: rows }) => {
      if (rows && rows.length > 0 && rows[0].setting_value) {
        const val = rows[0].setting_value;
        if (val.profileNumber != null) setProfileNum(val.profileNumber);
        if (val.emailForward != null) setEmailForward(val.emailForward);
        if (val.connected != null) setConnected(val.connected);
      }
      setLoaded(true);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const locationId = profile?.location_id || "cherry-hill";
    const { error } = await supabase.from("lite_settings").upsert({
      location_id: locationId,
      setting_key: "ignite_config",
      setting_value: { profileNumber: profileNum, emailForward, connected },
      updated_by: profile?.id || null,
    }, { onConflict: "location_id,setting_key" });
    if (!error) {
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  };

  if (!loaded) return <div style={{ padding: 40, textAlign: "center" }}><K9LoadingAnimation size={48} message="Loading Ignite settings..." /></div>;

  return (
    <div>
      <h3 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: C.text }}>Ignite Configuration</h3>
      <p style={{ margin: "0 0 24px", fontSize: 13, color: C.textSec, lineHeight: 1.5 }}>Configure your Ignite integration for this location. Each resort has a unique profile number used to route parsed lead emails to the correct K9 Ops location.</p>

      {/* Connection Status */}
      <Card style={{ padding: "16px 20px", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 10, height: 10, borderRadius: "50%",
            background: connected ? "#16A34A" : "#DC2626",
            boxShadow: connected ? "0 0 8px rgba(22,163,74,0.4)" : "0 0 8px rgba(220,38,38,0.3)",
          }} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{connected ? "Connected" : "Not Connected"}</div>
            <div style={{ fontSize: 12, color: C.textSec }}>{connected ? "Ignite is actively routing leads to this location" : "No active Ignite connection for this location"}</div>
          </div>
        </div>
        <button
          onClick={() => { setConnected(!connected); setDirty(true); }}
          style={{
            padding: "6px 16px", borderRadius: 8, border: `1.5px solid ${connected ? "#DC2626" : C.pri}`,
            background: "transparent", color: connected ? "#DC2626" : C.pri,
            fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
          }}
        >
          {connected ? "Disconnect" : "Connect"}
        </button>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
        {/* Ignite Profile # */}
        <Card style={{ padding: "20px 24px" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>Ignite Profile #</div>
          <div style={{ fontSize: 12, color: C.textSec, marginBottom: 12, lineHeight: 1.5 }}>The unique profile number assigned to this location in Ignite. Used for routing parsed emails.</div>
          <input
            type="text"
            value={profileNum}
            onChange={e => { setProfileNum(e.target.value); setDirty(true); }}
            placeholder="e.g. 1042"
            style={{
              width: "100%", padding: "10px 14px", borderRadius: 8,
              border: `1.5px solid ${C.border}`, background: C.bg, color: C.text,
              fontSize: 14, fontWeight: 600, fontFamily: "inherit", boxSizing: "border-box",
            }}
          />
        </Card>

        {/* Email Forwarding Address */}
        <Card style={{ padding: "20px 24px" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>Email Forwarding Address</div>
          <div style={{ fontSize: 12, color: C.textSec, marginBottom: 12, lineHeight: 1.5 }}>The email address where Ignite forwards parsed lead notifications for this location.</div>
          <input
            type="email"
            value={emailForward}
            onChange={e => { setEmailForward(e.target.value); setDirty(true); }}
            placeholder="e.g. leads-cherryhill@k9ops.com"
            style={{
              width: "100%", padding: "10px 14px", borderRadius: 8,
              border: `1.5px solid ${C.border}`, background: C.bg, color: C.text,
              fontSize: 14, fontWeight: 600, fontFamily: "inherit", boxSizing: "border-box",
            }}
          />
        </Card>
      </div>

      {/* How it works */}
      <Card style={{ padding: "16px 20px", marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 8 }}>How Ignite Routing Works</div>
        <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.7 }}>
          <div style={{ marginBottom: 6 }}>With 50+ resorts, each location has a unique Ignite profile. The routing works as follows:</div>
          <div style={{ paddingLeft: 14 }}>
            <div>1. A lead submits a form on the resort's Ignite-powered page</div>
            <div>2. Ignite parses the submission and matches it to the <span style={{ fontWeight: 700, color: C.pri }}>Profile # ({profileNum || "—"})</span></div>
            <div>3. The parsed lead is forwarded to the configured email address</div>
            <div>4. K9 Ops ingests the lead and routes it to the correct location in the CRM</div>
          </div>
        </div>
      </Card>

      {/* Save button */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={handleSave} disabled={!dirty || saving} style={{ padding: "10px 28px", borderRadius: 8, border: "none", background: !dirty ? C.surfaceHover : C.pri, color: !dirty ? C.textMut : "#fff", fontSize: 13, fontWeight: 700, cursor: !dirty ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
          {saving ? "Saving…" : saved ? "✓ Saved" : "Save Changes"}
        </button>
        {dirty && <span style={{ fontSize: 12, color: C.acc, fontWeight: 600 }}>Unsaved changes</span>}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: C.textMut }}>Changes take effect immediately for Ignite routing.</span>
      </div>
    </div>
  );
}

export default IgniteSettingsTab;

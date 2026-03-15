// K9 Operations — RetentionThresholdsTab
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

function RetentionThresholdsTab() {
  const { profile } = useAuth();
  const [dcDays, setDcDays] = useState(90);
  const [bdDays, setBdDays] = useState(180);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Load persisted thresholds from lite_settings
  useEffect(() => {
    const locationId = profile?.location_id || "cherry-hill";
    supabase.from("lite_settings").select("setting_value").eq("location_id", locationId).eq("setting_key", "resort_policies").then(({ data: rows }) => {
      if (rows && rows.length > 0 && rows[0].setting_value) {
        const val = rows[0].setting_value;
        if (val.retentionDaycareDays != null) setDcDays(val.retentionDaycareDays);
        if (val.retentionBoardingDays != null) setBdDays(val.retentionBoardingDays);
      }
      setLoaded(true);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const locationId = profile?.location_id || "cherry-hill";
    const { error } = await supabase.from("lite_settings").upsert({
      location_id: locationId,
      setting_key: "resort_policies",
      setting_value: { retentionDaycareDays: dcDays, retentionBoardingDays: bdDays },
      updated_by: profile?.id || null,
    }, { onConflict: "location_id,setting_key" });
    if (!error) {
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  };

  if (!loaded) return <div style={{ padding: 40, textAlign: "center" }}><K9LoadingAnimation size={48} message="Loading settings..." /></div>;

  return (
    <div>
      <h3 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: C.text }}>Customer Lifecycle — Lapsed Thresholds</h3>
      <p style={{ margin: "0 0 24px", fontSize: 13, color: C.textSec, lineHeight: 1.5 }}>Configure how many days of inactivity trigger a client moving from Active to Lapsed. Separate thresholds for primarily-daycare vs primarily-boarding clients.</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
        {/* Daycare Lapsed */}
        <Card style={{ padding: "20px 24px" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 12 }}>Daycare Lapsed</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <input type="number" value={dcDays} min={1} max={365} onChange={e => { setDcDays(parseInt(e.target.value) || 90); setDirty(true); }}
              style={{ width: 80, padding: "10px 14px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 16, fontWeight: 700, fontFamily: "inherit", textAlign: "center" }} />
            <span style={{ fontSize: 14, color: C.text, fontWeight: 600 }}>days</span>
          </div>
          <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.5 }}>Clients whose reservations are primarily daycare will move to Lapsed after this many days of inactivity.</div>
          <div style={{ marginTop: 12, display: "flex", gap: 6 }}>
            {[30, 60, 90, 120].map(d => (
              <button key={d} onClick={() => { setDcDays(d); setDirty(true); }} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${dcDays === d ? C.pri : C.border}`, background: dcDays === d ? C.priLt : "transparent", color: dcDays === d ? C.pri : C.textSec, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{d}d</button>
            ))}
          </div>
        </Card>

        {/* Boarding Lapsed */}
        <Card style={{ padding: "20px 24px" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 12 }}>Boarding Lapsed</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <input type="number" value={bdDays} min={1} max={730} onChange={e => { setBdDays(parseInt(e.target.value) || 180); setDirty(true); }}
              style={{ width: 80, padding: "10px 14px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 16, fontWeight: 700, fontFamily: "inherit", textAlign: "center" }} />
            <span style={{ fontSize: 14, color: C.text, fontWeight: 600 }}>days</span>
          </div>
          <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.5 }}>Clients whose reservations are primarily boarding will move to Lapsed after this many days of inactivity.</div>
          <div style={{ marginTop: 12, display: "flex", gap: 6 }}>
            {[90, 120, 180, 365].map(d => (
              <button key={d} onClick={() => { setBdDays(d); setDirty(true); }} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${bdDays === d ? C.pri : C.border}`, background: bdDays === d ? C.priLt : "transparent", color: bdDays === d ? C.pri : C.textSec, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{d}d</button>
            ))}
          </div>
        </Card>
      </div>

      {/* How it works explainer */}
      <Card style={{ padding: "16px 20px", marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 8 }}>How Lapsed Classification Works</div>
        <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.7 }}>
          <div style={{ marginBottom: 6 }}>A client moves from <span style={{ fontWeight: 700, color: C.text }}>Active</span> to <span style={{ fontWeight: 700, color: "#D97706" }}>Lapsed</span> when:</div>
          <div style={{ paddingLeft: 14 }}>
            <div>1. They have a booking history and have spent money</div>
            <div>2. They have no upcoming reservations</div>
            <div>3. Their last visit exceeds the threshold for their primary service type:</div>
            <div style={{ paddingLeft: 14, marginTop: 4 }}>
              <div>If <span style={{ fontWeight: 600 }}>&gt;50%</span> of bookings are boarding → uses <span style={{ fontWeight: 700, color: C.pri }}>Boarding threshold ({bdDays} days)</span></div>
              <div>If <span style={{ fontWeight: 600 }}>&ge;50%</span> of bookings are daycare → uses <span style={{ fontWeight: 700, color: C.pri }}>Daycare threshold ({dcDays} days)</span></div>
              <div>Mixed use → defaults to <span style={{ fontWeight: 700, color: C.pri }}>Daycare threshold ({dcDays} days)</span></div>
            </div>
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
        <span style={{ fontSize: 11, color: C.textMut }}>Changes take effect immediately for all lifecycle calculations.</span>
      </div>
    </div>
  );
}

// ─── Main Settings Page with Tabs ──────────────────────────────────────────

export default RetentionThresholdsTab;

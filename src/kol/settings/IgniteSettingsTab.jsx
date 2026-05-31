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
import { SAMPLE_WEB_FORM_EMAIL, SAMPLE_PHONE_CALL_EMAIL, SAMPLE_AD_CLICK_EMAIL } from "../../ignite/sampleEmails";
import IgniteOnboardingWizard from "../onboarding/IgniteOnboardingWizard";
import { canManageIgnite } from "../onboarding/igniteOnboarding";

const WEBHOOK_URL = "https://xuzvqcpthqikyroqhypw.supabase.co/functions/v1/ignite-webhook";

function IgniteSettingsTab() {
  const { profile } = useAuth();
  const [profileNum, setProfileNum] = useState("");
  const [emailForward, setEmailForward] = useState("");
  const [connected, setConnected] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Webhook test state
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // { success, message } or null
  const [testSample, setTestSample] = useState("web_form");

  // Last lead timestamp
  const [lastLeadAt, setLastLeadAt] = useState(null);

  // Ignite config status from ignite_config table
  const [configStatus, setConfigStatus] = useState(null); // "active" | "inactive" | null

  // Guided onboarding wizard
  const [showWizard, setShowWizard] = useState(false);

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

    // Fetch last lead timestamp
    supabase.from("ignite_leads").select("created_at").eq("location_id", locationId).order("created_at", { ascending: false }).limit(1).then(({ data }) => {
      if (data && data.length > 0) setLastLeadAt(data[0].created_at);
    });

    // Fetch ignite_config status
    supabase.from("ignite_config").select("is_active").eq("location_id", locationId).limit(1).then(({ data }) => {
      if (data && data.length > 0) setConfigStatus(data[0].is_active ? "active" : "inactive");
      else setConfigStatus(null);
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

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);

    const samples = {
      web_form: SAMPLE_WEB_FORM_EMAIL,
      phone_call: SAMPLE_PHONE_CALL_EMAIL,
      ad_click: SAMPLE_AD_CLICK_EMAIL,
    };
    const sample = samples[testSample] || samples.web_form;

    try {
      // Replace hardcoded sample profile ID with the user's actual configured profile number
      const patchedHtml = profileNum
        ? sample.html.replace(/IGN-7842/g, profileNum)
        : sample.html;

      const resp = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: sample.from,
          subject: sample.subject,
          html: patchedHtml,
          headers: { from: sample.from, subject: sample.subject },
        }),
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        setTestResult({ success: true, message: `Lead created (${data.matchStatus}). ID: ${data.leadId}` });
        // Refresh last lead timestamp
        setLastLeadAt(new Date().toISOString());
      } else {
        setTestResult({ success: false, message: data.error || `HTTP ${resp.status}` });
      }
    } catch (err) {
      setTestResult({ success: false, message: err.message || "Network error" });
    }
    setTesting(false);
  };

  if (!loaded) return <div style={{ padding: 40, textAlign: "center" }}><K9LoadingAnimation size={48} message="Loading Ignite settings..." /></div>;

  return (
    <div>
      <h3 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: C.text }}>Ignite Configuration</h3>
      <p style={{ margin: "0 0 16px", fontSize: 13, color: C.textSec, lineHeight: 1.5 }}>Configure your Ignite integration for this location. Each resort has a unique profile number used to route parsed lead emails to the correct K9 Ops location.</p>

      {/* Guided setup callout — admin-only */}
      {canManageIgnite(profile) && (
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", marginBottom: 24, borderRadius: 12, border: `1.5px solid ${C.pri}33`, background: `linear-gradient(135deg, ${C.priLt}, ${C.surface})` }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: `${C.pri}14`, display: "flex", alignItems: "center", justifyContent: "center", color: C.pri, flexShrink: 0 }}>
            <I.Sparkle />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>New: guided setup wizard</div>
            <div style={{ fontSize: 12.5, color: C.textSec }}>Answer a few questions and we'll connect Ignite, activate the pipeline, and run a live test — no manual config or developer needed.</div>
          </div>
          <button
            type="button"
            onClick={() => setShowWizard(true)}
            style={{ flexShrink: 0, padding: "9px 18px", borderRadius: 9, border: "none", background: C.pri, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
          >
            Run setup
          </button>
        </div>
      )}

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
            <div style={{ fontSize: 12, color: C.textSec }}>
              {connected ? "Ignite is actively routing leads to this location" : "No active Ignite connection for this location"}
              {configStatus === "active" && <span style={{ marginLeft: 8, color: "#16A34A", fontWeight: 600 }}>Pipeline Active</span>}
              {configStatus === "inactive" && <span style={{ marginLeft: 8, color: "#DC2626", fontWeight: 600 }}>Pipeline Inactive</span>}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {lastLeadAt && (
            <div style={{ fontSize: 11, color: C.textMut, textAlign: "right" }}>
              <div>Last lead received</div>
              <div style={{ fontWeight: 600, color: C.textSec }}>{(() => { try { const dt = new Date(lastLeadAt); return `${String(dt.getMonth()+1).padStart(2,'0')}/${String(dt.getDate()).padStart(2,'0')}/${dt.getFullYear()}`; } catch { return '—'; } })()}</div>
            </div>
          )}
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
        </div>
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
            placeholder="e.g. IGN-7842"
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

      {/* Webhook URL */}
      <Card style={{ padding: "16px 20px", marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 8 }}>Webhook Endpoint</div>
        <div style={{ fontSize: 12, color: C.textSec, marginBottom: 10, lineHeight: 1.5 }}>
          This is the Supabase Edge Function URL that receives Ignite lead emails via Resend inbound webhooks.
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 14px", borderRadius: 8,
          background: C.surfaceHover, border: `1px solid ${C.border}`,
        }}>
          <code style={{ flex: 1, fontSize: 12, color: C.text, fontFamily: "monospace", wordBreak: "break-all", userSelect: "all" }}>
            {WEBHOOK_URL}
          </code>
          <button
            onClick={() => { navigator.clipboard.writeText(WEBHOOK_URL); }}
            style={{
              padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.border}`,
              background: "transparent", color: C.textSec, fontSize: 11, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
            }}
          >
            Copy
          </button>
        </div>
      </Card>

      {/* Resend Inbound Info */}
      <Card style={{ padding: "16px 20px", marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 8 }}>Resend Inbound Email Setup</div>
        <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.7 }}>
          <div style={{ marginBottom: 6 }}>To receive Ignite lead emails automatically:</div>
          <div style={{ paddingLeft: 14 }}>
            <div>1. In Gmail, create a filter for emails from <span style={{ fontWeight: 700, color: C.pri }}>noreply@leads.idigitalstrategies.com</span></div>
            <div>2. Forward matching emails to your Resend inbound address (e.g. <code style={{ fontSize: 11 }}>leads@yourname.resend.app</code>)</div>
            <div>3. In Resend dashboard, add a webhook pointing to the endpoint URL above</div>
            <div>4. Select the <span style={{ fontWeight: 700 }}>email.received</span> event type</div>
            <div>5. Set the <code style={{ fontSize: 11 }}>RESEND_API_KEY</code> secret in Supabase Edge Function settings</div>
          </div>
        </div>
      </Card>

      {/* Test Connection */}
      <Card style={{ padding: "16px 20px", marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 8 }}>Test Connection</div>
        <div style={{ fontSize: 12, color: C.textSec, marginBottom: 12, lineHeight: 1.5 }}>
          Send a sample Ignite email directly to the webhook to verify the pipeline is working.
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
          <select
            value={testSample}
            onChange={e => setTestSample(e.target.value)}
            style={{
              padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`,
              background: C.bg, color: C.text, fontSize: 13, fontFamily: "inherit",
            }}
          >
            <option value="web_form">Web Form Lead</option>
            <option value="phone_call">Phone Call Lead</option>
            <option value="ad_click">Ad Click Lead</option>
          </select>
          <button
            onClick={handleTestConnection}
            disabled={testing}
            style={{
              padding: "8px 20px", borderRadius: 8, border: "none",
              background: C.pri, color: "#fff", fontSize: 13, fontWeight: 700,
              cursor: testing ? "not-allowed" : "pointer", fontFamily: "inherit",
              opacity: testing ? 0.7 : 1,
            }}
          >
            {testing ? "Sending..." : "Test Connection"}
          </button>
        </div>
        {testResult && (
          <div style={{
            padding: "10px 14px", borderRadius: 8, fontSize: 12, lineHeight: 1.5,
            background: testResult.success ? "rgba(22,163,74,0.08)" : "rgba(220,38,38,0.08)",
            color: testResult.success ? "#16A34A" : "#DC2626",
            border: `1px solid ${testResult.success ? "rgba(22,163,74,0.2)" : "rgba(220,38,38,0.2)"}`,
          }}>
            {testResult.success ? "Success" : "Failed"}: {testResult.message}
          </div>
        )}
      </Card>

      {/* How it works */}
      <Card style={{ padding: "16px 20px", marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 8 }}>How Ignite Routing Works</div>
        <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.7 }}>
          <div style={{ marginBottom: 6 }}>With 50+ resorts, each location has a unique Ignite profile. The routing works as follows:</div>
          <div style={{ paddingLeft: 14 }}>
            <div>1. A lead submits a form on the resort's Ignite-powered page</div>
            <div>2. Ignite parses the submission and matches it to the <span style={{ fontWeight: 700, color: C.pri }}>Profile # ({profileNum || "\u2014"})</span></div>
            <div>3. The parsed lead is forwarded to the configured email address</div>
            <div>4. Resend receives the email and sends a webhook to the edge function</div>
            <div>5. The edge function fetches the full email, parses it, and matches to existing Gingr clients</div>
            <div>6. K9 Ops stores the lead and routes it to the correct location in the CRM</div>
          </div>
        </div>
      </Card>

      {/* Save button */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={handleSave} disabled={!dirty || saving} style={{ padding: "10px 28px", borderRadius: 8, border: "none", background: !dirty ? C.surfaceHover : C.pri, color: !dirty ? C.textMut : "#fff", fontSize: 13, fontWeight: 700, cursor: !dirty ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
          {saving ? "Saving\u2026" : saved ? "\u2713 Saved" : "Save Changes"}
        </button>
        {dirty && <span style={{ fontSize: 12, color: C.acc, fontWeight: 600 }}>Unsaved changes</span>}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: C.textMut }}>Changes take effect immediately for Ignite routing.</span>
      </div>

      {showWizard && (
        <IgniteOnboardingWizard
          locationId={profile?.location_id}
          profile={profile}
          onClose={() => setShowWizard(false)}
          onComplete={({ profileId, status }) => {
            setShowWizard(false);
            if (profileId) setProfileNum(profileId);
            setConnected(true);
            setConfigStatus(status === "active" ? "active" : "inactive");
          }}
        />
      )}
    </div>
  );
}

export default IgniteSettingsTab;

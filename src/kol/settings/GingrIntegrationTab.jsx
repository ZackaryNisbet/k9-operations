// K9 Operations — GingrIntegrationTab
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
import RoomConfig from "./RoomConfig";

const sanitizeGingrSettingsError = (value) => {
  const text = String(value || "Request failed. Check the server logs for details.")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/(api[_-]?key|authorization|auth[_-]?token|token|secret)(['"]?\s*[:=]\s*['"]?)[^'",\s}]+/gi, "$1$2[redacted]")
    .replace(/(password)(['"]?\s*[:=]\s*['"]?)[^'",\s}]+/gi, "$1$2[redacted]");
  return text.length > 280 ? `${text.slice(0, 277)}...` : text;
};

function GingrIntegrationTab() {
  const [subdomain, setSubdomain] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [locationId, setLocationId] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [testStatus, setTestStatus] = useState(null);
  const [testMessage, setTestMessage] = useState("");
  const [syncStatus, setSyncStatus] = useState(null); // null | 'syncing' | 'success' | 'error'
  const [syncMessage, setSyncMessage] = useState("");
  const [syncState, setSyncState] = useState([]);
  const [lastErrorLog, setLastErrorLog] = useState(null);
  const [errorCopied, setErrorCopied] = useState(false);
  const { profile } = useAuth();

  const extractEdgeFnError = async (fnError) => {
    if (!fnError) return null;
    try {
      if (fnError.context?.body) {
        const reader = fnError.context.body.getReader?.();
        if (reader) {
          const { value } = await reader.read();
          const text = new TextDecoder().decode(value);
          try { const j = JSON.parse(text); return j.error || j.message || text; } catch (_) { return text; }
        }
      }
      if (typeof fnError.message === "string" && fnError.message !== "Edge Function returned a non-2xx status code") return fnError.message;
    } catch (_) {}
    return fnError.message || "Unknown edge function error";
  };

  useEffect(() => {
    if (!profile?.location_id) return;
    // Load from lite_settings (gingr_config)
    supabase
      .from("lite_settings")
      .select("setting_value")
      .eq("location_id", profile.location_id)
      .eq("setting_key", "gingr_config")
      .limit(1)
      .then(({ data: rows }) => {
        if (rows && rows.length > 0 && rows[0].setting_value) {
          const cfg = rows[0].setting_value;
          setSubdomain(cfg.subdomain || "");
          setApiKey(cfg.api_key || "");
          setLocationId(cfg.gingr_location_id || "");
        }
      });
    // Load sync state
    supabase
      .from("gingr_sync_state")
      .select("*")
      .eq("location_id", profile.location_id)
      .then(({ data }) => { if (data) setSyncState(data); });
  }, [profile?.location_id]);

  const handleSave = async () => {
    if (!profile?.location_id) return;
    setSaving(true);
    setSaved(false);
    setSaveError("");

    // Save to lite_settings as gingr_config (used by Edge Function)
    const gingrConfig = {
      subdomain: subdomain.trim().toLowerCase(),
      api_key: apiKey.trim(),
      gingr_location_id: locationId.trim() || "1",
    };
    const { error } = await supabase
      .from("lite_settings")
      .upsert({
        location_id: profile.location_id,
        setting_key: "gingr_config",
        setting_value: gingrConfig,
      }, { onConflict: "location_id,setting_key" });

    setSaving(false);
    if (error) {
      setSaveError(error.message || "Failed to save credentials.");
      if (import.meta.env.DEV) console.error("Save error:", error);
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  };

  const handleTest = async () => {
    if (!subdomain || !apiKey) {
      setTestStatus("error");
      setTestMessage("Enter subdomain and API key first.");
      return;
    }
    setTestStatus("testing");
    setTestMessage("");
    try {
      const { data: fnData, error: fnError } = await supabase.functions.invoke("gingr-sync", {
        body: {
          location_id: profile?.location_id || "test",
          sync_type: "test",
          test_credentials: {
            subdomain: subdomain.trim().toLowerCase(),
            api_key: apiKey.trim(),
          },
        },
      });
      if (fnError) {
        const detail = await extractEdgeFnError(fnError);
        throw new Error(detail);
      }
      if (fnData?.success) {
        setTestStatus("success");
        const names = fnData.location_names || [];
        setTestMessage(`Connected! ${fnData.locations} location${fnData.locations !== 1 ? "s" : ""} found${names.length ? ": " + names.join(", ") : ""}.`);
      } else {
        setTestStatus("error");
        setTestMessage(fnData?.error || "Connection failed. Check your credentials.");
      }
    } catch (e) {
      setTestStatus("error");
      const safeMessage = sanitizeGingrSettingsError(e.message || "Could not reach Gingr. Make sure the Edge Function is deployed.");
      setTestMessage(safeMessage);
      setLastErrorLog({ timestamp: new Date().toISOString(), error: safeMessage, context: "test_connection" });
    }
  };

  const handleSync = async () => {
    if (!profile?.location_id) return;
    setSyncStatus("syncing");
    setSyncMessage("Starting full sync from Gingr...");
    try {
      let backfillComplete = false;
      let totalResSynced = 0;
      let iteration = 0;
      const startTime = Date.now();
      while (!backfillComplete) {
        iteration++;
        const { data: fnData, error: fnError } = await supabase.functions.invoke("gingr-sync", {
          body: { location_id: profile.location_id, sync_type: "full" },
        });
        if (fnError) {
          const detail = await extractEdgeFnError(fnError);
          throw new Error(detail);
        }
        const resResult = fnData?.results?.reservations;
        totalResSynced += resResult?.synced || 0;
        if (resResult && resResult.backfill_complete === false && resResult.chunks_remaining > 0) {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
          setSyncMessage(`Backfilling history... ${totalResSynced.toLocaleString()} reservations synced (batch ${iteration}, ~${resResult.chunks_remaining} batches left, ${elapsed}s elapsed)`);
          await new Promise(r => setTimeout(r, 500));
        } else {
          backfillComplete = true;
        }
      }
      const r = (await supabase.functions.invoke("gingr-sync", { body: { location_id: profile.location_id, sync_type: "full" } }))?.data?.results || {};
      const parts = [];
      if (r.owners?.synced) parts.push(`${r.owners.synced} owners`);
      if (r.animals?.synced) parts.push(`${r.animals.synced} animals`);
      parts.push(`${totalResSynced.toLocaleString()} reservations`);
      if (r.reservation_types?.synced) parts.push(`${r.reservation_types.synced} reservation types`);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      setSyncStatus("success");
      setSyncMessage(`Sync complete! Imported ${parts.join(", ")} in ${iteration} batches (${elapsed}s).`);
      const { data: newState } = await supabase.from("gingr_sync_state").select("*").eq("location_id", profile.location_id);
      if (newState) setSyncState(newState);
    } catch (err) {
      setSyncStatus("error");
      const safeMessage = sanitizeGingrSettingsError(err.message || "Unknown error");
      setSyncMessage(`Sync failed: ${safeMessage}`);
      setLastErrorLog({ timestamp: new Date().toISOString(), error: safeMessage, context: "settings_sync" });
    }
  };

  const inputStyle = {
    width: "100%",
    padding: "12px 14px",
    border: `1.5px solid ${C.border}`,
    borderRadius: 10,
    fontSize: 15,
    color: C.text,
    background: "#fff",
    outline: "none",
    fontFamily: "inherit",
    boxSizing: "border-box",
    transition: "border-color 0.15s",
  };
  const labelStyle = { display: "block", fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 6 };

  return (
    <div>
      <h3 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 700, color: C.text }}>
        Gingr Integration
      </h3>
      <p style={{ margin: "0 0 20px", fontSize: 14, color: C.textSec, lineHeight: 1.6 }}>
        Connect your Gingr account to pull customer, reservation, and operational data into K9 Operations. Your API key is stored
        securely per location.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <label style={labelStyle}>Gingr Subdomain</label>
          <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
            <span style={{padding: "12px 10px 12px 14px",background: C.bg,border: `1.5px solid ${C.border}`,borderRight: "none",borderRadius: "10px 0 0 10px",fontSize: 14,color: C.textMut,whiteSpace: "nowrap",}}>https://</span>
            <input value={subdomain} onChange={(e) => setSubdomain(e.target.value)} placeholder="your-facility" style={{ ...inputStyle, borderRadius: 0, borderLeft: "none", borderRight: "none" }} />
            <span style={{padding: "12px 14px 12px 10px",background: C.bg,border: `1.5px solid ${C.border}`,borderLeft: "none",borderRadius: "0 10px 10px 0",fontSize: 14,color: C.textMut,whiteSpace: "nowrap",}}>.gingrapp.com</span>
          </div>
        </div>

        <div>
          <label style={labelStyle}>API Key</label>
          <div style={{ position: "relative" }}>
            <input type={showKey ? "text" : "password"} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Your Gingr API key" style={{ ...inputStyle, paddingRight: 44 }} />
            <button onClick={() => setShowKey(!showKey)} type="button" style={{position: "absolute",right: 10,top: "50%",transform: "translateY(-50%)",background: "none",border: "none",cursor: "pointer",color: C.textMut,padding: 4,}}>
              {showKey ? <Icons.EyeOff /> : <Icons.Eye />}
            </button>
          </div>
          <div style={{ fontSize: 12, color: C.textMut, marginTop: 6 }}>Find this in your Gingr admin panel under Settings → API Keys.</div>
        </div>

        <div>
          <label style={labelStyle}>Gingr Location ID <span style={{ fontWeight: 400, color: C.textMut }}>(optional)</span></label>
          <input value={locationId} onChange={(e) => setLocationId(e.target.value)} placeholder="e.g. 1" style={inputStyle} />
          <div style={{ fontSize: 12, color: C.textMut, marginTop: 6 }}>Only needed if your Gingr account has multiple locations. Leave blank for single-location setups.</div>
        </div>
      </div>

      {testStatus && (
        <div style={{marginTop: 20,padding: "12px 16px",borderRadius: 10,fontSize: 14,fontWeight: 500,display: "flex",alignItems: "center",gap: 8,background: testStatus === "success" ? C.sucLt : testStatus === "error" ? C.danLt : C.infoLt,color: testStatus === "success" ? C.suc : testStatus === "error" ? C.dan : C.info,}}>
          {testStatus === "testing" && "Testing connection..."}
          {testStatus === "success" && (<><Icons.Check /> {testMessage}</> )}
          {testStatus === "error" && (<><Icons.AlertTriangle /> {testMessage}</> )}
        </div>
      )}

      <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
        <button onClick={handleTest} disabled={!subdomain || !apiKey} style={{padding: "12px 24px",borderRadius: 10,border: `1.5px solid ${C.pri}`,background: "transparent",color: C.pri,fontSize: 14,fontWeight: 600,cursor: !subdomain || !apiKey ? "default" : "pointer",fontFamily: "inherit",opacity: !subdomain || !apiKey ? 0.4 : 1,transition: "all 0.15s",display: "flex",alignItems: "center",gap: 6,}}>
          <Icons.Link /> Test Connection
        </button>
        <button onClick={handleSave} disabled={saving || !subdomain || !apiKey} style={{padding: "12px 24px",borderRadius: 10,border: "none",background: saving || !subdomain || !apiKey ? C.textMut : C.pri,color: "#fff",fontSize: 14,fontWeight: 600,cursor: saving || !subdomain || !apiKey ? "default" : "pointer",fontFamily: "inherit",transition: "all 0.15s",}}>
          {saving ? "Saving..." : saved ? "Saved!" : "Save Credentials"}
        </button>
      </div>

      {saveError && (
        <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 8, background: C.danLt, color: C.dan, fontSize: 13, fontWeight: 500 }}>
          Save failed: {saveError}
        </div>
      )}

      {/* ── Data Sync Section ── */}
      <div style={{ marginTop: 32, paddingTop: 24, borderTop: `1.5px solid ${C.borderLight}` }}>
        <h4 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700, color: C.text }}>Data Sync</h4>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: C.textSec, lineHeight: 1.6 }}>
          Sync pulls all owners, animals, and reservations from Gingr into K9 Operations. Auto-syncs every 15 minutes when the app is open.
        </p>

        {syncState.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginBottom: 16 }}>
            {syncState.map(s => (
              <div key={s.entity_type} style={{ padding: "12px 16px", background: C.bg, borderRadius: 10, border: `1px solid ${C.borderLight}` }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.text, textTransform: "capitalize", marginBottom: 4 }}>{s.entity_type}</div>
                <div style={{ fontSize: 12, color: C.textSec }}>
                  {s.records_synced ? `${s.records_synced.toLocaleString()} records` : "Not synced yet"}
                </div>
                {s.last_sync_at && (
                  <div style={{ fontSize: 11, color: C.textMut, marginTop: 4 }}>
                    Last: {new Date(s.last_sync_at).toLocaleString()}
                  </div>
                )}
                {s.status === "error" && (
                  <div style={{ fontSize: 11, color: C.dan, marginTop: 4 }}>{s.error_message}</div>
                )}
              </div>
            ))}
          </div>
        )}

        {syncStatus === "syncing" && (
          <div style={{ marginBottom: 16, padding: "24px 16px", borderRadius: 10, background: C.infoLt, border: `1px solid ${C.borderLight}`, textAlign: "center" }}>
            <K9LoadingAnimation size={48} message="Syncing from Gingr..." subMessage={syncMessage} />
          </div>
        )}
        {syncStatus && syncStatus !== "syncing" && (
          <div style={{ marginBottom: 16, padding: "12px 16px", borderRadius: 10, fontSize: 14, fontWeight: 500, display: "flex", alignItems: "center", gap: 8, background: syncStatus === "success" ? C.sucLt : C.danLt, color: syncStatus === "success" ? C.suc : C.dan }}>
            {syncStatus === "success" && (<><Icons.Check /> {syncMessage}</>)}
            {syncStatus === "error" && (<><Icons.AlertTriangle /> {syncMessage}</>)}
          </div>
        )}

        {lastErrorLog && (
          <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 8, background: C.surface, border: `1px solid ${C.borderLight}`, fontSize: 12, fontFamily: "monospace" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontWeight: 600, color: C.textSec, fontFamily: "inherit" }}>Error Log</span>
              <button onClick={() => { navigator.clipboard.writeText(JSON.stringify(lastErrorLog, null, 2)); setErrorCopied(true); setTimeout(() => setErrorCopied(false), 2000); }} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${errorCopied ? C.suc : C.borderLight}`, background: errorCopied ? C.sucLt : C.bg, color: errorCopied ? C.suc : C.textSec, fontSize: 11, cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s ease", display: "flex", alignItems: "center", gap: 4 }}>{errorCopied ? <><svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Copied</> : "Copy"}</button>
            </div>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all", color: C.dan, fontSize: 11, lineHeight: 1.4 }}>{JSON.stringify(lastErrorLog, null, 2)}</pre>
          </div>
        )}

        <button onClick={handleSync} disabled={syncStatus === "syncing" || !subdomain || !apiKey} style={{ padding: "12px 24px", borderRadius: 10, border: "none", background: syncStatus === "syncing" || !subdomain || !apiKey ? C.textMut : C.suc, color: "#fff", fontSize: 14, fontWeight: 600, cursor: syncStatus === "syncing" || !subdomain || !apiKey ? "default" : "pointer", fontFamily: "inherit", transition: "all 0.15s", display: "flex", alignItems: "center", gap: 8 }}>
          <Icons.RefreshCw /> {syncStatus === "syncing" ? "Syncing..." : "Sync Now"}
        </button>
      </div>

      {/* ── Room Configuration Section ── */}
      <RoomConfig locationId={profile?.location_id} />
    </div>
  );
}

// ─── Room Configuration (actual room names per type) ───────────────────────

export default GingrIntegrationTab;

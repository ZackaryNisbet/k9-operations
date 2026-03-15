// K9 Operations — EnterpriseMultiResortSetup (ENT-003)
// Isolated page component. See AGENTS.md for development contract.

import React, { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
import ReactDOM from "react-dom";
import { supabase } from "../../supabaseClient";
import { C, OPERATIONS_CATALOG, OPS_TYPES, LITE_DEF_PRICING, CHART_PTS, DEF_CLIENT_FIELDS, DEF_DOG_FIELDS, DEFAULT_LIFECYCLE_BANNERS, LC_OP_LABELS, LC_FILTER_FIELDS, LITE_ACTION_LABELS, LITE_ACTION_LEVELS, DEF_LITE_EOD_TEMPLATE, DAY_NAMES_SHORT, ROOM_TYPES, K9_LOCATIONS, POS_BASE, PAGE_SLUGS, buildUrl, parseUrl, gid, titleCase, fmtPhone, fmtDate, fmtDateFull, fmtDateShort, fmtTime, fmtInstr, todayStr, addDays, formatTime12hr, countNights, countHours, DEF_OPENING_TEMPLATE, DEF_FE_TEMPLATE, DEF_BE_TEMPLATE, DEF_CLOSING_TEMPLATE, LEAN_PERMISSION_AREAS, LEAN_PERMISSION_MATRIX, LEAN_ROLES, NAV_ITEMS, K9_LOGO_SRC, K9_LOGO_PNG, SLUG_TO_PAGE, ENT_SLUG_TO_PAGE, formatDogNames, fmtPhoneInput, IDB_VERSION, idbGet, idbSet } from "../../shared/theme";
import { I, Icons } from "../../shared/icons";
import { Tip, Badge, Btn, CustomSelect, MiniDatePicker, ComplianceCheckItem, Inp, CalendarPicker, Modal, Card, K9Logo, K9LogoMini, isFieldRequired, validateClientFields } from "../../shared/ui";
import { hasPermission, hasLeanPermission, _resolveRole, LEGACY_ROLE_MAP, ROLE_CODE_MAP } from "../../shared/permissions";
import { classifyReservationType, classifyReservationStatus, extractRoomFromType, getRoomCleaningStats, resSvcIncludes, getPPStats, getOpsCardStatus, getOpsProgress, getOpsCountLabel } from "../../shared/opsHelpers";
import K9LoadingAnimation from "../../shared/K9LoadingAnimation";
import InteractiveLineChart from "../../shared/InteractiveLineChart";
import LocationSelector from "../../shared/LocationSelector";
import { applyStructuredFilters } from "../../hooks/useFilters";

// ─── Constants ───────────────────────────────────────────────────────────────

const TIMEZONE_OPTIONS = [
  { value: "America/New_York", label: "Eastern (ET)" },
  { value: "America/Chicago", label: "Central (CT)" },
  { value: "America/Denver", label: "Mountain (MT)" },
  { value: "America/Los_Angeles", label: "Pacific (PT)" },
  { value: "America/Phoenix", label: "Arizona (MST)" },
  { value: "America/Anchorage", label: "Alaska (AKT)" },
  { value: "Pacific/Honolulu", label: "Hawaii (HST)" },
];

const STATUS_CONFIG = {
  pending: { label: "Pending", bg: C.bg, color: C.textMut, border: C.border },
  creating: { label: "Creating...", bg: C.infoLt, color: C.info, border: "#c3dafe" },
  syncing: { label: "Syncing...", bg: C.warnLt, color: C.warn, border: "#f0deb0" },
  complete: { label: "Complete", bg: C.sucLt, color: C.suc, border: "#c6f7e2" },
  error: { label: "Error", bg: C.danLt, color: C.dan, border: "#fddede" },
};

const emptyLocation = () => ({
  id: gid(),
  name: "",
  gingrApiKey: "",
  gingrResortId: "",
  igniteProfile: "",
  address: "",
  phone: "",
  managerEmail: "",
  timezone: "America/New_York",
  expanded: true,
  status: "pending",
  error: null,
  syncEnabled: true,
});

// ─── Location Card ───────────────────────────────────────────────────────────

const LocationCard = memo(function LocationCard({ location, index, total, onUpdate, onRemove, onToggleExpand }) {
  const status = STATUS_CONFIG[location.status] || STATUS_CONFIG.pending;
  const isProcessing = location.status === "creating" || location.status === "syncing";

  const handleField = useCallback((field, value) => {
    onUpdate(location.id, { ...location, [field]: value });
  }, [location, onUpdate]);

  const inputStyle = {
    width: "100%",
    padding: "10px 12px",
    border: `1.5px solid ${C.borderLight}`,
    borderRadius: 8,
    fontSize: 13,
    fontFamily: "'Outfit', sans-serif",
    color: C.text,
    background: C.surface,
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color 0.15s ease",
  };

  const labelStyle = {
    fontSize: 12,
    fontWeight: 600,
    color: C.textSec,
    marginBottom: 4,
    display: "block",
    fontFamily: "'Outfit', sans-serif",
  };

  return (
    <Card style={{
      padding: 0,
      overflow: "hidden",
      opacity: isProcessing ? 0.85 : 1,
      transition: "all 0.2s ease",
      border: `1.5px solid ${location.status === "error" ? C.dan : location.status === "complete" ? C.suc : C.border}`,
    }}>
      {/* Card Header */}
      <div
        onClick={() => onToggleExpand(location.id)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 20px",
          background: C.bg,
          borderBottom: location.expanded ? `1px solid ${C.borderLight}` : "none",
          cursor: "pointer",
          userSelect: "none",
          transition: "background 0.15s ease",
        }}
        onMouseEnter={e => (e.currentTarget.style.background = C.surfaceHover)}
        onMouseLeave={e => (e.currentTarget.style.background = C.bg)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12, color: C.textMut, fontWeight: 600, fontFamily: "'Outfit', sans-serif" }}>
            {location.expanded ? "▼" : "▶"}
          </span>
          <span style={{ fontSize: 15, fontWeight: 700, color: C.text, fontFamily: "'Outfit', sans-serif" }}>
            {location.name || `Location ${index + 1}`}
          </span>
          <Badge style={{
            background: status.bg,
            color: status.color,
            border: `1px solid ${status.border}`,
            fontSize: 11,
            fontWeight: 600,
          }}>
            {status.label}
          </Badge>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {location.status === "complete" && (
            <span style={{ fontSize: 16, color: C.suc }}>✓</span>
          )}
          {location.status === "error" && (
            <span style={{ fontSize: 16, color: C.dan }}>✕</span>
          )}
          {total > 1 && location.status === "pending" && (
            <button
              onClick={e => { e.stopPropagation(); onRemove(location.id); }}
              style={{
                width: 28,
                height: 28,
                border: "none",
                borderRadius: 6,
                background: C.danLt,
                color: C.dan,
                fontSize: 16,
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              title="Remove location"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Card Body */}
      {location.expanded && (
        <div style={{ padding: 20 }}>
          {/* Error message */}
          {location.error && (
            <div style={{
              padding: "10px 14px",
              background: C.danLt,
              borderRadius: 8,
              color: C.dan,
              fontSize: 13,
              marginBottom: 16,
              border: `1px solid #fddede`,
            }}>
              {location.error}
            </div>
          )}

          {/* Row 1: Name + Gingr fields */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>
                Location Name <span style={{ color: C.dan }}>*</span>
              </label>
              <input
                type="text"
                value={location.name}
                onChange={e => handleField("name", e.target.value)}
                placeholder="e.g. Cherry Hill"
                disabled={isProcessing}
                style={{ ...inputStyle, borderColor: !location.name && location.status !== "pending" ? C.dan : C.borderLight }}
                onFocus={e => (e.target.style.borderColor = C.pri)}
                onBlur={e => (e.target.style.borderColor = !location.name ? C.dan : C.borderLight)}
              />
            </div>
            <div>
              <label style={labelStyle}>Gingr API Key</label>
              <input
                type="text"
                value={location.gingrApiKey}
                onChange={e => handleField("gingrApiKey", e.target.value)}
                placeholder="API key for Gingr sync"
                disabled={isProcessing}
                style={inputStyle}
                onFocus={e => (e.target.style.borderColor = C.pri)}
                onBlur={e => (e.target.style.borderColor = C.borderLight)}
              />
            </div>
            <div>
              <label style={labelStyle}>Gingr Resort ID</label>
              <input
                type="text"
                value={location.gingrResortId}
                onChange={e => handleField("gingrResortId", e.target.value)}
                placeholder="Resort ID from Gingr"
                disabled={isProcessing}
                style={inputStyle}
                onFocus={e => (e.target.style.borderColor = C.pri)}
                onBlur={e => (e.target.style.borderColor = C.borderLight)}
              />
            </div>
          </div>

          {/* Row 2: Ignite, Address, Phone */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Ignite Profile #</label>
              <input
                type="text"
                value={location.igniteProfile}
                onChange={e => handleField("igniteProfile", e.target.value)}
                placeholder="Optional"
                disabled={isProcessing}
                style={inputStyle}
                onFocus={e => (e.target.style.borderColor = C.pri)}
                onBlur={e => (e.target.style.borderColor = C.borderLight)}
              />
            </div>
            <div>
              <label style={labelStyle}>Address</label>
              <input
                type="text"
                value={location.address}
                onChange={e => handleField("address", e.target.value)}
                placeholder="Full address"
                disabled={isProcessing}
                style={inputStyle}
                onFocus={e => (e.target.style.borderColor = C.pri)}
                onBlur={e => (e.target.style.borderColor = C.borderLight)}
              />
            </div>
            <div>
              <label style={labelStyle}>Phone</label>
              <input
                type="text"
                value={location.phone}
                onChange={e => handleField("phone", e.target.value)}
                placeholder="(555) 555-5555"
                disabled={isProcessing}
                style={inputStyle}
                onFocus={e => (e.target.style.borderColor = C.pri)}
                onBlur={e => (e.target.style.borderColor = C.borderLight)}
              />
            </div>
          </div>

          {/* Row 3: Manager Email + Timezone */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={labelStyle}>Manager Email</label>
              <input
                type="email"
                value={location.managerEmail}
                onChange={e => handleField("managerEmail", e.target.value)}
                placeholder="manager@resort.com"
                disabled={isProcessing}
                style={inputStyle}
                onFocus={e => (e.target.style.borderColor = C.pri)}
                onBlur={e => (e.target.style.borderColor = C.borderLight)}
              />
            </div>
            <div>
              <label style={labelStyle}>Timezone</label>
              <select
                value={location.timezone}
                onChange={e => handleField("timezone", e.target.value)}
                disabled={isProcessing}
                style={{
                  ...inputStyle,
                  cursor: "pointer",
                  appearance: "auto",
                }}
              >
                {TIMEZONE_OPTIONS.map(tz => (
                  <option key={tz.value} value={tz.value}>{tz.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
});

// ─── Progress Bar ────────────────────────────────────────────────────────────

function ProgressBar({ locations }) {
  const total = locations.length;
  const completed = locations.filter(l => l.status === "complete").length;
  const errors = locations.filter(l => l.status === "error").length;
  const inProgress = locations.filter(l => l.status === "creating" || l.status === "syncing").length;
  const pct = total > 0 ? Math.round(((completed + errors) / total) * 100) : 0;

  if (total === 0 || locations.every(l => l.status === "pending")) return null;

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.text, fontFamily: "'Outfit', sans-serif" }}>
          Progress: {completed}/{total} complete
          {errors > 0 && <span style={{ color: C.dan }}> ({errors} error{errors !== 1 ? "s" : ""})</span>}
        </span>
        <span style={{ fontSize: 12, color: C.textMut }}>{pct}%</span>
      </div>
      <div style={{ height: 6, background: C.bg, borderRadius: 3, overflow: "hidden" }}>
        <div style={{
          height: "100%",
          width: `${pct}%`,
          background: errors > 0 ? `linear-gradient(90deg, ${C.suc} 0%, ${C.dan} 100%)` : C.suc,
          borderRadius: 3,
          transition: "width 0.4s ease",
        }} />
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

function EnterpriseMultiResortSetup({ data, save, nav, profile, addGlobalToast }) {
  const [locations, setLocations] = useState([emptyLocation()]);
  const [processing, setProcessing] = useState(false);
  const [showSyncToggles, setShowSyncToggles] = useState(false);

  // ─── Location CRUD ────────────────────────────────────────────────────────
  const addLocation = useCallback(() => {
    setLocations(prev => [...prev, emptyLocation()]);
  }, []);

  const removeLocation = useCallback((id) => {
    setLocations(prev => prev.filter(l => l.id !== id));
  }, []);

  const updateLocation = useCallback((id, updated) => {
    setLocations(prev => prev.map(l => l.id === id ? updated : l));
  }, []);

  const toggleExpand = useCallback((id) => {
    setLocations(prev => prev.map(l => l.id === id ? { ...l, expanded: !l.expanded } : l));
  }, []);

  // ─── Validation ───────────────────────────────────────────────────────────
  const validate = useCallback((locs, requireGingr) => {
    let valid = true;
    const updated = locs.map(loc => {
      if (!loc.name.trim()) {
        valid = false;
        return { ...loc, error: "Location name is required." };
      }
      if (requireGingr && (!loc.gingrApiKey.trim() || !loc.gingrResortId.trim())) {
        valid = false;
        return { ...loc, error: "Gingr API Key and Resort ID are required for sync." };
      }
      return { ...loc, error: null };
    });
    return { valid, locations: updated };
  }, []);

  // ─── Create a single location in Supabase ─────────────────────────────────
  const createLocation = useCallback(async (loc) => {
    const slug = loc.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "");
    const payload = {
      id: gid(),
      name: loc.name.trim(),
      slug,
      gingr_api_key: loc.gingrApiKey || null,
      gingr_resort_id: loc.gingrResortId || null,
      ignite_profile: loc.igniteProfile || null,
      address: loc.address || null,
      phone: loc.phone || null,
      manager_email: loc.managerEmail || null,
      timezone: loc.timezone,
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("locations").insert(payload);
    if (error) throw new Error(error.message);
    return payload;
  }, []);

  // ─── Sync a location with Gingr ──────────────────────────────────────────
  const syncLocation = useCallback(async (loc) => {
    // Simulate Gingr sync — in production, this would call the Gingr API
    await new Promise(resolve => setTimeout(resolve, 800));
    return true;
  }, []);

  // ─── Process locations ────────────────────────────────────────────────────
  const processLocations = useCallback(async (mode) => {
    // mode: "create_sync_all" | "create_manual_sync" | "create_no_sync"
    const requireGingr = mode === "create_sync_all";
    const { valid, locations: validated } = validate(locations, requireGingr);

    if (!valid) {
      setLocations(validated);
      if (addGlobalToast) addGlobalToast("Please fix validation errors before proceeding.", "error");
      return;
    }

    if (mode === "create_manual_sync") {
      setShowSyncToggles(true);
      setLocations(validated);
      return;
    }

    setProcessing(true);

    for (let i = 0; i < validated.length; i++) {
      const loc = validated[i];
      // Set status to creating
      setLocations(prev => prev.map(l => l.id === loc.id ? { ...l, status: "creating", error: null } : l));

      try {
        await createLocation(loc);

        if (mode === "create_sync_all" && loc.gingrApiKey && loc.gingrResortId) {
          setLocations(prev => prev.map(l => l.id === loc.id ? { ...l, status: "syncing" } : l));
          await syncLocation(loc);
        }

        setLocations(prev => prev.map(l => l.id === loc.id ? { ...l, status: "complete" } : l));
      } catch (err) {
        setLocations(prev => prev.map(l => l.id === loc.id ? { ...l, status: "error", error: err.message } : l));
      }
    }

    setProcessing(false);
    if (addGlobalToast) {
      const successes = validated.filter((_, i) => true).length; // will be recounted from state
      addGlobalToast("Location setup complete!", "success");
    }
  }, [locations, validate, createLocation, syncLocation, addGlobalToast]);

  // ─── Manual sync execution ────────────────────────────────────────────────
  const executeManualSync = useCallback(async () => {
    setProcessing(true);
    setShowSyncToggles(false);

    for (const loc of locations) {
      setLocations(prev => prev.map(l => l.id === loc.id ? { ...l, status: "creating", error: null } : l));

      try {
        await createLocation(loc);

        if (loc.syncEnabled && loc.gingrApiKey && loc.gingrResortId) {
          setLocations(prev => prev.map(l => l.id === loc.id ? { ...l, status: "syncing" } : l));
          await syncLocation(loc);
        }

        setLocations(prev => prev.map(l => l.id === loc.id ? { ...l, status: "complete" } : l));
      } catch (err) {
        setLocations(prev => prev.map(l => l.id === loc.id ? { ...l, status: "error", error: err.message } : l));
      }
    }

    setProcessing(false);
    if (addGlobalToast) addGlobalToast("Location setup complete!", "success");
  }, [locations, createLocation, syncLocation, addGlobalToast]);

  // ─── Toggle sync per location ─────────────────────────────────────────────
  const toggleSync = useCallback((id) => {
    setLocations(prev => prev.map(l => l.id === id ? { ...l, syncEnabled: !l.syncEnabled } : l));
  }, []);

  const allComplete = locations.every(l => l.status === "complete" || l.status === "error");
  const hasPending = locations.some(l => l.status === "pending");

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'Outfit', sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 700, color: C.text, fontFamily: "'Outfit', sans-serif" }}>
            Multi-Resort Quick Setup
          </h2>
          <p style={{ margin: 0, fontSize: 14, color: C.textSec }}>
            Add and configure multiple resort locations at once. Fill in the details below and choose how to create them.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Badge style={{ background: C.priLt, color: C.pri, fontSize: 12, fontWeight: 600 }}>
            {locations.length} Location{locations.length !== 1 ? "s" : ""}
          </Badge>
        </div>
      </div>

      {/* Progress Bar */}
      <ProgressBar locations={locations} />

      {/* Location Cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 24 }}>
        {locations.map((loc, idx) => (
          <LocationCard
            key={loc.id}
            location={loc}
            index={idx}
            total={locations.length}
            onUpdate={updateLocation}
            onRemove={removeLocation}
            onToggleExpand={toggleExpand}
          />
        ))}
      </div>

      {/* Add Location Button */}
      {hasPending && !processing && (
        <button
          onClick={addLocation}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            width: "100%",
            padding: "14px 16px",
            border: `2px dashed ${C.border}`,
            borderRadius: 10,
            background: "transparent",
            color: C.pri,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "'Outfit', sans-serif",
            marginBottom: 24,
            transition: "all 0.15s ease",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = C.priLt; e.currentTarget.style.borderColor = C.pri; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = C.border; }}
        >
          + Add Another Location
        </button>
      )}

      {/* Sync Toggle Panel (for manual sync mode) */}
      {showSyncToggles && (
        <Card style={{ padding: 20, marginBottom: 24, border: `1.5px solid ${C.acc}`, background: C.accLt }}>
          <h4 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 700, color: C.text, fontFamily: "'Outfit', sans-serif" }}>
            Select Locations to Sync
          </h4>
          <p style={{ margin: "0 0 16px", fontSize: 13, color: C.textSec }}>
            Toggle sync on/off for each location. Locations without Gingr credentials will be created without syncing.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            {locations.map(loc => {
              const canSync = loc.gingrApiKey && loc.gingrResortId;
              return (
                <label
                  key={loc.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 14px",
                    borderRadius: 8,
                    background: C.surface,
                    border: `1px solid ${C.borderLight}`,
                    cursor: canSync ? "pointer" : "default",
                    opacity: canSync ? 1 : 0.6,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <input
                      type="checkbox"
                      checked={loc.syncEnabled && canSync}
                      onChange={() => toggleSync(loc.id)}
                      disabled={!canSync}
                      style={{ accentColor: C.acc, width: 16, height: 16 }}
                    />
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{loc.name || "Unnamed"}</span>
                  </div>
                  {!canSync && (
                    <Badge style={{ background: C.warnLt, color: C.warn, fontSize: 11 }}>No Gingr Credentials</Badge>
                  )}
                  {canSync && loc.syncEnabled && (
                    <Badge style={{ background: C.sucLt, color: C.suc, fontSize: 11 }}>Will Sync</Badge>
                  )}
                </label>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn
              onClick={() => setShowSyncToggles(false)}
              style={{ background: C.bg, color: C.textSec, border: `1px solid ${C.border}` }}
            >
              Cancel
            </Btn>
            <Btn
              onClick={executeManualSync}
              style={{ background: C.acc, color: "#fff", fontWeight: 600 }}
            >
              Create & Sync Selected
            </Btn>
          </div>
        </Card>
      )}

      {/* Action Bar */}
      {hasPending && !processing && !showSyncToggles && (
        <Card style={{
          padding: "16px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: C.surface,
          border: `1.5px solid ${C.border}`,
          position: "sticky",
          bottom: 16,
          boxShadow: "0 -4px 16px rgba(0,0,0,0.06)",
        }}>
          <div style={{ fontSize: 13, color: C.textSec }}>
            {locations.length} location{locations.length !== 1 ? "s" : ""} ready to create
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Btn
              onClick={() => processLocations("create_no_sync")}
              style={{
                background: C.bg,
                color: C.text,
                border: `1.5px solid ${C.border}`,
                fontWeight: 600,
                padding: "10px 18px",
                fontSize: 13,
              }}
            >
              Create Without Syncing
            </Btn>
            <Btn
              onClick={() => processLocations("create_manual_sync")}
              style={{
                background: C.surface,
                color: C.pri,
                border: `1.5px solid ${C.pri}`,
                fontWeight: 600,
                padding: "10px 18px",
                fontSize: 13,
              }}
            >
              Create & Manually Sync
            </Btn>
            <Btn
              onClick={() => processLocations("create_sync_all")}
              style={{
                background: C.pri,
                color: "#fff",
                fontWeight: 700,
                padding: "10px 22px",
                fontSize: 13,
                boxShadow: "0 2px 8px rgba(20,83,45,0.2)",
              }}
            >
              Create & Sync All
            </Btn>
          </div>
        </Card>
      )}

      {/* Processing Indicator */}
      {processing && (
        <Card style={{
          padding: "20px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          background: C.infoLt,
          border: `1.5px solid #c3dafe`,
        }}>
          <div style={{
            width: 20,
            height: 20,
            border: `3px solid ${C.priLt}`,
            borderTopColor: C.pri,
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: C.pri }}>Setting up locations...</span>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </Card>
      )}

      {/* All Complete Summary */}
      {allComplete && !hasPending && (
        <Card style={{
          padding: "24px",
          textAlign: "center",
          background: C.sucLt,
          border: `1.5px solid #c6f7e2`,
          marginTop: 16,
        }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>✓</div>
          <h3 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700, color: C.suc, fontFamily: "'Outfit', sans-serif" }}>
            Setup Complete
          </h3>
          <p style={{ margin: "0 0 16px", fontSize: 13, color: C.textSec }}>
            {locations.filter(l => l.status === "complete").length} of {locations.length} locations created successfully.
            {locations.filter(l => l.status === "error").length > 0 &&
              ` ${locations.filter(l => l.status === "error").length} had errors — review and retry as needed.`}
          </p>
          <Btn
            onClick={() => {
              setLocations([emptyLocation()]);
              setProcessing(false);
            }}
            style={{ background: C.pri, color: "#fff", fontWeight: 600 }}
          >
            Set Up More Locations
          </Btn>
        </Card>
      )}
    </div>
  );
}

export default EnterpriseMultiResortSetup;

// K9 Operations — EnterpriseChecklistTemplates (ENT-002)
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

// ─── Template Type Definitions ───────────────────────────────────────────────

const TEMPLATE_TYPES = [
  { id: "opening", label: "Opening", icon: "☀️", defaults: DEF_OPENING_TEMPLATE, hasTime: false },
  { id: "closing", label: "Closing", icon: "🌙", defaults: DEF_CLOSING_TEMPLATE, hasTime: false },
  { id: "frontend", label: "Front-End", icon: "🏠", defaults: DEF_FE_TEMPLATE, hasTime: true },
  { id: "backend", label: "Back-End", icon: "🐕", defaults: DEF_BE_TEMPLATE, hasTime: true },
  { id: "bathing", label: "Bathing", icon: "🛁", defaults: [], hasTime: true },
  { id: "eod", label: "EOD Report", icon: "📋", defaults: DEF_LITE_EOD_TEMPLATE, hasTime: false },
];

// ─── Draggable Item Row ──────────────────────────────────────────────────────

const TemplateItemRow = memo(function TemplateItemRow({ item, index, total, onUpdate, onRemove, onMove, hasTime }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "36px 1fr 120px 120px 36px 60px",
        gap: 8,
        alignItems: "center",
        padding: "10px 12px",
        background: index % 2 === 0 ? C.surface : "rgba(245,246,248,0.4)",
        borderBottom: `1px solid ${C.borderLight}`,
        transition: "background 0.15s ease",
      }}
    >
      {/* Index */}
      <div style={{ fontSize: 12, fontWeight: 600, color: C.textMut, textAlign: "center" }}>{index + 1}</div>

      {/* Label */}
      <input
        type="text"
        value={item.label}
        onChange={e => onUpdate(index, { ...item, label: e.target.value })}
        placeholder="Task description..."
        style={{
          padding: "8px 10px",
          border: `1.5px solid ${C.borderLight}`,
          borderRadius: 6,
          fontSize: 13,
          fontFamily: "'GT Eesti', sans-serif",
          color: C.text,
          background: C.surface,
          outline: "none",
          width: "100%",
          boxSizing: "border-box",
          transition: "border-color 0.15s ease",
        }}
        onFocus={e => (e.target.style.borderColor = C.pri)}
        onBlur={e => (e.target.style.borderColor = C.borderLight)}
      />

      {/* Time (optional) */}
      {hasTime ? (
        <input
          type="text"
          value={item.time || ""}
          onChange={e => onUpdate(index, { ...item, time: e.target.value })}
          placeholder="e.g. 8:00 AM"
          style={{
            padding: "8px 10px",
            border: `1.5px solid ${C.borderLight}`,
            borderRadius: 6,
            fontSize: 13,
            fontFamily: "'GT Eesti', sans-serif",
            color: C.text,
            background: C.surface,
            outline: "none",
            width: "100%",
            boxSizing: "border-box",
          }}
        />
      ) : (
        <div />
      )}

      {/* Day of Week (optional) */}
      <select
        value={item.dayOfWeek || ""}
        onChange={e => onUpdate(index, { ...item, dayOfWeek: e.target.value || undefined })}
        style={{
          padding: "8px 10px",
          border: `1.5px solid ${C.borderLight}`,
          borderRadius: 6,
          fontSize: 13,
          fontFamily: "'GT Eesti', sans-serif",
          color: item.dayOfWeek ? C.text : C.textMut,
          background: C.surface,
          cursor: "pointer",
        }}
      >
        <option value="">Any day</option>
        {DAY_NAMES_SHORT.map((d, i) => (
          <option key={i} value={d}>{d}</option>
        ))}
      </select>

      {/* Remove */}
      <button
        onClick={() => onRemove(index)}
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
          transition: "background 0.15s ease",
        }}
        onMouseEnter={e => (e.currentTarget.style.background = "#fddede")}
        onMouseLeave={e => (e.currentTarget.style.background = C.danLt)}
        title="Remove item"
      >
        ×
      </button>

      {/* Reorder */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <button
          onClick={() => onMove(index, -1)}
          disabled={index === 0}
          style={{
            width: 24,
            height: 16,
            border: "none",
            borderRadius: 3,
            background: index === 0 ? "transparent" : C.priLt,
            color: index === 0 ? C.textMut : C.pri,
            fontSize: 10,
            cursor: index === 0 ? "default" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ▲
        </button>
        <button
          onClick={() => onMove(index, 1)}
          disabled={index === total - 1}
          style={{
            width: 24,
            height: 16,
            border: "none",
            borderRadius: 3,
            background: index === total - 1 ? "transparent" : C.priLt,
            color: index === total - 1 ? C.textMut : C.pri,
            fontSize: 10,
            cursor: index === total - 1 ? "default" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ▼
        </button>
      </div>
    </div>
  );
});

// ─── Push to Locations Modal ─────────────────────────────────────────────────

function PushModal({ open, onClose, templateType, locations, onPush }) {
  const [selectedLocations, setSelectedLocations] = useState([]);
  const [pushing, setPushing] = useState(false);
  const [pushResults, setPushResults] = useState(null);

  const toggleLocation = useCallback((locId) => {
    setSelectedLocations(prev =>
      prev.includes(locId) ? prev.filter(id => id !== locId) : [...prev, locId]
    );
  }, []);

  const selectAll = useCallback(() => {
    setSelectedLocations(locations.filter(l => !l.isEnterprise).map(l => l.id));
  }, [locations]);

  const handlePush = useCallback(async (targetIds) => {
    setPushing(true);
    try {
      const results = await onPush(targetIds);
      setPushResults(results);
    } catch (err) {
      setPushResults({ error: err.message });
    } finally {
      setPushing(false);
    }
  }, [onPush]);

  if (!open) return null;

  return (
    <Modal onClose={onClose} title={`Push "${templateType}" Template to Locations`}>
      <div style={{ padding: "0 4px" }}>
        {!pushResults ? (
          <>
            <p style={{ fontSize: 13, color: C.textSec, margin: "0 0 16px", fontFamily: "'GT Eesti', sans-serif" }}>
              Select which locations should receive this template. Locations with existing overrides will be updated.
            </p>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: C.textMut, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Locations
              </span>
              <button
                onClick={selectAll}
                style={{
                  border: "none",
                  background: "none",
                  color: C.pri,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "'GT Eesti', sans-serif",
                  textDecoration: "underline",
                }}
              >
                Select All
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
              {locations.filter(l => !l.isEnterprise).map(loc => (
                <label
                  key={loc.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: `1.5px solid ${selectedLocations.includes(loc.id) ? C.pri : C.borderLight}`,
                    background: selectedLocations.includes(loc.id) ? C.priLt : C.surface,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedLocations.includes(loc.id)}
                    onChange={() => toggleLocation(loc.id)}
                    style={{ accentColor: C.pri, width: 16, height: 16 }}
                  />
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.text, fontFamily: "'GT Eesti', sans-serif" }}>
                    {loc.name}
                  </span>
                </label>
              ))}
              {locations.filter(l => !l.isEnterprise).length === 0 && (
                <div style={{ padding: 16, textAlign: "center", color: C.textMut, fontSize: 13 }}>
                  No locations available.
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Btn onClick={onClose} style={{ background: C.bg, color: C.textSec, border: `1px solid ${C.border}` }}>
                Cancel
              </Btn>
              <Btn
                onClick={() => handlePush(selectedLocations)}
                disabled={selectedLocations.length === 0 || pushing}
                style={{
                  background: selectedLocations.length === 0 ? C.textMut : C.pri,
                  color: "#fff",
                  opacity: pushing ? 0.7 : 1,
                }}
              >
                {pushing ? "Pushing..." : `Push to ${selectedLocations.length} Location${selectedLocations.length !== 1 ? "s" : ""}`}
              </Btn>
            </div>
          </>
        ) : (
          <>
            {pushResults.error ? (
              <div style={{ padding: 16, background: C.danLt, borderRadius: 8, color: C.dan, fontSize: 13, marginBottom: 16 }}>
                Error: {pushResults.error}
              </div>
            ) : (
              <div style={{ padding: 16, background: C.sucLt, borderRadius: 8, color: C.suc, fontSize: 13, marginBottom: 16, fontWeight: 600 }}>
                Template pushed successfully to {pushResults.count || selectedLocations.length} location(s).
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Btn
                onClick={() => { setPushResults(null); setSelectedLocations([]); onClose(); }}
                style={{ background: C.pri, color: "#fff" }}
              >
                Done
              </Btn>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

// ─── Location Override Status ────────────────────────────────────────────────

function LocationOverrideList({ overrides, locations }) {
  const nonEntLocations = locations.filter(l => !l.isEnterprise);
  if (nonEntLocations.length === 0) return null;

  return (
    <div style={{ marginTop: 20 }}>
      <h4 style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 700, color: C.text, textTransform: "uppercase", letterSpacing: 0.5 }}>
        Location Status
      </h4>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {nonEntLocations.map(loc => {
          const hasOverride = overrides[loc.id];
          return (
            <div
              key={loc.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 12px",
                borderRadius: 6,
                background: hasOverride ? C.warnLt : C.sucLt,
                border: `1px solid ${hasOverride ? "#f0deb0" : "#c6f7e2"}`,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: C.text, fontFamily: "'GT Eesti', sans-serif" }}>
                {loc.name}
              </span>
              <Badge style={{ background: hasOverride ? C.warnLt : C.sucLt, color: hasOverride ? C.warn : C.suc, fontSize: 11 }}>
                {hasOverride ? "Custom Override" : "Using Default"}
              </Badge>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

function EnterpriseChecklistTemplates({ data, save, nav, profile, addGlobalToast }) {
  const [activeTab, setActiveTab] = useState("opening");
  const [templates, setTemplates] = useState({});
  const [defaults, setDefaults] = useState({});
  const [overrides, setOverrides] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pushModalOpen, setPushModalOpen] = useState(false);
  const [dirty, setDirty] = useState(false);

  const locations = K9_LOCATIONS || [];
  const activeType = TEMPLATE_TYPES.find(t => t.id === activeTab);

  // ─── Load templates from Supabase ─────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const { data: settings } = await supabase
          .from("lite_settings")
          .select("key, value")
          .in("key", ["enterprise_checklist_templates", "location_checklist_overrides"]);

        if (cancelled) return;

        const templatesData = settings?.find(s => s.key === "enterprise_checklist_templates")?.value || {};
        const overridesData = settings?.find(s => s.key === "location_checklist_overrides")?.value || {};

        // Initialize templates from saved data or defaults
        const initialized = {};
        const initDefaults = {};
        TEMPLATE_TYPES.forEach(type => {
          initialized[type.id] = templatesData[type.id]?.items || type.defaults.map(item => ({ ...item, id: item.id || gid() }));
          initDefaults[type.id] = templatesData[type.id]?.isDefault !== false;
        });

        setTemplates(initialized);
        setDefaults(initDefaults);
        setOverrides(overridesData);
      } catch (err) {
        console.error("Failed to load checklist templates:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // ─── Item CRUD ────────────────────────────────────────────────────────────
  const updateItem = useCallback((index, updated) => {
    setTemplates(prev => {
      const items = [...prev[activeTab]];
      items[index] = updated;
      return { ...prev, [activeTab]: items };
    });
    setDirty(true);
  }, [activeTab]);

  const removeItem = useCallback((index) => {
    setTemplates(prev => {
      const items = [...prev[activeTab]];
      items.splice(index, 1);
      return { ...prev, [activeTab]: items };
    });
    setDirty(true);
  }, [activeTab]);

  const addItem = useCallback(() => {
    setTemplates(prev => ({
      ...prev,
      [activeTab]: [...(prev[activeTab] || []), { id: gid(), label: "", time: "", dayOfWeek: undefined }],
    }));
    setDirty(true);
  }, [activeTab]);

  const moveItem = useCallback((index, direction) => {
    setTemplates(prev => {
      const items = [...prev[activeTab]];
      const newIndex = index + direction;
      if (newIndex < 0 || newIndex >= items.length) return prev;
      const temp = items[index];
      items[index] = items[newIndex];
      items[newIndex] = temp;
      return { ...prev, [activeTab]: items };
    });
    setDirty(true);
  }, [activeTab]);

  const toggleDefault = useCallback(() => {
    setDefaults(prev => ({ ...prev, [activeTab]: !prev[activeTab] }));
    setDirty(true);
  }, [activeTab]);

  const resetToDefaults = useCallback(() => {
    if (!activeType) return;
    setTemplates(prev => ({
      ...prev,
      [activeTab]: activeType.defaults.map(item => ({ ...item, id: item.id || gid() })),
    }));
    setDirty(true);
  }, [activeTab, activeType]);

  // ─── Save ─────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const payload = {};
      TEMPLATE_TYPES.forEach(type => {
        payload[type.id] = {
          items: templates[type.id] || [],
          isDefault: defaults[type.id] !== false,
          updatedAt: new Date().toISOString(),
        };
      });

      await supabase.from("lite_settings").upsert({
        key: "enterprise_checklist_templates",
        value: payload,
      }, { onConflict: "key" });

      setDirty(false);
      if (addGlobalToast) addGlobalToast("Templates saved successfully", "success");
    } catch (err) {
      console.error("Failed to save templates:", err);
      if (addGlobalToast) addGlobalToast("Failed to save templates", "error");
    } finally {
      setSaving(false);
    }
  }, [templates, defaults, addGlobalToast]);

  // ─── Push to Locations ────────────────────────────────────────────────────
  const handlePush = useCallback(async (locationIds) => {
    const currentItems = templates[activeTab] || [];
    const updatedOverrides = { ...overrides };
    locationIds.forEach(locId => {
      if (!updatedOverrides[locId]) updatedOverrides[locId] = {};
      updatedOverrides[locId][activeTab] = {
        items: currentItems,
        pushedAt: new Date().toISOString(),
        source: "enterprise",
      };
    });

    await supabase.from("lite_settings").upsert({
      key: "location_checklist_overrides",
      value: updatedOverrides,
    }, { onConflict: "key" });

    setOverrides(updatedOverrides);
    if (addGlobalToast) addGlobalToast(`Template pushed to ${locationIds.length} location(s)`, "success");
    return { count: locationIds.length };
  }, [activeTab, templates, overrides, addGlobalToast]);

  const currentItems = templates[activeTab] || [];

  // ─── Loading State ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400 }}>
        <K9LoadingAnimation />
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'GT Eesti', sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 700, color: C.text, fontFamily: "'Canela', Georgia, serif" }}>
            Checklist Template Management
          </h2>
          <p style={{ margin: 0, fontSize: 14, color: C.textSec }}>
            Create, customize, and push standardized checklist templates across all locations.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {dirty && (
            <Badge style={{ background: C.warnLt, color: C.warn, fontSize: 11 }}>Unsaved Changes</Badge>
          )}
          <Btn
            onClick={handleSave}
            disabled={saving || !dirty}
            style={{
              background: dirty ? C.pri : C.textMut,
              color: "#fff",
              opacity: saving ? 0.7 : 1,
              fontWeight: 600,
              padding: "10px 20px",
              fontSize: 13,
            }}
          >
            {saving ? "Saving..." : "Save Templates"}
          </Btn>
        </div>
      </div>

      {/* Main Layout: Sidebar + Content */}
      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 20, minHeight: 500 }}>
        {/* ─── Left Sidebar: Template Type Tabs ─────────────────────────────── */}
        <div>
          <Card style={{ padding: 8, background: C.surface }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: 0.5, padding: "8px 12px 6px", marginBottom: 2 }}>
              Template Types
            </div>
            {TEMPLATE_TYPES.map(type => {
              const isActive = activeTab === type.id;
              const itemCount = (templates[type.id] || []).length;
              return (
                <button
                  key={type.id}
                  onClick={() => setActiveTab(type.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                    padding: "10px 12px",
                    border: "none",
                    borderRadius: 8,
                    background: isActive ? C.priLt : "transparent",
                    color: isActive ? C.pri : C.text,
                    fontSize: 13,
                    fontWeight: isActive ? 700 : 500,
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: "'GT Eesti', sans-serif",
                    transition: "all 0.15s ease",
                    marginBottom: 2,
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = C.surfaceHover; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                >
                  <span>{type.icon} {type.label}</span>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: isActive ? C.pri : C.textMut,
                    background: isActive ? "rgba(0,52,98,0.1)" : C.bg,
                    padding: "2px 7px",
                    borderRadius: 10,
                  }}>
                    {itemCount}
                  </span>
                </button>
              );
            })}
          </Card>

          {/* Location Override Status */}
          <LocationOverrideList overrides={overrides[activeTab] ? { ...Object.fromEntries(Object.entries(overrides).filter(([, v]) => v[activeTab])) } : {}} locations={locations} />
        </div>

        {/* ─── Main Content Area ────────────────────────────────────────────── */}
        <div>
          <Card style={{ padding: 0, overflow: "hidden" }}>
            {/* Template Header */}
            <div style={{
              padding: "16px 20px",
              background: C.bg,
              borderBottom: `1.5px solid ${C.border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 20 }}>{activeType?.icon}</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text, fontFamily: "'Canela', Georgia, serif" }}>
                    {activeType?.label} Template
                  </h3>
                  <span style={{ fontSize: 12, color: C.textSec }}>{currentItems.length} item{currentItems.length !== 1 ? "s" : ""}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {/* Default Toggle */}
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 12px",
                    borderRadius: 6,
                    background: defaults[activeTab] ? C.sucLt : C.bg,
                    border: `1px solid ${defaults[activeTab] ? "#c6f7e2" : C.border}`,
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 600,
                    color: defaults[activeTab] ? C.suc : C.textSec,
                    transition: "all 0.15s ease",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={defaults[activeTab] || false}
                    onChange={toggleDefault}
                    style={{ accentColor: C.suc, width: 14, height: 14 }}
                  />
                  Default for New Locations
                </label>

                <Btn
                  onClick={resetToDefaults}
                  style={{ background: C.bg, color: C.textSec, border: `1px solid ${C.border}`, fontSize: 12, padding: "6px 12px" }}
                >
                  Reset to Defaults
                </Btn>

                <Btn
                  onClick={() => setPushModalOpen(true)}
                  style={{ background: C.acc, color: "#fff", fontSize: 12, padding: "6px 14px", fontWeight: 600 }}
                >
                  Push to Locations
                </Btn>
              </div>
            </div>

            {/* Column Headers */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "36px 1fr 120px 120px 36px 60px",
              gap: 8,
              padding: "8px 12px",
              borderBottom: `1px solid ${C.borderLight}`,
              background: C.surface,
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", textAlign: "center" }}>#</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase" }}>Task Description</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase" }}>{activeType?.hasTime ? "Time" : ""}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase" }}>Day</span>
              <span />
              <span style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", textAlign: "center" }}>Order</span>
            </div>

            {/* Items */}
            {currentItems.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: C.textMut, fontSize: 14 }}>
                No items yet. Click "Add Item" to get started.
              </div>
            ) : (
              currentItems.map((item, idx) => (
                <TemplateItemRow
                  key={item.id || idx}
                  item={item}
                  index={idx}
                  total={currentItems.length}
                  onUpdate={updateItem}
                  onRemove={removeItem}
                  onMove={moveItem}
                  hasTime={activeType?.hasTime || false}
                />
              ))
            )}

            {/* Add Item Button */}
            <div style={{ padding: "12px 16px", borderTop: `1px solid ${C.borderLight}` }}>
              <button
                onClick={addItem}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "10px 16px",
                  border: `1.5px dashed ${C.border}`,
                  borderRadius: 8,
                  background: "transparent",
                  color: C.pri,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "'GT Eesti', sans-serif",
                  width: "100%",
                  justifyContent: "center",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = C.priLt; e.currentTarget.style.borderColor = C.pri; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = C.border; }}
              >
                + Add Item
              </button>
            </div>
          </Card>
        </div>
      </div>

      {/* Push to Locations Modal */}
      <PushModal
        open={pushModalOpen}
        onClose={() => setPushModalOpen(false)}
        templateType={activeType?.label || ""}
        locations={locations}
        onPush={handlePush}
      />
    </div>
  );
}

export default EnterpriseChecklistTemplates;

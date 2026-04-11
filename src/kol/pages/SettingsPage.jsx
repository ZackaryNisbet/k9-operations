// K9 Operations — SettingsPage
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
import useGingrData from "../../hooks/useGingrData";
import { useAuth } from "../../AuthProvider";

// Settings tab imports
import GingrIntegrationTab from "../settings/GingrIntegrationTab";
import RoomConfig from "../settings/RoomConfig";
import TeamManagementTab from "../settings/TeamManagementTab";
import PermissionsTab from "../settings/PermissionsTab";
import RequiredFieldsTab from "../settings/RequiredFieldsTab";
import ChecklistTemplatesTab from "../settings/ChecklistTemplatesTab";
import RetentionThresholdsTab from "../settings/RetentionThresholdsTab";
import IgniteSettingsTab from "../settings/IgniteSettingsTab";
import IgniteParserConfigTab from "../settings/IgniteParserConfigTab";
import DashboardRefreshTab from "../settings/DashboardRefreshTab";
import ApiOverviewTab from "../settings/ApiOverviewTab";
import ApiDashboardTab from "../settings/ApiDashboardTab";
import RoleLayoutPage from "./RoleLayoutPage";

// ── Subscription Management Tab ────────────────────────────────────────────
const PLAN_LABELS = {
  single_location: "Starter — Single Location",
  multi_location_3: "Growth — Up to 3 Locations",
  multi_location_10: "Scale — Up to 10 Locations",
  enterprise: "Enterprise — Unlimited",
};

function SubscriptionTab({ profile, addGlobalToast }) {
  const [sub, setSub] = useState(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    if (!profile?.user_id && !profile?.id) { setLoading(false); return; }
    const uid = profile.user_id || profile.id;
    supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", uid)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data: row }) => { setSub(row); setLoading(false); });
  }, [profile?.user_id, profile?.id]);

  const openPortal = async () => {
    setPortalLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-checkout", {
        body: { action: "portal", user_id: profile?.user_id || profile?.id },
      });
      if (error) throw error;
      if (data?.url) window.location.href = data.url;
    } catch {
      addGlobalToast?.("Could not open billing portal.", "error");
    } finally {
      setPortalLoading(false);
    }
  };

  if (loading) return <div style={{ padding: 20, color: C.textSec }}>Loading subscription...</div>;

  return (
    <div>
      <h3 style={{ margin: "0 0 20px", fontSize: 18, fontWeight: 700, color: C.text }}>Subscription</h3>
      {sub ? (
        <div style={{ background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 14, padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{PLAN_LABELS[sub.plan_type] || sub.plan_type}</div>
              <div style={{ fontSize: 12, color: C.textMut, marginTop: 4 }}>
                Status: <span style={{ color: sub.status === "active" ? C.suc : C.warn, fontWeight: 600 }}>{sub.status}</span>
              </div>
            </div>
            <Badge color={sub.status === "active" ? "success" : "warning"}>{sub.status}</Badge>
          </div>
          {sub.current_period_end && (
            <div style={{ fontSize: 13, color: C.textSec, marginBottom: 16 }}>
              Current period ends: {new Date(sub.current_period_end).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </div>
          )}
          <Btn variant="secondary" size="sm" onClick={openPortal} disabled={portalLoading}>
            {portalLoading ? "Opening..." : "Manage Billing"}
          </Btn>
        </div>
      ) : (
        <div style={{ background: C.priLt, border: `1.5px solid ${C.pri}40`, borderRadius: 14, padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 8 }}>No active subscription</div>
          <div style={{ fontSize: 13, color: C.textSec, marginBottom: 16 }}>Choose a plan to unlock all features.</div>
          <Btn variant="primary" size="sm" onClick={() => { window.location.href = "/pricing"; }}>
            View Plans
          </Btn>
        </div>
      )}
    </div>
  );
}

// ── Room Cleaning Settings Tab ─────────────────────────────────────────────
function RoomCleaningSettingsTab({ profile, addGlobalToast }) {
  const [carryOverEnabled, setCarryOverEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const locationId = profile?.location_id;
  const SETTING_KEY = "room_cleaning_missed_carry_over";

  useEffect(() => {
    if (!locationId) { setLoading(false); return; }
    supabase.from("lite_settings").select("setting_value")
      .eq("location_id", locationId)
      .eq("setting_key", SETTING_KEY)
      .limit(1)
      .maybeSingle()
      .then(({ data: row }) => {
        if (row?.setting_value?.enabled) setCarryOverEnabled(true);
        setLoading(false);
      });
  }, [locationId]);

  const toggleCarryOver = async (val) => {
    setCarryOverEnabled(val);
    if (!locationId) return;
    await supabase.from("lite_settings").upsert({
      location_id: locationId,
      setting_key: SETTING_KEY,
      setting_value: { enabled: val },
    }, { onConflict: "location_id,setting_key" });
    addGlobalToast?.(`Missed cleaning carry-over ${val ? "enabled" : "disabled"}.`, "success");
  };

  if (loading) return <div style={{ padding: 20, color: C.textSec }}>Loading...</div>;

  return (
    <div>
      <h3 style={{ margin: "0 0 20px", fontSize: 18, fontWeight: 700, color: C.text }}>Room Cleaning</h3>
      <div style={{ background: C.surface, borderRadius: 12, padding: "20px 24px", border: `1.5px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>Missed Cleaning Carry-Over</div>
            <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.5 }}>
              When enabled, missed disinfects and as-needed tasks from the previous day appear as actionable checkboxes (in amber) on today's room cleaning list. Refreshes and setups do not carry over.
            </div>
          </div>
          <button
            onClick={() => toggleCarryOver(!carryOverEnabled)}
            style={{
              width: 48, height: 26, borderRadius: 13, border: "none", cursor: "pointer",
              background: carryOverEnabled ? C.pri : C.border,
              position: "relative", transition: "background 0.2s", flexShrink: 0,
            }}
          >
            <div style={{
              width: 20, height: 20, borderRadius: 10, background: "#fff",
              position: "absolute", top: 3,
              left: carryOverEnabled ? 25 : 3,
              transition: "left 0.2s",
              boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
            }} />
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingsPage({ profile: parentProfile, addGlobalToast }) {
  const [tab, setTab] = useState(null); // null = show grid, set = show detail
  const [searchQuery, setSearchQuery] = useState("");
  const { profile: authProfile } = useAuth();
  const profile = parentProfile || authProfile;
  const data = useGingrData(profile?.location_id || "cherry-hill");
  const save = useCallback(() => {}, []);

  const sections = [
    {
      id: "dashboard",
      label: "Dashboard",
      cards: [
        { id: "dashboard-refresh", label: "Dashboard Refresh", desc: "Configure refresh interval and business hours for automatic data updates" },
      ],
    },
    {
      id: "integrations",
      label: "Integrations",
      cards: [
        { id: "gingr", label: "Gingr Integration", desc: "Connect and configure Gingr POS" },
        { id: "api-overview", label: "API Overview", desc: "View all Gingr API call types, frequencies, projected daily usage, and sync state" },
        { id: "api-dashboard", label: "API Dashboard", desc: "All Gingr API endpoints, frequencies, configurable polling, and daily call projections" },
      ],
    },
    {
      id: "ignite",
      label: "Ignite",
      cards: [
        { id: "ignite-settings", label: "Ignite Configuration", desc: "Configure Ignite profile, email forwarding, and connection status per location" },
        { id: "ignite-parser", label: "Email Parser Rules", desc: "Configure email parsing rules and map inbound leads to Gingr customer records" },
      ],
    },
    {
      id: "team-security",
      label: "Team & Security",
      cards: [
        { id: "team", label: "Team Management", desc: "Manage team members and roles" },
        { id: "permissions", label: "Permissions", desc: "Configure access controls" },
      ],
    },
    {
      id: "operations",
      label: "Operations",
      cards: [
        { id: "room-cleaning", label: "Room Cleaning", desc: "Configure missed cleaning carry-over behavior and display settings" },
        { id: "role-layout", label: "Role Layout", desc: "Matrix view: configure tasks and workflows across PCT, CSR, and MOD for all time-of-day sections" },
      ],
    },
    {
      id: "lifecycle",
      label: "Customer Lifecycle",
      cards: [
        { id: "lapsed-thresholds", label: "Retention Thresholds", desc: "Configure days of inactivity before a client moves from Active to Lapsed" },
      ],
    },
    {
      id: "data",
      label: "Data & Fields",
      cards: [
        { id: "required-fields", label: "Field Mapping", desc: "Map fields between K9 Ops and Gingr" },
        { id: "checklist-templates", label: "Checklist Templates", desc: "Customize opening, closing, FE, and BE checklists" },
      ],
    },
    {
      id: "billing",
      label: "Billing & Subscription",
      cards: [
        { id: "subscription", label: "Subscription", desc: "Manage your plan, billing, and payment method" },
      ],
    },
  ];

  // Filter cards by search
  const filteredSections = sections.map(section => ({
    ...section,
    cards: section.cards.filter(card =>
      card.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      card.desc.toLowerCase().includes(searchQuery.toLowerCase())
    ),
  })).filter(section => section.cards.length > 0);

  // Tab detail components
  const renderDetail = () => {
    switch (tab) {
      case "dashboard-refresh":
        return <DashboardRefreshTab />;
      case "gingr":
        return <GingrIntegrationTab />;
      case "team":
        return <TeamManagementTab profile={profile} data={data} save={save} />;
      case "permissions":
        return <PermissionsTab />;
      case "lapsed-thresholds":
        return <RetentionThresholdsTab />;
      case "required-fields":
        return <RequiredFieldsTab />;
      case "checklist-templates":
        return <ChecklistTemplatesTab />;
      case "ignite-settings":
        return <IgniteSettingsTab />;
      case "ignite-parser":
        return <IgniteParserConfigTab />;
      case "api-overview":
        return <ApiOverviewTab />;
      case "api-dashboard":
        return <ApiDashboardTab />;
      case "role-layout":
        return <RoleLayoutPage profile={profile} addGlobalToast={addGlobalToast} />;
      case "subscription":
        return <SubscriptionTab profile={profile} addGlobalToast={addGlobalToast} />;
      case "room-cleaning":
        return <RoomCleaningSettingsTab profile={profile} addGlobalToast={addGlobalToast} />;
      default:
        return null;
    }
  };

  return (
    <div>
      {tab === null ? (
        // Grid view
        <div>
          <h2 style={{ margin: "0 0 24px", fontSize: 22, fontWeight: 700, color: C.text, fontFamily: "'Outfit', sans-serif" }}>Settings</h2>

          {/* Search Bar */}
          <div style={{ marginBottom: 32 }}>
            <input
              type="text"
              placeholder="Search settings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                maxWidth: 400,
                padding: "10px 14px",
                borderRadius: 10,
                border: `1.5px solid ${C.border}`,
                fontSize: 14,
                fontFamily: "inherit",
                background: C.surface,
                color: C.text,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Categorized Card Grid */}
          {filteredSections.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 20px", color: C.textSec }}>
              <p style={{ fontSize: 14 }}>No settings found matching your search.</p>
            </div>
          ) : (
            filteredSections.map((section) => (
              <div key={section.id} style={{ marginBottom: 32 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 16 }}>
                  {section.label}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
                  {section.cards.map((card) => (
                    <div
                      key={card.id}
                      onClick={() => setTab(card.id)}
                      style={{
                        background: C.surface,
                        borderRadius: 12,
                        padding: "18px 20px",
                        border: `1.5px solid ${C.pri}40`,
                        cursor: "pointer",
                        transition: "all 0.2s",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = "translateY(-2px)";
                        e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = "none";
                        e.currentTarget.style.boxShadow = "none";
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 6 }}>{card.label}</div>
                        <div style={{ fontSize: 12, color: C.textSec }}>{card.desc}</div>
                      </div>
                      <span style={{ color: C.textMut, fontSize: 16, flexShrink: 0, marginLeft: 12 }}>›</span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        // Detail view
        <div>
          <button
            onClick={() => setTab(null)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              marginBottom: 24,
              border: "none",
              background: "none",
              color: C.pri,
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 600,
              fontFamily: "inherit",
            }}
          >
            ← Back to Settings
          </button>
          {renderDetail()}
        </div>
      )}
    </div>
  );
}


// ─── Photos Page ──────────────────────────────────────────────────────────

export default SettingsPage;

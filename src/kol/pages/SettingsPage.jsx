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

function SettingsPage({ profile: parentProfile, addGlobalToast }) {
  const [tab, setTab] = useState(null); // null = show grid, set = show detail
  const [searchQuery, setSearchQuery] = useState("");
  const { profile: authProfile } = useAuth();
  const profile = parentProfile || authProfile;
  const data = useGingrData(profile?.location_id || "cherry-hill");
  const save = useCallback(() => {}, []);

  const sections = [
    {
      id: "integrations",
      label: "Integrations",
      cards: [
        { id: "gingr", label: "Gingr Integration", desc: "Connect and configure Gingr POS" },
      ],
    },
    {
      id: "ignite",
      label: "Ignite",
      cards: [
        { id: "ignite-settings", label: "Ignite Configuration", desc: "Configure Ignite profile, email forwarding, and connection status per location" },
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
      id: "lifecycle",
      label: "Customer Lifecycle",
      cards: [
        { id: "retention-thresholds", label: "Retention Thresholds", desc: "Configure days of inactivity before a client moves from Active to Retention" },
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
      case "gingr":
        return <GingrIntegrationTab />;
      case "team":
        return <TeamManagementTab profile={profile} data={data} save={save} />;
      case "permissions":
        return <PermissionsTab />;
      case "retention-thresholds":
        return <RetentionThresholdsTab />;
      case "required-fields":
        return <RequiredFieldsTab />;
      case "checklist-templates":
        return <ChecklistTemplatesTab />;
      case "ignite-settings":
        return <IgniteSettingsTab />;
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

// © 2026 K9 Operations LLC. All Rights Reserved.
// Proprietary and Confidential. Unauthorized copying, modification,
// distribution, or use of this software is strictly prohibited.

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import ReactDOM from "react-dom";
import { useData } from "./useData";
import { useAuth } from "./AuthProvider";
import { supabase } from "./supabaseClient";

import { uuid } from "./pos/lib/ids";

import { I } from "./pos/icons";

import { K9Logo, K9LogoMini } from "./pos/brand";

// K9 Operations Locations
import { K9_LOCATIONS } from "./pos/constants/locations";

import { POS_BASE, buildUrl, parseUrl } from "./pos/lib/routing";

import { LocationSelector } from "./pos/components/LocationSelector";


// ─── Utilities ──────────────────────────────────────────────────────────────
import { gid, formatDogNames, titleCase, fmtPhone, _toDateStr, fmtDate, fmtDateFull, fmtDateShort, fmtTime, fmtInstr, summarizeFeeding, summarizeMeds, todayStr, getSimulatedNow, formatTime12hr, addDays, getMonday, getWeekDays, shortDay, dayNum } from "./pos/lib/format";

import { getVaxStatus } from "./pos/lib/vaccines";

// === Vaccine Reminder Engine ===
// Scans all dogs, matches expiring vaccines to configured tiers, deduplicates against log,
// batches multiple vaccines per client, and returns an array of reminder actions to send.
import { buildVaccineReminders } from "./pos/lib/vaccineReminders";

import { getDogAgeCompliance, getSpayNeuterCompliance, calcAge, fixedLabel, getDogDaycareSize } from "./pos/lib/dogHelpers";


import { EVAL_SECTIONS, EVAL_SCORE_PTS, getEvalAgeBucket, scoreEvalAge, calcEvalSectionPts, getEvalVisibleSections, getEvalVisibleQuestions, getEvalMaxScore, getEvalTotalScore, getEvalResult, hasCompletedEval } from "./pos/lib/evaluation";

import { countNights, countHours, getAddOnPrices, calcReservationPricing } from "./pos/lib/pricing";

import { C, TAG_COLORS } from "./pos/constants/colors";

import { PERMISSION_CATEGORIES, ALL_PERM_KEYS, buildPerms, DEFAULT_ROLES } from "./pos/constants/permissions";

import { DEF_EOD_TEMPLATE, DEF_OPENING_TEMPLATE, DEF_FE_TEMPLATE, DEF_BE_TEMPLATE, DEF_CLOSING_TEMPLATE, OPS_TYPES, DAY_NAMES_SHORT, OPERATIONS_CATALOG } from "./pos/constants/operations";

import { getRoomCleaningStats, getPPStats, getOpsCardStatus, getOpsProgress, getOpsCountLabel } from "./pos/lib/ops";

import { DEF_CLIENT_FIELDS, DEF_DOG_FIELDS } from "./pos/constants/fields";

import { ACTION_LEVELS, ACTION_LABELS, isFieldRequired, validateFields, migrateFieldsToMatrix } from "./pos/lib/fieldRules";

import { DEF_AGREEMENTS, DEF_QUESTIONNAIRE, DEF_DOG_TAGS, CLASSIFICATION_TAG_IDS, ROOM_TYPES, EVAL_RESULTS, DEF_HOTKEY_BINDINGS, HOTKEY_LABELS } from "./pos/constants/forms";

import { DEF_PRICING } from "./pos/constants/pricing";

import { DEF_BREED_OPTIONS, DEF_FEEDING_TIME_OPTIONS, DEF_FEEDING_UNIT_OPTIONS, DEF_FOOD_TYPE_OPTIONS, DEF_FOOD_SOURCE_OPTIONS, DEF_FEEDING_INSTRUCTION_OPTIONS, DEF_MEDICATION_UNIT_OPTIONS, DEF_MEDICATION_TIME_OPTIONS, DEF_MEDICATION_NAME_OPTIONS, DEF_MEDICATION_INSTRUCTION_OPTIONS, DEF_BATH_TYPE_OPTIONS } from "./pos/constants/dropdowns";

import { VACCINES, DEF_REQUIRED_VACCINES } from "./pos/constants/vaccines";

// ─── Demo Data Generator ─────────────────────────────────────────────────────
import { DEMO, NEW_LOCATION_DEFAULTS } from "./pos/demo/demoData";

// ─── Reusable Components ────────────────────────────────────────────────────
import { ErrorBoundary, Hl, Tip, Badge, Btn, CustomSelect, MiniDatePicker, fmtPhoneInput, Inp, CalendarPicker, Card, Modal } from "./pos/components/ui";

// Stable compliance CheckItem — defined at module level so React doesn't unmount/remount on every render
import { ComplianceCheckItem } from "./pos/components/ComplianceCheckItem";


// Discount picker dropdown — shows configured discounts from Settings
import { DiscountPicker } from "./pos/components/DiscountPicker";

// Manual discount entry (shown when no configured discounts are available)
import { ManualDiscountEntry } from "./pos/components/ManualDiscountEntry";



import { LEGACY_ROLE_MAP, ROLE_CODE_MAP, _resolveRole, hasPermission, getRoleName, getRoleColor, NAV_PERM_MAP } from "./pos/lib/roles";

import { FeedMedBreakdown, ItemizedReceipt, VaxIcon, DogAvatar, buildAuditEntry } from "./pos/components/widgets";

// ─── Agreement Status Icons (for client rows) ──────────────────────────────
import { agrSigned } from "./pos/lib/agreements";

import { AgreementIcons } from "./pos/components/AgreementIcons";

// ─── Dog Tag Chips ──────────────────────────────────────────────────────────
import { DogTagChips } from "./pos/components/DogTagChips";


// ─── Dog Avatar ─────────────────────────────────────────────────────────────


import { DogPicHover } from "./pos/components/DogPicHover";

// ─── Data Hook ──────────────────────────────────────────────────────────────
// useData is now imported from ./useData.js (Supabase-powered)


// ═══════════════════════════════════════════════════════════════════════════
// BOARDING PREVIEW / CHECK-IN MODAL
// ═══════════════════════════════════════════════════════════════════════════
import { BoardingPreviewModal } from "./pos/components/BoardingPreviewModal";

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD - Tabbed layout with check-in/out times
// ═══════════════════════════════════════════════════════════════════════════
import { DashboardPage } from "./pos/pages/DashboardPage";

// ═══════════════════════════════════════════════════════════════════════════
// STRUCTURED FILTER DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════
import { LC_FILTER_FIELDS, LC_OP_LABELS, applyStructuredFilters, LC_QUICK_PRESETS, RPT_FILTER_FIELDS, getFilterFieldsForReport, getPresetsForReport, applyReportFilters, DEFAULT_LIFECYCLE_BANNERS } from "./pos/lib/filters";

// ═══════════════════════════════════════════════════════════════════════════
// LIFECYCLE FILTER PANEL (renders inside sidebar)
// ═══════════════════════════════════════════════════════════════════════════
import { LifecycleFilterPanel } from "./pos/components/LifecycleFilterPanel";



// ═══════════════════════════════════════════════════════════════════════════
// REPORT FILTER FIELD DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// GENERIC FILTER PANEL (renders inside sidebar — matches LifecycleFilterPanel style)
// ═══════════════════════════════════════════════════════════════════════════
import { GenericFilterPanel } from "./pos/components/GenericFilterPanel";



// ═══════════════════════════════════════════════════════════════════════════
// CLIENTS PAGE — Customer Lifecycle
// ═══════════════════════════════════════════════════════════════════════════
import { ClientsPage } from "./pos/pages/ClientsPage";

// ═══════════════════════════════════════════════════════════════════════════
// CLIENT DETAIL
// ═══════════════════════════════════════════════════════════════════════════
import { ClientDetailPage } from "./pos/pages/ClientDetailPage";

// ═══════════════════════════════════════════════════════════════════════════
// EVALUATION FORM
// ═══════════════════════════════════════════════════════════════════════════
import { EvaluationFormPage } from "./pos/pages/EvaluationFormPage";

// ═══════════════════════════════════════════════════════════════════════════
// DOG DETAIL
// ═══════════════════════════════════════════════════════════════════════════
import { DogDetailPage } from "./pos/pages/DogDetailPage";

// ═══════════════════════════════════════════════════════════════════════════
// QUESTIONNAIRE VIEWER
// ═══════════════════════════════════════════════════════════════════════════
import { QuestionnaireViewer } from "./pos/components/QuestionnaireViewer";

// ═══════════════════════════════════════════════════════════════════════════
// NEW CLIENT
// ═══════════════════════════════════════════════════════════════════════════
import { NewClientPage } from "./pos/pages/NewClientPage";

// ═══════════════════════════════════════════════════════════════════════════
// BREED SEARCH DROPDOWN
// ═══════════════════════════════════════════════════════════════════════════
import { BreedSearch } from "./pos/components/BreedSearch";

// ═══════════════════════════════════════════════════════════════════════════
// FEEDING SCHEDULE EDITOR
// ═══════════════════════════════════════════════════════════════════════════
// Blue Buffalo weight-based feeding charts (cups per day)
import { BB_CHART, BB_KEYS } from "./pos/constants/feeding";

import { FeedingScheduleEditor } from "./pos/components/FeedingScheduleEditor";

// ═══════════════════════════════════════════════════════════════════════════
// MEDICATION SCHEDULE EDITOR
// ═══════════════════════════════════════════════════════════════════════════
import { MedicationScheduleEditor } from "./pos/components/MedicationScheduleEditor";

// Helper: renders dog form fields with special handling for breed, sex, spay/neuter, bath, feeding, meds
import { DogFormFields } from "./pos/components/DogFormFields";

// ═══════════════════════════════════════════════════════════════════════════
// NEW DOG (with tag selection)
// ═══════════════════════════════════════════════════════════════════════════
import { NewDogPage } from "./pos/pages/NewDogPage";

// ═══════════════════════════════════════════════════════════════════════════
// NEW RESERVATION
// ═══════════════════════════════════════════════════════════════════════════
import { NewReservationPage } from "./pos/pages/NewReservationPage";

// ═══════════════════════════════════════════════════════════════════════════
// LODGING CALENDAR
// ═══════════════════════════════════════════════════════════════════════════
import { LodgingCalendarPage } from "./pos/pages/LodgingCalendarPage";

// ═══════════════════════════════════════════════════════════════════════════
// OPERATIONS HUB
// ═══════════════════════════════════════════════════════════════════════════
import { OperationsHub } from "./pos/pages/OperationsHub";

// ═══════════════════════════════════════════════════════════════════════════
// MANAGEMENT HUB
// ═══════════════════════════════════════════════════════════════════════════
import { ManagementHub } from "./pos/pages/ManagementHub";


// ═══════════════════════════════════════════════════════════════════════════
// AUDIT LOG VIEWER PAGE
// ═══════════════════════════════════════════════════════════════════════════
import { AuditLogPage } from "./pos/pages/AuditLogPage";

// ═══════════════════════════════════════════════════════════════════════════
// ATTENDANCE TRACKER PAGE
// ═══════════════════════════════════════════════════════════════════════════
import { ATTENDANCE_TYPES, ATTENDANCE_TYPE_COLORS } from "./pos/constants/attendance";

import { AttendanceTrackerPage } from "./pos/pages/AttendanceTrackerPage";


// ═══════════════════════════════════════════════════════════════════════════
// DAILY OPERATIONS PAGE
// ═══════════════════════════════════════════════════════════════════════════
import { DailyOpsPage } from "./pos/pages/DailyOpsPage";


// ═══════════════════════════════════════════════════════════════════════════
// AGREEMENTS PAGE (standalone management)
// ═══════════════════════════════════════════════════════════════════════════
import { AgreementsPage } from "./pos/pages/AgreementsPage";

// ═══════════════════════════════════════════════════════════════════════════
// EOD (END OF DAY) PAGE
// ═══════════════════════════════════════════════════════════════════════════
// EOD SEARCH OVERLAY
// ═══════════════════════════════════════════════════════════════════════════
import { EODSearchOverlay } from "./pos/components/EODSearchOverlay";

// ═══════════════════════════════════════════════════════════════════════════
import { EODPage } from "./pos/pages/EODPage";

// ═══════════════════════════════════════════════════════════════════════════
// DROPDOWN LISTS SETTINGS TAB
// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
// RUN CARD CONFIG TAB
// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
// VET DIRECTORY TAB
// ═══════════════════════════════════════════════════════════════════════════
import { VetDirectoryTab } from "./pos/components/VetDirectoryTab";

// ═══════════════════════════════════════════════════════════════════════════
// QUESTIONNAIRE SETTINGS TAB
// ═══════════════════════════════════════════════════════════════════════════
import { QuestionnaireSettingsTab } from "./pos/components/QuestionnaireSettingsTab";

import { RunCardConfigTab } from "./pos/components/RunCardConfigTab";
import { PricingTab } from "./pos/components/PricingTab";

import { PackagesSection } from "./pos/components/PackagesSection";

import { CreatePackageWizard } from "./pos/components/CreatePackageWizard";

import { SellPackageModal } from "./pos/components/SellPackageModal";

import { DropdownListsTab } from "./pos/components/DropdownListsTab";

// ═══════════════════════════════════════════════════════════════════════════
// EOD TEMPLATE SETTINGS TAB
// ═══════════════════════════════════════════════════════════════════════════
import { EODTemplateTab } from "./pos/components/EODTemplateTab";

// ─── Daily Ops Template Editor ───────────────────────────────────────────────
import { DailyOpsTemplateTab } from "./pos/components/DailyOpsTemplateTab";

// ═══════════════════════════════════════════════════════════════════════════
// ROLES & PERMISSIONS TAB — Matrix Grid View
// ═══════════════════════════════════════════════════════════════════════════
import { RolesPermissionsTab } from "./pos/components/RolesPermissionsTab";

// ═══════════════════════════════════════════════════════════════════════════
// TEAM MANAGEMENT TAB (used inside Settings)
// ═══════════════════════════════════════════════════════════════════════════
import { TeamTab } from "./pos/components/TeamTab";

// ═══════════════════════════════════════════════════════════════════════════
// ENTERPRISE — Location Management
// ═══════════════════════════════════════════════════════════════════════════
import { EnterpriseLocationsPage } from "./pos/pages/EnterpriseLocationsPage";

// ═══════════════════════════════════════════════════════════════════════════
// ENTERPRISE — Operations Oversight
// ═══════════════════════════════════════════════════════════════════════════
import { EnterpriseOperationsPage } from "./pos/pages/EnterpriseOperationsPage";

// ═══════════════════════════════════════════════════════════════════════════
// ENTERPRISE — Package Management
// ═══════════════════════════════════════════════════════════════════════════
import { EnterprisePackagesPage } from "./pos/pages/EnterprisePackagesPage";

// Enterprise package creation wizard (multi-step)
import { EnterpriseCreatePkgForm } from "./pos/components/EnterpriseCreatePkgForm";

// ═══════════════════════════════════════════════════════════════════════════
// ENTERPRISE — User Management
// ═══════════════════════════════════════════════════════════════════════════
import { EnterpriseUsersPage } from "./pos/pages/EnterpriseUsersPage";

// ═══════════════════════════════════════════════════════════════════════════
// ONLINE BOOKINGS INBOX
// ═══════════════════════════════════════════════════════════════════════════
import { OnlineBookingsPage } from "./pos/pages/OnlineBookingsPage";

// ═══════════════════════════════════════════════════════════════════════════
// LMS — LEARNING MANAGEMENT SYSTEM
// ═══════════════════════════════════════════════════════════════════════════
import { DEFAULT_LMS_CURRICULUM } from "./pos/constants/lms";

import { LMSPage } from "./pos/pages/LMSPage";

// ═══════════════════════════════════════════════════════════════════════════
// ENTERPRISE — Management (Attendance Aggregation)
// ═══════════════════════════════════════════════════════════════════════════
import { EnterpriseManagementPage } from "./pos/pages/EnterpriseManagementPage";

// ═══════════════════════════════════════════════════════════════════════════
// DISCOUNTS SECTION
// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
// MESSAGE TEMPLATES SETTINGS
// ═══════════════════════════════════════════════════════════════════════════
import { MessageTemplatesTab } from "./pos/components/MessageTemplatesTab";

import { DiscountsSection } from "./pos/components/DiscountsSection";

import { DiscountForm } from "./pos/components/DiscountForm";

// ═══════════════════════════════════════════════════════════════════════════
// PACKAGE REPORTS TAB
// ═══════════════════════════════════════════════════════════════════════════
import { PackageReportsTab } from "./pos/components/PackageReportsTab";

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS (Fields + Dog Tags)
// ═══════════════════════════════════════════════════════════════════════════
import { SettingsPage } from "./pos/pages/SettingsPage";

// ═══════════════════════════════════════════════════════════════════════════
// SUPERHUMAN-STYLE "NEW" OVERLAY
// ═══════════════════════════════════════════════════════════════════════════
import { NewOverlay } from "./pos/components/NewOverlay";

// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED NEW PAGE (Client + Dog + Reservation — all in one)
// ═══════════════════════════════════════════════════════════════════════════
import { UnifiedNewPage } from "./pos/pages/UnifiedNewPage";

// ═══════════════════════════════════════════════════════════════════════════
// AI COMMAND PAGE
// ═══════════════════════════════════════════════════════════════════════════

import { DogSelectButtons } from "./pos/components/DogSelectButtons";


// ─── Messages Page ────────────────────────────────────────────────────────
import { MessagesPage } from "./pos/pages/MessagesPage";

// ─── Payment Form Modal ──────────────────────────────────────────────────
import { PaymentFormModal } from "./pos/components/PaymentFormModal";

// ─── Payments Page ────────────────────────────────────────────────────────
import { PaymentsPage } from "./pos/pages/PaymentsPage";

// ═══════════════════════════════════════════════════════════════════════════
// REUSABLE REPORT COMPONENTS — DataTable, KPICard, Charts
// ═══════════════════════════════════════════════════════════════════════════


/**
 * DataTable Component
 * Displays tabular data with search, column filtering, sorting, and pagination
 */
import { DataTable, KPICard, SVGLineChart, SVGBarChart, SVGDonutChart, SVGHeatmap, SVGFunnel } from "./pos/charts/charts";


// ═══════════════════════════════════════════════════════════════════════════
// REPORTS PAGE — Revenue Intelligence Dashboard v2
// ═══════════════════════════════════════════════════════════════════════════
// © 2026 K9 Operations LLC. All Rights Reserved.
// Revenue Intelligence Dashboard v2 — Single-page, interactive, world-class

// ══════════════════════════════════════════════════════════════════════════
// INTERACTIVE LINE CHART — DEFINED AT MODULE SCOPE so React preserves
// component identity across parent re-renders (enables animation persistence)
// ══════════════════════════════════════════════════════════════════════════
import { CHART_PTS, _chartFmt$, _chartFmt$k } from "./pos/lib/chartFmt";

import { InteractiveLineChart } from "./pos/charts/InteractiveLineChart";

import { ReportsPage } from "./pos/pages/ReportsPage";

import { renderAIFormattedText } from "./pos/lib/aiText";

import { K9LoadingAnimation } from "./pos/components/K9LoadingAnimation";

import { AIAssistantPage } from "./pos/pages/AIAssistantPage";

// ═══════════════════════════════════════════════════════════════════════════
// COMMAND BAR COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
import { CommandBar } from "./pos/components/CommandBar";

// ═══════════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════════
export default function App() {
  const { profile, signOut, refreshProfile } = useAuth();
  const { data: rawData, loading, save, locationId, loadError, isEmpty } = useData(profile);
  // If no data yet in Supabase, initialize with DEMO data
  // SAFETY: Only initialize DEMO when Supabase CONFIRMS data is empty (isEmpty=true).
  // NEVER overwrite on load errors or null data from slow connections.
  // NOTE: Locations created via "Add Location" use {_initialized:true} to skip this.
  // Also fallback to DEMO when profile has no location_id (new user before claim completes)
  const rawOrDemo = rawData || (loading ? null : ((isEmpty || !profile?.location_id) ? DEMO : null));
  // Normalize: ensure all expected arrays/objects exist so new/empty locations don't crash on .filter()
  const data = rawOrDemo ? (() => {
    const merged = {
      reservations: [], clients: [], dogs: [], messages: [], teamMembers: [],
      packages: [], packageSales: [], agreements: [], dogTags: [],
      auditLog: [], closedDates: [], dailyOps: [], eodEntries: [],
      evaluations: [], onlineBookings: [], payments: [], requiredVaccines: [],
      attendanceRoster: [], attendanceEntries: [], attendanceAuditLog: [],
      roles: DEFAULT_ROLES,
      clientFields: DEF_CLIENT_FIELDS, dogFields: DEF_DOG_FIELDS,
      rooms: {},
      ...rawOrDemo,
    };
    // Ensure core tag definitions always exist (can't operate without them)
    if (!merged.dogTags || merged.dogTags.length === 0) merged.dogTags = DEF_DOG_TAGS;
    // Migrate old boolean required → requiredFor matrix
    merged.clientFields = migrateFieldsToMatrix(merged.clientFields, DEF_CLIENT_FIELDS);
    merged.dogFields = migrateFieldsToMatrix(merged.dogFields, DEF_DOG_FIELDS);
    return merged;
  })() : null;
  useEffect(() => {
    if (!loading && !rawData && locationId && isEmpty && !loadError) {
      console.log('[K9] Initializing new location with demo data');
      save(DEMO);
    }
  }, [loading, rawData, locationId, isEmpty, loadError]);
  // Auto-initialize new locations that have {_initialized:true} but no real config
  useEffect(() => {
    if (rawData && rawData._initialized && !rawData.dogTags && !rawData.rooms) {
      console.log('[K9] Seeding new location with structural defaults');
      save({ ...NEW_LOCATION_DEFAULTS, ...rawData });
    }
  }, [rawData?._initialized, rawData?.dogTags]);
  // Auto-initialize roles system for existing data that predates the permissions feature
  useEffect(() => { if (data && !data.roles) { save({ ...data, roles: DEFAULT_ROLES }); } }, [data?.roles]);

  // ═══ Auto-migration: convert legacy pricing.addOns into addOnRules ═══
  useEffect(() => {
    if (!data || data.addOnRules) return; // already migrated
    const legacyAddOns = { ...DEF_PRICING.addOns, ...((data.pricing || {}).addOns || {}) };
    const rules = Object.entries(legacyAddOns).map(([name, price]) => ({
      id: gid(), name, price: Number(price) || 0, serviceTypes: [], tagIds: [], autoApply: false,
    }));
    if (rules.length > 0) {
      console.log('[K9] Migrating legacy add-ons to addOnRules:', rules.length);
      save({ ...data, addOnRules: rules });
    }
  }, [data?.addOnRules]);

  // ═══ Auto-migration: ensure every dog has exactly ONE tag + proper eval/reservation support ═══
  // Classified dogs (LP/SP/PP) MUST have: a locked eval form + at least one prior reservation.
  // Eval dogs MUST NOT have eval forms or prior completed stays.
  const [migrationRan, setMigrationRan] = useState(false);
  useEffect(() => {
    if (!data || !data.dogs || data.dogs.length === 0 || migrationRan) return;
    const VALID = new Set(["tag_eval", "tag_lp", "tag_sp", "tag_pp"]);
    const today = new Date().toISOString().slice(0, 10);
    const addDays = (base, n) => { const d = new Date(base + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().split("T")[0]; };

    // Check: does ANY dog need fixing? (wrong tag count OR classified dog missing eval)
    const evalSet = new Set((data.evaluations || []).filter(e => e.locked).map(e => e.dogId));
    const needsFix = data.dogs.some(d => {
      const ct = (d.tags || []).filter(t => VALID.has(t));
      if (ct.length !== 1) return true; // wrong tag count
      const tag = ct[0];
      if (tag !== "tag_eval" && !evalSet.has(d.id)) return true; // classified but no eval
      return false;
    });
    if (!needsFix) return;
    setMigrationRan(true);
    console.log("[K9] Auto-migration: fixing tags + eval records for all dogs");

    let newEvals = [...(data.evaluations || [])];
    let newRes = [...(data.reservations || [])];
    let rIdx = newRes.length + 5000; // high offset to avoid ID collision

    const fixedDogs = data.dogs.map(d => {
      const ct = (d.tags || []).filter(t => VALID.has(t));
      const w = parseInt(d.fields?.weight) || 40;
      const hasPP = (d.tags || []).includes("tag_pp");

      // Determine the correct single tag
      let tag;
      if (ct.length === 1) {
        tag = ct[0]; // already has exactly one — keep it
      } else {
        // Assign based on weight; preserve PP if it was set
        if (hasPP) tag = "tag_pp";
        else if (w < 35) tag = "tag_sp";
        else tag = "tag_lp";
      }

      // For classified dogs (LP/SP/PP): ensure eval record + prior reservation exist
      if (tag !== "tag_eval") {
        const hasLockedEval = newEvals.some(e => e.dogId === d.id && e.locked);
        if (!hasLockedEval) {
          const evalDate = addDays(today, -(30 + Math.floor(Math.random() * 150)));
          const isPP = tag === "tag_pp";
          const evalResId = "r_mig_" + (rIdx++);
          // Create the evaluation reservation
          newRes.push({
            id: evalResId, clientId: d.clientId, dogId: d.id, type: "evaluation",
            evalResult: isPP ? "passed_private" : "passed_group",
            checkIn: evalDate, checkOut: evalDate,
            checkInTime: "10:00", checkOutTime: "11:00",
            status: "checked-out", notes: ""
          });
          // Create the locked evaluation form
          newEvals.push({
            id: "eval_mig_" + d.id, dogId: d.id, clientId: d.clientId,
            reservationId: evalResId, date: evalDate,
            evaluatorName: "Staff", evalType: "initial",
            hasExperience: !isPP, answers: {}, subtotals: {},
            totalScore: isPP ? 15 : 26, maxScore: 30,
            result: isPP ? "yellow" : "green",
            notes: isPP ? "Reactive with other dogs; private play recommended" : "Great in group play; social and friendly",
            locked: true, createdAt: new Date(evalDate + "T12:00:00").toISOString(),
          });
        }
        // Ensure at least one prior completed reservation exists
        const hasPrior = newRes.some(r => r.dogId === d.id && r.status === "checked-out" && r.type !== "evaluation");
        if (!hasPrior) {
          const stayDate = addDays(today, -(14 + Math.floor(Math.random() * 60)));
          const sm = w < 35;
          newRes.push({
            id: "r_mig_" + (rIdx++), clientId: d.clientId, dogId: d.id, type: "daycare",
            daycareSize: sm ? "small" : "large", checkIn: stayDate, checkOut: stayDate,
            checkInTime: "07:00", checkOutTime: "17:00",
            status: "checked-out", notes: ""
          });
        }
      }

      return { ...d, tags: [tag] };
    });

    save({ ...data, dogs: fixedDogs, evaluations: newEvals, reservations: newRes });
  }, [data?.dogs?.length, migrationRan]);

  // ═══ Auto-migration: add lifecycle tracking to clients ═══
  const [lifecycleMigRan, setLifecycleMigRan] = useState(false);
  useEffect(() => {
    if (!data || !data.clients || data.clients.length === 0 || lifecycleMigRan) return;
    const needsMigration = data.clients.some(c => !c.lifecycle);
    if (!needsMigration) return;
    setLifecycleMigRan(true);
    console.log("[K9] Auto-migration: adding lifecycle structure to clients");
    const addDays = (base, n) => { const d = new Date((base || todayStr()) + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().split("T")[0]; };
    const migratedClients = data.clients.map(c => {
      if (c.lifecycle && c.lifecycle.cold !== undefined && c.lifecycle.conversion?.source !== undefined) return c;
      const defaultFollowUp = addDays(c.createdAt, 1);
      const conv = c.lifecycle?.conversion || {};
      const ret = c.lifecycle?.retention || {};
      return {
        ...c,
        lifecycle: {
          conversion: { notes: conv.notes || "", followUpDate: conv.followUpDate || defaultFollowUp, updates: conv.updates || [], source: conv.source || "", sourceDate: conv.sourceDate || "", sourceReservationId: conv.sourceReservationId || "" },
          retention: { notes: ret.notes || "", followUpDate: ret.followUpDate || "", updates: ret.updates || [] },
          cold: c.lifecycle?.cold ?? false,
          coldDate: c.lifecycle?.coldDate ?? "",
          coldFrom: c.lifecycle?.coldFrom ?? "",
        },
        lifecycleEvents: c.lifecycleEvents || [{ event: "created", date: (c.createdAt || todayStr()).slice(0, 10), details: "Client record created" }],
      };
    });
    save({ ...data, clients: migratedClients });
  }, [data?.clients?.length, lifecycleMigRan]);

  // ═══ Auto-migration: rename old Blue Buffalo food types ═══
  const [bbMigRan, setBbMigRan] = useState(false);
  useEffect(() => {
    if (!data || bbMigRan) return;
    const OLD_TO_NEW = { "Blue Buffalo Chicken": "Blue Buffalo GI Vet-Grade (Chicken)", "Blue Buffalo Salmon": "Blue Buffalo HF Vet-Grade (Salmon)" };
    const renameFT = (v) => OLD_TO_NEW[v] || v;
    // Check if migration needed
    const hasOldOpts = (data.foodTypeOptions || []).some(f => OLD_TO_NEW[f]);
    const hasOldDogFeeds = (data.dogs || []).some(d => (d.fields?.feedingSchedules || []).some(s => OLD_TO_NEW[s.foodType]));
    const hasOldResFeeds = (data.reservations || []).some(r => (r.careOverrides?.feedingSchedules || []).some(s => OLD_TO_NEW[s.foodType]));
    const hasOldPricing = data.pricing?.addOns && (OLD_TO_NEW["Blue Buffalo Chicken"] in (data.pricing?.addOns || {}) || OLD_TO_NEW["Blue Buffalo Salmon"] in (data.pricing?.addOns || {}));
    if (!hasOldOpts && !hasOldDogFeeds && !hasOldResFeeds) return;
    setBbMigRan(true);
    console.log("[K9] Auto-migration: renaming Blue Buffalo food types");
    const migrated = { ...data };
    if (hasOldOpts) migrated.foodTypeOptions = (data.foodTypeOptions || []).map(renameFT);
    if (hasOldDogFeeds) migrated.dogs = data.dogs.map(d => ({
      ...d, fields: { ...d.fields, feedingSchedules: (d.fields?.feedingSchedules || []).map(s => s.foodType && OLD_TO_NEW[s.foodType] ? { ...s, foodType: renameFT(s.foodType) } : s) }
    }));
    if (hasOldResFeeds) migrated.reservations = (data.reservations || []).map(r => r.careOverrides?.feedingSchedules?.some(s => OLD_TO_NEW[s.foodType]) ? {
      ...r, careOverrides: { ...r.careOverrides, feedingSchedules: r.careOverrides.feedingSchedules.map(s => s.foodType && OLD_TO_NEW[s.foodType] ? { ...s, foodType: renameFT(s.foodType) } : s) }
    } : r);
    save(migrated);
  }, [data?.foodTypeOptions, data?.dogs?.length, bbMigRan]);

  // ═══ Dynamic Locations (loaded from Supabase) ═══
  const [dbLocations, setDbLocations] = useState([]);
  const [locationsLoading, setLocationsLoading] = useState(true);

  const loadLocations = useCallback(async () => {
    try {
      const { data: locs, error } = await supabase.rpc('list_locations');
      if (!error && locs) {
        setDbLocations(Array.isArray(locs) ? locs : []);
      }
    } catch (e) {
      console.log('[K9] list_locations RPC not available:', e.message);
    }
    setLocationsLoading(false);
  }, []);

  useEffect(() => { if (profile) loadLocations(); }, [profile]);

  const allLocations = useMemo(() => [
    { id: "enterprise", name: "Enterprise", slug: "enterprise", isEnterprise: true },
    ...dbLocations.map(l => ({ id: l.id, name: l.name, slug: l.slug || l.id, region: l.region || "" })),
    { id: "lite", name: "K9 Operations Lite", slug: "lite", isLite: true },
  ], [dbLocations]);

  // ═══ URL-based routing state ═══
  const [currentLocation, setCurrentLocation] = useState(() => {
    try {
      const v = localStorage.getItem("k9_location");
      if (v) return v;
    } catch {}
    // Default new users to demo view (first non-enterprise location)
    return dbLocations.length > 0 ? dbLocations[0].id : "demo";
  });
  const initRoute = useMemo(() => parseUrl(window.location.pathname, null), []);
  const [page, setPage] = useState(() => initRoute.locSlug === "enterprise" ? initRoute.page : initRoute.page);
  const [params, setParams] = useState(() => initRoute.params);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [accountSwitchOpen, setAccountSwitchOpen] = useState(false);
  const [switchTarget, setSwitchTarget] = useState(null);
  const [switchPassword, setSwitchPassword] = useState("");
  const [switchError, setSwitchError] = useState("");
  const [switchLoading, setSwitchLoading] = useState(false);
  const [teamAccounts, setTeamAccounts] = useState([]);
  const [signInTime, setSignInTime] = useState(() => Date.now());
  const [lcFilterOpen, setLcFilterOpen] = useState(false);
  const [lcFilters, setLcFilters] = useState({});
  useEffect(() => { if (page !== "clients" && lcFilterOpen) setLcFilterOpen(false); }, [page, lcFilterOpen]);
  const [rptFilterOpen, setRptFilterOpen] = useState(false);
  const [rptFilters, setRptFilters] = useState({});
  useEffect(() => { if (page !== "reports") { setRptFilterOpen(false); setRptFilters({}); } }, [page]);
  // (navTooltip removed — auto-expand sidebar replaces it)
  const [rptActiveReport, setRptActiveReport] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Fetch team accounts for quick-switch
  useEffect(() => {
    if (!profile?.location_id) return;
    supabase.from("profiles").select("id,full_name,email,role").eq("location_id", profile.location_id)
      .then(({ data: members }) => { if (members) setTeamAccounts(members.filter(m => m.id !== profile.id)); });
  }, [profile?.location_id, profile?.id]);

  // Auto-sign-out timer
  useEffect(() => {
    const sessionCfg = data?.sessionTimeout || {};
    if (!sessionCfg.enabled || !sessionCfg.hours) return;
    const ms = sessionCfg.hours * 60 * 60 * 1000;
    const timer = setInterval(() => {
      if (Date.now() - signInTime >= ms) {
        alert("Session expired — you've been signed in for " + sessionCfg.hours + " hour" + (sessionCfg.hours > 1 ? "s" : "") + ". Signing out for security.");
        signOut();
      }
    }, 30000); // check every 30s
    return () => clearInterval(timer);
  }, [data?.sessionTimeout?.enabled, data?.sessionTimeout?.hours, signInTime, signOut]);

  // FR.3: Employee login/usage audit logging — log sign-ins to audit_log
  const loginLoggedRef = useRef(false);
  useEffect(() => {
    if (!profile || !data || loginLoggedRef.current) return;
    loginLoggedRef.current = true;
    const entry = {
      id: gid(),
      location_id: profile.location_id,
      reservation_id: null,
      timestamp: new Date().toISOString(),
      user_name: profile.full_name || profile.email || "Unknown",
      changed_by: profile.full_name || profile.email || "Unknown",
      action: "Employee Sign-In",
      details: JSON.stringify([
        { field: "User", oldVal: "—", newVal: profile.full_name || profile.email },
        { field: "Role", oldVal: "—", newVal: profile.role || "staff" },
        { field: "Method", oldVal: "—", newVal: "Password" },
      ]),
    };
    supabase.from("audit_log").insert(entry).then(() => {});
  }, [profile, data]);

  // Handle account switch
  const handleAccountSwitch = async () => {
    if (!switchTarget || !switchPassword) return;
    setSwitchLoading(true);
    setSwitchError("");
    const { error } = await supabase.auth.signInWithPassword({ email: switchTarget.email, password: switchPassword });
    setSwitchLoading(false);
    if (error) { setSwitchError("Invalid password. Please try again."); return; }
    // FR.3: Log account switch
    supabase.from("audit_log").insert({
      id: gid(), location_id: profile?.location_id, reservation_id: null,
      timestamp: new Date().toISOString(),
      user_name: switchTarget.full_name || switchTarget.email,
      changed_by: profile?.full_name || profile?.email || "Unknown",
      action: "Account Switch",
      details: JSON.stringify([
        { field: "From", oldVal: profile?.full_name || profile?.email, newVal: switchTarget.full_name || switchTarget.email },
        { field: "Role", oldVal: profile?.role, newVal: switchTarget.role || "staff" },
      ]),
    }).then(() => {});
    loginLoggedRef.current = false; // reset so new session gets logged
    setSwitchTarget(null); setSwitchPassword(""); setAccountSwitchOpen(false); setSignInTime(Date.now());
  };

  const [navStack, setNavStack] = useState([{ page: initRoute.page, params: initRoute.params }]);
  const skipUrlPush = useRef(false);
  const isEnterprise = currentLocation === "enterprise";
  const locSlug = useMemo(() => {
    const loc = allLocations.find(l => l.id === currentLocation);
    return loc ? loc.slug : (allLocations[1]?.slug || "demo");
  }, [currentLocation, allLocations]);
  const currentLoc = useMemo(() => allLocations.find(l => !l.isEnterprise && l.id === currentLocation) || null, [allLocations, currentLocation]);

  // Set initial location from URL on mount
  useEffect(() => {
    const parsed = parseUrl(window.location.pathname, data);
    const locMatch = allLocations.find(l => l.slug === parsed.locSlug);
    if (locMatch && locMatch.id !== currentLocation) {
      setCurrentLocation(locMatch.id);
      try { localStorage.setItem("k9_location", locMatch.id); } catch {}
    }
    // Re-parse with data to resolve client/dog params
    if (data && parsed.page === "clients" && window.location.pathname.includes("/client/")) {
      const reParsed = parseUrl(window.location.pathname, data);
      if (reParsed.page !== "clients") { setPage(reParsed.page); setParams(reParsed.params); setNavStack([{ page: reParsed.page, params: reParsed.params }]); }
    }
  }, [data, allLocations]);

  // Sync URL when page/params/location change
  useEffect(() => {
    if (skipUrlPush.current) { skipUrlPush.current = false; return; }
    const url = buildUrl(locSlug, page, params, data);
    if (window.location.pathname !== url) window.history.pushState({ page, params, loc: currentLocation }, "", url);
  }, [page, params, locSlug]);

  // Handle browser back/forward
  useEffect(() => {
    const handler = (e) => {
      skipUrlPush.current = true;
      const parsed = parseUrl(window.location.pathname, data);
      const locMatch = allLocations.find(l => l.slug === parsed.locSlug);
      if (locMatch) { setCurrentLocation(locMatch.id); try { localStorage.setItem("k9_location", locMatch.id); } catch {} }
      setPage(parsed.page); setParams(parsed.params);
      setNavStack([{ page: parsed.page, params: parsed.params }]);
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, [data, allLocations]);

  // Replace initial URL if at root
  useEffect(() => {
    if (window.location.pathname === POS_BASE || window.location.pathname === POS_BASE + "/") {
      window.history.replaceState({}, "", buildUrl(locSlug, page, params, data));
    }
  }, []);

  const handleLocationChange = useCallback(async (locId) => {
    setCurrentLocation(locId);
    try { localStorage.setItem("k9_location", locId); } catch {}
    const loc = allLocations.find(l => l.id === locId);
    const slug = loc ? loc.slug : locId;
    const selectedLoc = allLocations.find(l => l.id === locId);
    if (selectedLoc?.isLite) {
      window.location.href = "/";
      return;
    }
    if (locId === "enterprise") {
      setPage("enterprise-locations"); setParams({}); setNavStack([{ page: "enterprise-locations", params: {} }]);
      window.history.pushState({}, "", `${POS_BASE}/enterprise/locations`);
    } else {
      setPage("dashboard"); setParams({}); setNavStack([{ page: "dashboard", params: {} }]);
      window.history.pushState({}, "", `${POS_BASE}/${slug}/dashboard`);
      // Switch active location in Supabase so useData loads the right data
      try {
        const { data: result } = await supabase.rpc('switch_location', { p_location_id: locId });
        if (result?.success) await refreshProfile();
      } catch (e) {
        console.log('[K9] switch_location RPC not available:', e.message);
      }
    }
  }, [allLocations, refreshProfile]);

  const TOP_LEVEL_PAGES = useMemo(() => new Set(["dashboard","clients","reservations","messages","payments","reports","operations","eod","ops-opening","ops-forms","ops-closing","ai","settings","enterprise-locations","enterprise-operations"]), []);
  const nav = useCallback((pg, prms = {}) => {
    setPage(pg); setParams(prms); setMobileMenuOpen(false);
    if (TOP_LEVEL_PAGES.has(pg)) {
      setNavStack([{ page: pg, params: prms }]);
    } else {
      setNavStack(prev => {
        const idx = prev.findIndex(e => e.page === pg);
        if (idx >= 0) { const s = prev.slice(0, idx + 1); s[idx] = { page: pg, params: prms }; return s; }
        return [...prev, { page: pg, params: prms }];
      });
    }
  }, [TOP_LEVEL_PAGES]);

  // ═══ Time Travel (Developer Tool) ═══
  const isDevUser = hasPermission(profile, data, 'use_time_travel');
  const [timeTravelDate, setTimeTravelDate] = useState(() => {
    try { return sessionStorage.getItem("k9_timetravel") || ""; } catch { return ""; }
  });
  const [timeTravelOpen, setTimeTravelOpen] = useState(false);
  const updateTimeTravel = useCallback((dateStr) => {
    setTimeTravelDate(dateStr);
    window.__K9_TIME_TRAVEL__ = dateStr || null;
    try {
      if (dateStr) sessionStorage.setItem("k9_timetravel", dateStr);
      else sessionStorage.removeItem("k9_timetravel");
    } catch {}
  }, []);
  useEffect(() => {
    if (isDevUser && timeTravelDate) window.__K9_TIME_TRAVEL__ = timeTravelDate;
    return () => { window.__K9_TIME_TRAVEL__ = null; };
  }, []);

  // ═══ New Overlay ═══
  const [showNewOverlay, setShowNewOverlay] = useState(false);
  const [commandBarOpen, setCommandBarOpen] = useState(false);
  const openNew = useCallback(() => setShowNewOverlay(true), []);

  // ═══ Global Toast ═══
  const [globalToasts, setGlobalToasts] = useState([]);
  const globalToastId = useRef(0);
  const addGlobalToast = useCallback((t) => {
    const id = ++globalToastId.current;
    const toast = { id, ...t };
    setGlobalToasts(prev => [...prev, toast]);
    setTimeout(() => setGlobalToasts(prev => prev.filter(x => x.id !== id)), 8000);
  }, []);
  const dismissGlobalToast = useCallback((id) => setGlobalToasts(prev => prev.filter(x => x.id !== id)), []);

  // ═══ Keyboard Shortcuts ═══
  // ═══ Global Cmd+K → Command Bar ═══
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandBarOpen(prev => !prev);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const hkEnabled = ((data || {}).hotkeySettings || {}).enabled === true;
  const hkHints = ((data || {}).hotkeySettings || {}).showHints === true;
  const hkBindingsGlobal = { ...DEF_HOTKEY_BINDINGS, ...((data || {}).hotkeySettings || {}).bindings };
  useEffect(() => {
    const b = hkBindingsGlobal;
    const handler = (e) => {
      // Skip if typing in an input, textarea, select, or contenteditable
      const tag = (e.target.tagName || "").toLowerCase();
      const editable = e.target.isContentEditable;
      if (tag === "input" || tag === "textarea" || tag === "select" || editable) {
        if (e.key === "Escape") { e.target.blur(); return; }
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!hkEnabled) return;

      // Number keys 1-9 → navigate to sidebar tabs
      const num = parseInt(e.key);
      if (num >= 1 && num <= 9) {
        const flatNav = ["dashboard","reservations","clients","messages","payments","ops-opening","eod","ai","settings"];
        if (num <= flatNav.length) { e.preventDefault(); nav(flatNav[num - 1]); return; }
      }

      const k = e.key.toLowerCase();
      if (k === b.dashboard) { e.preventDefault(); nav("dashboard"); }
      else if (k === b.lodging) { e.preventDefault(); nav("reservations"); }
      else if (k === b.clients) { e.preventDefault(); nav("clients"); }

      else if (k === b.newReservation) { e.preventDefault(); setShowNewOverlay(true); }
      else if (k === b.settings) { e.preventDefault(); nav("settings"); }
      else if (k === b.ai) { e.preventDefault(); nav("ai"); }
      else if (k === b.quickDaycare) { e.preventDefault(); const qdc = document.querySelector("[data-shortcut-quickdc]"); if (qdc) qdc.click(); else { nav("dashboard"); setTimeout(() => { const el = document.querySelector("[data-shortcut-quickdc]"); if (el) el.click(); }, 100); } }
      else if (k === b.search) {
          e.preventDefault();
          setTimeout(() => {
            const el = document.querySelector("[data-shortcut-search]") ||
              document.querySelector("input[placeholder*='Search']") ||
              document.querySelector("input[placeholder*='search']");
            if (el) { el.focus(); el.select(); }
          }, 50);
        }
      else if (k === "escape") { /* noop */ }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [nav, hkEnabled, JSON.stringify(hkBindingsGlobal)]);

  // ═══ Breadcrumb ═══
  const breadcrumbLabel = useCallback((pg, prms) => {
    switch(pg) {
      case "dashboard": return "Dashboard";
      case "clients": return "Clients";
      case "reservations": return "Reservations";

      case "messages": return "Messages";
      case "payments": return "Payments";
      case "operations": return "Operations";
      case "eod": return "End of Day";
      case "ai": return "AI Command";
      case "lms": return "Learning";
      case "reports": return "Reports";
      case "online-bookings": return "Online Bookings";
      case "settings": return "Settings";
      case "ops-opening": return "Opening";
      case "ops-fe": return "FE Checklist";
      case "ops-be": return "BE Checklist";
      case "ops-rooms": return "Room Cleaning & Setups";
      case "ops-pictures": return "Pictures";
      case "ops-pp": return "PP Checklist";
      case "ops-closing": return "Closing";
      case "ops-forms": return "Forms";
      case "client-detail": {
        const c = (data?.clients||[]).find(cl => cl.id === prms?.clientId);
        return c ? `${c.fields?.first_name||""} ${c.fields?.last_name||""}`.trim() || "Client" : "Client";
      }
      case "dog-detail": {
        const d = (data?.dogs||[]).find(dg => dg.id === prms?.dogId);
        return d?.fields?.name || "Dog";
      }
      case "new-client": return "New Client";
      case "new-dog": return "New Dog";
      case "new-reservation": return "New Reservation";
      case "unified-new": return "New Client & Reservation";
      case "evaluation-form": {
        const evRes = (data?.reservations||[]).find(r => r.id === prms?.reservationId);
        const evDog = evRes ? (data?.dogs||[]).find(d => d.id === evRes.dogId) : null;
        return evDog ? `Evaluate ${evDog.fields.name}` : "Evaluation Form";
      }
      case "management": return "Management";
      case "mgmt-attendance": return "Attendance Tracker";
      case "mgmt-audit-log": return "Audit Log";
      case "enterprise-locations": return "Location Management";
      case "enterprise-operations": return "Operations Oversight";
      case "enterprise-packages": return "Package Management";
      case "enterprise-management": return "Management";
      default: return pg;
    }
  }, [data]);

  if (loading) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:C.bg,fontFamily:"'Outfit', sans-serif"}}><div style={{textAlign:"center"}}><K9Logo size={48}/><div style={{fontSize:14,fontWeight:600,color:C.pri,marginTop:12,letterSpacing:"0.05em",textTransform:"uppercase"}}>Loading...</div></div></div>;

  const opsChildren = [
    {id:"ops-opening",label:"Opening",sub:"opening"},
    {id:"ops-fe",label:"FE Checklist",sub:"fe"},
    {id:"ops-be",label:"BE Checklist",sub:"be"},
    {id:"ops-rooms",label:"Room Cleaning & Setups",sub:"room_cleaning"},
    {id:"ops-pictures",label:"Pictures",sub:"pictures"},
    {id:"ops-pp",label:"PP Checklist",sub:"pp"},
    {id:"ops-closing",label:"Closing",sub:"closing"},
  ];
  const locationNavSections = [
    { label:null, items:[
      { id:"dashboard",label:"Dashboard",icon:<I.Dashboard/>,hotkey:"1" },
      { id:"reservations",label:"Lodging Calendar",icon:<I.Calendar/>,hotkey:"2" },
      { id:"online-bookings",label:"Online Bookings",icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> },
      { id:"clients",label:"Customer Lifecycle",icon:<I.Users/>,hotkey:"3" },
      { id:"messages",label:"Messages",icon:<I.MessageSquare/>,hotkey:"4" },
    ]},
    { label:null, items:[
      { id:"operations",label:"Operations",icon:<I.Clipboard/>,hotkey:"6" },
      { id:"lms",label:"Learning",icon:<I.GraduationCap/> },
    ]},
    { label:null, items:[
      { id:"ai",label:"AI Command",icon:<I.Sparkle/>,hotkey:"7" },
    ]},
    { label:null, items:[
      { id:"settings",label:"Settings",icon:<I.Settings/>,hotkey:"8" },
      { id:"reports",label:"Reports",icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="3" y1="20" x2="21" y2="20"/></svg> },
    ]},
  ];
  const enterpriseNavSections = [
    { label:null, items:[
      { id:"enterprise-locations",label:"Location Management",icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> },
      { id:"enterprise-operations",label:"Operations Oversight",icon:<I.Clipboard/> },
      { id:"enterprise-packages",label:"Package Management",icon:<I.ShoppingCart/> },
      { id:"enterprise-users",label:"User Management",icon:<I.Users/> },
      { id:"enterprise-management",label:"Management",icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M9 14l2 2 4-4"/></svg> },
    ]},
  ];
  const navSections = isEnterprise ? enterpriseNavSections : locationNavSections;
  // Flat list for lookups
  const navItems = navSections.flatMap(s => s.items);
  const isOpsPage = page.startsWith("ops-");
  const isMgmtPage = page.startsWith("mgmt-") || page === "management";
  const isSettingsSubPage = page.startsWith("settings-");
  const activeNav = isEnterprise ? page : isOpsPage||page==="eod"||page==="operations"||isMgmtPage?"operations":isSettingsSubPage||page==="settings"?"settings":["dashboard","clients","reservations","online-bookings","messages","reports","ai","lms"].includes(page)?page:["client-detail","new-client","dog-detail","new-dog","questionnaire"].includes(page)?"clients":["new-reservation","unified-new"].includes(page)?"reservations":page==="evaluation-form"?"dashboard":"dashboard";

  function renderPage() {
    // Enterprise pages — gated to owner/enterprise_admin
    const isEnterpriseRole = profile?.role === 'owner' || profile?.role === 'enterprise_admin';
    const entDenied = <div style={{padding:"60px 40px",textAlign:"center"}}><div style={{fontSize:36,marginBottom:12}}>🔒</div><div style={{fontSize:18,fontWeight:700,color:C.text,marginBottom:6}}>Access Restricted</div><div style={{fontSize:14,color:C.textSec}}>Enterprise features are only available to owners and enterprise admins.</div></div>;
    if (page === "enterprise-locations") return isEnterpriseRole ? <EnterpriseLocationsPage data={data} save={save} nav={nav} profile={profile} handleLocationChange={handleLocationChange} addGlobalToast={addGlobalToast} allLocations={allLocations} refreshLocations={loadLocations}/> : entDenied;
    if (page === "enterprise-operations") return isEnterpriseRole ? <EnterpriseOperationsPage data={data} save={save} nav={nav} profile={profile} handleLocationChange={handleLocationChange} allLocations={allLocations}/> : entDenied;
    if (page === "enterprise-packages") return isEnterpriseRole ? <EnterprisePackagesPage data={data} save={save} allLocations={allLocations}/> : entDenied;
    if (page === "enterprise-users") return isEnterpriseRole ? <EnterpriseUsersPage profile={profile} allLocations={allLocations}/> : entDenied;
    if (page === "enterprise-management") return isEnterpriseRole ? <EnterpriseManagementPage data={data} save={save} nav={nav} profile={profile} allLocations={allLocations}/> : entDenied;
    if (isOpsPage) {
      const oc = opsChildren.find(c => c.id === page);
      return <DailyOpsPage data={data} save={save} sub={oc ? oc.sub : "opening"} nav={nav} profile={profile}/>;
    }
    // Permission-gated routing
    const hp = (k) => hasPermission(profile, data, k);
    const denied = <div style={{padding:"60px 40px",textAlign:"center"}}><div style={{fontSize:36,marginBottom:12}}>🔒</div><div style={{fontSize:18,fontWeight:700,color:C.text,marginBottom:6}}>Access Restricted</div><div style={{fontSize:14,color:C.textSec}}>You don't have permission to view this page. Contact your admin to update your role.</div></div>;
    if (page === "management") return (hp("view_management") || hp("view_daily_ops")) ? <ManagementHub data={data} save={save} nav={nav} profile={profile}/> : denied;
    if (page === "mgmt-attendance") return (hp("view_management") || hp("view_daily_ops")) ? <AttendanceTrackerPage data={data} save={save} nav={nav} profile={profile}/> : denied;
    if (page === "mgmt-audit-log") return hp("view_audit_log") ? <AuditLogPage data={data} nav={nav} profile={profile}/> : denied;
    switch(page) {
      case "operations": return <OperationsHub data={data} save={save} nav={nav} profile={profile}/>;
      case "dashboard": return <DashboardPage data={data} save={save} nav={nav} onNew={openNew} profile={profile}/>;
      case "clients": return hp("view_clients") ? <ClientsPage data={data} save={save} nav={nav} profile={profile} addGlobalToast={addGlobalToast} lcFilters={lcFilters} setLcFilters={setLcFilters} setLcFilterOpen={setLcFilterOpen} locationSlug={currentLoc?.slug}/> : denied;
      case "client-detail": return hp("view_client_detail") ? <ClientDetailPage data={data} save={save} clientId={params.clientId} nav={nav} profile={profile} openReservationId={params.openReservation}/> : denied;
      case "new-client": return hp("create_client") ? <NewClientPage data={data} save={save} nav={nav} prefill={params.prefill} addGlobalToast={addGlobalToast}/> : denied;
      case "dog-detail": return hp("view_dog_detail") ? <DogDetailPage data={data} save={save} clientId={params.clientId} dogId={params.dogId} nav={nav} profile={profile}/> : denied;
      case "questionnaire": return hp("view_dog_detail") ? <QuestionnaireViewer data={data} save={save} clientId={params.clientId} dogId={params.dogId} nav={nav}/> : denied;
      case "new-dog": return hp("create_dog") ? <NewDogPage data={data} save={save} clientId={params.clientId} nav={nav}/> : denied;
      case "reservations": return hp("view_calendar") ? <LodgingCalendarPage data={data} save={save} nav={nav} onNew={openNew} profile={profile}/> : denied;
      case "online-bookings": return <OnlineBookingsPage data={data} save={save} nav={nav} profile={profile} addGlobalToast={addGlobalToast} allLocations={allLocations}/>;
      case "new-reservation": return hp("create_reservation") ? <NewReservationPage data={data} save={save} preClientId={params.clientId} nav={nav} profile={profile} addGlobalToast={addGlobalToast}/> : denied;
      case "unified-new": return <UnifiedNewPage data={data} save={save} nav={nav} prefill={params.prefill} profile={profile} addGlobalToast={addGlobalToast}/>;
      case "evaluation-form": return <EvaluationFormPage data={data} save={save} reservationId={params.reservationId} nav={nav} profile={profile}/>;
      case "eod": return hp("view_eod") ? <EODPage data={data} save={save} nav={nav} profile={profile}/> : denied;

      case "messages": return hp("view_messages") ? <MessagesPage data={data} save={save} nav={nav} profile={profile}/> : denied;
      case "payments": return hp("view_payments") ? <PaymentsPage data={data} save={save} nav={nav} profile={profile}/> : denied;
      case "reports": return hp("view_payments") ? <ReportsPage data={data} save={save} nav={nav} profile={profile} rptFilterOpen={rptFilterOpen} setRptFilterOpen={setRptFilterOpen} rptFilters={rptFilters} setRptFilters={setRptFilters} onActiveReportChange={setRptActiveReport}/> : denied;
      case "ai": return hp("use_ai") ? <AIAssistantPage data={data} save={save} nav={nav} profile={profile}/> : denied;
      case "lms": return <LMSPage data={data} save={save} nav={nav} profile={profile}/>;
      case "settings": return hp("view_settings") ? <SettingsPage data={data} save={save} profile={profile} nav={nav} locationSlug={locSlug} addGlobalToast={addGlobalToast}/> : denied;
      default:
        if (isSettingsSubPage) {
          const subTab = page.replace("settings-", "");
          return hp("view_settings") ? <SettingsPage data={data} save={save} profile={profile} nav={nav} settingsTab={subTab} locationSlug={locSlug} addGlobalToast={addGlobalToast}/> : denied;
        }
        return <DashboardPage data={data} save={save} nav={nav} onNew={openNew} profile={profile}/>;
    }
  }

  return (
    <ErrorBoundary>
    <div style={{display:"flex",height: isDevUser && timeTravelDate ? "calc(100vh - 32px)" : "100vh",marginTop: isDevUser && timeTravelDate ? 32 : 0,fontFamily:"'Outfit', -apple-system, sans-serif",background:C.bg,overflow:"hidden"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:6px;} ::-webkit-scrollbar-thumb{background:#C4C8D0;border-radius:3px;} ::-webkit-scrollbar-track{background:transparent;}
        input:focus,select:focus,textarea:focus{border-color:${C.pri}!important;box-shadow:0 0 0 3px rgba(20,83,45,0.08);}
        input.no-focus-ring:focus{border-color:transparent!important;box-shadow:none!important;outline:none!important;}
        @media(max-width:900px){.sidebar-d{display:none!important;}.mob-h{display:flex!important;}.main-content{padding:20px 16px!important;padding-top:72px!important;}}
        @media(min-width:901px){.mob-h{display:none!important;}.mob-ov{display:none!important;}}
        h1,h2,h3,h4,h5,h6,.brand-headline{font-family:'Outfit', sans-serif !important;font-weight:700;}
        @keyframes k9toast{from{opacity:0;transform:translateX(40px);}to{opacity:1;transform:translateX(0);}}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes k9overlay{from{opacity:0;transform:translateY(-16px) scale(0.97);}to{opacity:1;transform:translateY(0) scale(1);}}
        .nav-tip{position:relative;} .nav-tip::after{content:attr(data-tip);position:absolute;left:calc(100% + 12px);top:50%;transform:translateY(-50%);background:#1a2940;color:#fff;padding:5px 10px;border-radius:6px;font-size:12px;font-weight:600;white-space:nowrap;pointer-events:none;opacity:0;transition:opacity 0.15s;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.2);} .nav-tip:hover::after{opacity:1;}
      `}</style>

      {/* Sidebar Desktop — always collapsed, expands on hover */}
      {(() => {
        const filterMode = (lcFilterOpen && page === "clients") || (rptFilterOpen && page === "reports");
        const sbExpanded = filterMode || sidebarOpen;
        return (
      <div className="sidebar-d"
        onMouseEnter={()=>{if(!filterMode)setSidebarOpen(true);}}
        onMouseLeave={()=>{if(!filterMode)setSidebarOpen(false);}}
        style={{width:filterMode?240:(sbExpanded?240:68),background:filterMode?C.surface:`linear-gradient(180deg, ${C.pri} 0%, #0D3B1E 100%)`,display:"flex",flexDirection:"column",transition:"width 0.15s cubic-bezier(0.4,0,0.2,1), background 0.15s ease",overflow:"hidden",flexShrink:0,borderRight:filterMode?`1px solid ${C.border}`:"none",zIndex:50}}>
        {filterMode ? (
          page === "clients" ? <LifecycleFilterPanel filters={lcFilters} onChange={setLcFilters} onClose={() => setLcFilterOpen(false)} /> : <GenericFilterPanel fields={getFilterFieldsForReport(rptActiveReport)} filters={rptFilters} onChange={setRptFilters} onClose={() => setRptFilterOpen(false)} presets={getPresetsForReport(rptActiveReport)} />
        ) : (<>
        <div style={{padding:"22px 15px 18px",display:"flex",alignItems:"center",justifyContent:"flex-start",gap:12,height:40,boxSizing:"content-box"}}>
          <div style={{flexShrink:0,width:34,display:"flex",alignItems:"center",justifyContent:"center"}}>{sbExpanded ? <K9Logo size={38}/> : <K9LogoMini size={34}/>}</div>
          <div style={{overflow:"hidden",opacity:sbExpanded?1:0,transition:"opacity 0.1s",whiteSpace:"nowrap"}}><div style={{fontSize:16,fontWeight:700,color:C.acc,fontFamily:"'Outfit', sans-serif",letterSpacing:"0.02em"}}>K9 Operations</div><div style={{fontSize:10,color:"rgba(132,204,22,0.6)",fontWeight:500,letterSpacing:"0.08em",textTransform:"uppercase"}}>Lite · KOL</div></div>
        </div>
        <div style={{margin:"0 16px 10px",height:1,background:"rgba(132,204,22,0.15)"}}/>
        <div style={{height:44,flexShrink:0,padding:"0 10px",marginBottom:10,display:"flex",alignItems:"center"}}>
          <LocationSelector currentLocation={currentLocation} onLocationChange={handleLocationChange} collapsed={!sbExpanded} allLocations={allLocations} profile={profile} />
        </div>
        <nav style={{flex:1,padding:"0 10px",overflowY:"auto"}}>
          {navSections.map((sec, si) => (
            <div key={si}>
              {sec.label && sbExpanded && <div style={{padding:"14px 14px 6px",fontSize:10,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",color:"rgba(132,204,22,0.45)",userSelect:"none"}}>{sec.label}</div>}
              {!sec.label && si > 0 && <div style={{margin:"10px 14px",height:1,background:"rgba(132,204,22,0.12)"}}/>}
              {sec.items.filter(item => { const perm = NAV_PERM_MAP[item.id]; return !perm || hasPermission(profile, data, perm); }).map(item=>{const act=activeNav===item.id;
                return(<div key={item.id}>
                  <button onMouseEnter={e=>{if(!act)e.currentTarget.style.background="rgba(132,204,22,0.08)";}} onMouseLeave={e=>{if(!act)e.currentTarget.style.background="transparent";}} onClick={()=>nav(item.id)} style={{display:"flex",alignItems:"center",gap:12,width:"100%",padding:item.indent?"8px 14px 8px 28px":"10px 14px",justifyContent:"flex-start",border:"none",borderRadius:10,background:act?"rgba(132,204,22,0.15)":"transparent",color:act?C.acc:"rgba(255,255,255,0.85)",fontSize:item.indent?12:13,fontWeight:act?600:500,cursor:"pointer",marginBottom:3,fontFamily:"inherit",transition:"background 0.12s, color 0.12s",whiteSpace:"nowrap",position:"relative",boxSizing:"border-box"}}>
                    <span style={{flexShrink:0,width:20,display:"flex",alignItems:"center",justifyContent:"center"}}>{item.icon}</span>{sbExpanded&&<><span style={{flex:1,textAlign:"left",overflow:"hidden"}}>{item.label}{item.id==="messages"&&(()=>{const uc=(data?.messages||[]).filter(m=>m.direction==="inbound"&&!m.readAt).length;return uc>0?<span style={{marginLeft:6,background:C.acc,color:"#fff",borderRadius:10,fontSize:10,fontWeight:700,padding:"1px 6px",minWidth:18,display:"inline-flex",alignItems:"center",justifyContent:"center"}}>{uc}</span>:null;})()}</span>{item.hotkey&&hkHints&&<kbd style={{fontSize:9,fontWeight:600,color:"rgba(132,204,22,0.35)",background:"rgba(132,204,22,0.08)",border:"1px solid rgba(132,204,22,0.12)",borderRadius:4,padding:"1px 5px",fontFamily:"'Outfit',monospace",lineHeight:1.4,flexShrink:0}}>{item.hotkey}</kbd>}</>}
                  </button>
                </div>);
              })}
            </div>
          ))}
        </nav>
        <div style={{padding:"14px 10px",display:"flex",flexDirection:"column",gap:6,position:"relative"}}>
          {sbExpanded && (
            <div style={{position:"relative"}}>
              <button onClick={() => setAccountSwitchOpen(!accountSwitchOpen)} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"6px 8px",border:"none",borderRadius:8,background:accountSwitchOpen ? "rgba(132,204,22,0.15)" : "transparent",color:"rgba(132,204,22,0.6)",cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:600,textAlign:"left",transition:"background 0.15s"}}>
                <div style={{width:26,height:26,borderRadius:13,background:"rgba(132,204,22,0.2)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <span style={{fontSize:11,fontWeight:800,color:C.acc}}>{(profile?.full_name || profile?.email || "?")[0].toUpperCase()}</span>
                </div>
                <div style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:"rgba(132,204,22,0.55)",fontSize:11}}>{profile?.full_name || profile?.email}</div>
                <span style={{fontSize:8,color:"rgba(132,204,22,0.3)",transform:accountSwitchOpen?"rotate(180deg)":"rotate(0deg)",transition:"transform 0.15s"}}>&#9650;</span>
              </button>

              {/* Quick-switch dropdown */}
              {accountSwitchOpen && (
                <div style={{position:"absolute",bottom:"100%",left:0,right:0,marginBottom:6,background:"#0D3B1E",border:"1px solid rgba(132,204,22,0.2)",borderRadius:10,boxShadow:"0 -8px 32px rgba(0,0,0,0.4)",overflow:"hidden",zIndex:200,maxHeight:280,overflowY:"auto"}}>
                  <div style={{padding:"10px 12px 6px",fontSize:9,fontWeight:700,color:"rgba(132,204,22,0.35)",textTransform:"uppercase",letterSpacing:"0.08em"}}>Switch Account</div>
                  {teamAccounts.length === 0 ? (
                    <div style={{padding:"12px",fontSize:11,color:"rgba(255,255,255,0.3)",textAlign:"center",fontStyle:"italic"}}>No other accounts at this location</div>
                  ) : teamAccounts.map(acct => (
                    <button key={acct.id} onClick={() => { setSwitchTarget(acct); setSwitchPassword(""); setSwitchError(""); setAccountSwitchOpen(false); }}
                      style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"10px 12px",border:"none",background:"transparent",color:"rgba(255,255,255,0.8)",cursor:"pointer",fontFamily:"inherit",fontSize:12,textAlign:"left",transition:"background 0.1s"}}
                      onMouseEnter={e => e.currentTarget.style.background = "rgba(132,204,22,0.1)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <div style={{width:28,height:28,borderRadius:14,background:"rgba(132,204,22,0.15)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                        <span style={{fontSize:12,fontWeight:800,color:C.acc}}>{(acct.full_name || acct.email || "?")[0].toUpperCase()}</span>
                      </div>
                      <div style={{flex:1,overflow:"hidden"}}>
                        <div style={{fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{acct.full_name || acct.email}</div>
                        <div style={{fontSize:10,color:"rgba(255,255,255,0.35)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{acct.email}</div>
                      </div>
                      <div style={{fontSize:9,padding:"2px 6px",borderRadius:4,background:"rgba(132,204,22,0.1)",color:"rgba(132,204,22,0.5)",fontWeight:600,textTransform:"uppercase"}}>{acct.role}</div>
                    </button>
                  ))}
                  <div style={{borderTop:"1px solid rgba(132,204,22,0.1)",padding:"6px 12px"}}>
                    <button onClick={signOut} style={{width:"100%",padding:"8px",border:"none",borderRadius:6,background:"rgba(239,68,68,0.12)",color:"rgba(255,150,150,0.8)",cursor:"pointer",fontSize:11,fontFamily:"inherit",fontWeight:600}}>Sign Out</button>
                  </div>
                </div>
              )}
            </div>
          )}
          {!sbExpanded && <button onClick={signOut} style={{width:"100%",padding:"7px 14px",border:"none",borderRadius:8,background:"rgba(239,68,68,0.12)",color:"rgba(255,150,150,0.8)",cursor:"pointer",fontSize:12,fontFamily:"inherit",fontWeight:500,textAlign:"center",boxSizing:"border-box"}}>⏻</button>}
          {sbExpanded && <div style={{textAlign:"center",fontSize:9,color:"rgba(255,255,255,0.5)",marginTop:4,lineHeight:1.4}}>&copy; 2026 K9 Operations LLC<br/>All Rights Reserved</div>}

          {/* Password prompt modal for account switch */}
          {switchTarget && ReactDOM.createPortal(
            <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999}} onClick={() => { setSwitchTarget(null); setSwitchPassword(""); setSwitchError(""); }}>
              <div onClick={e => e.stopPropagation()} style={{background:C.surface,borderRadius:16,padding:28,width:380,maxWidth:"90vw",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
                <div style={{fontSize:18,fontWeight:700,color:C.text,marginBottom:4}}>Switch Account</div>
                <div style={{fontSize:13,color:C.textSec,marginBottom:20}}>Enter password for <strong>{switchTarget.full_name || switchTarget.email}</strong></div>
                <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:C.bg,borderRadius:10,marginBottom:16}}>
                  <div style={{width:32,height:32,borderRadius:16,background:C.priLt,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    <span style={{fontSize:14,fontWeight:800,color:C.pri}}>{(switchTarget.full_name || switchTarget.email || "?")[0].toUpperCase()}</span>
                  </div>
                  <div>
                    <div style={{fontWeight:600,fontSize:13,color:C.text}}>{switchTarget.full_name || "Team Member"}</div>
                    <div style={{fontSize:11,color:C.textMut}}>{switchTarget.email}</div>
                  </div>
                </div>
                <input type="password" value={switchPassword} onChange={e => setSwitchPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAccountSwitch()} placeholder="Password" autoFocus style={{width:"100%",padding:"10px 14px",borderRadius:10,border:`1.5px solid ${switchError ? "#EF4444" : C.border}`,fontSize:14,fontFamily:"inherit",background:C.bg,color:C.text,boxSizing:"border-box",marginBottom:switchError ? 8 : 16}} />
                {switchError && <div style={{fontSize:12,color:"#EF4444",marginBottom:12,fontWeight:500}}>{switchError}</div>}
                <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
                  <Btn variant="secondary" onClick={() => { setSwitchTarget(null); setSwitchPassword(""); setSwitchError(""); }}>Cancel</Btn>
                  <Btn variant="primary" onClick={handleAccountSwitch} disabled={!switchPassword || switchLoading}>{switchLoading ? "Signing in..." : "Switch"}</Btn>
                </div>
              </div>
            </div>,
            document.body
          )}
        </div>
        </>)}
      </div>
        );
      })()}

      {/* Mobile Header */}
      <div className="mob-h" style={{display:"none",position:"fixed",top:0,left:0,right:0,height:56,background:C.pri,alignItems:"center",justifyContent:"space-between",padding:"0 16px",zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}><button onClick={()=>setMobileMenuOpen(!mobileMenuOpen)} style={{background:"none",border:"none",color:C.acc,cursor:"pointer",padding:4}}><I.Menu/></button><div><span style={{fontSize:16,fontWeight:700,color:C.acc,fontFamily:"'Outfit', sans-serif"}}>K9 Operations</span><div style={{fontSize:9,color:"rgba(132,204,22,0.6)",letterSpacing:"0.05em",textTransform:"uppercase"}}>{(allLocations.find(l=>l.id===currentLocation)||allLocations[1]||allLocations[0]).name}</div></div></div>
        <K9LogoMini size={28}/>
      </div>

      {mobileMenuOpen&&<div className="mob-ov" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200}} onClick={()=>setMobileMenuOpen(false)}><div onClick={e=>e.stopPropagation()} style={{width:260,height:"100%",background:`linear-gradient(180deg, ${C.pri} 0%, #0D3B1E 100%)`,padding:"24px 16px",overflowY:"auto"}}><div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}><K9Logo size={38}/><div><div style={{fontSize:16,fontWeight:700,color:C.acc,fontFamily:"'Outfit', sans-serif"}}>K9 Operations</div><div style={{fontSize:10,color:"rgba(132,204,22,0.6)",letterSpacing:"0.08em",textTransform:"uppercase"}}>Lite · KOL</div></div></div><div style={{marginBottom:16}}><LocationSelector currentLocation={currentLocation} onLocationChange={handleLocationChange} collapsed={false} allLocations={allLocations} profile={profile} /></div>{navSections.map((sec,si)=>(<div key={si}>{sec.label&&<div style={{padding:"14px 14px 6px",fontSize:10,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",color:"rgba(132,204,22,0.45)",userSelect:"none"}}>{sec.label}</div>}{!sec.label&&si>0&&<div style={{margin:"10px 14px",height:1,background:"rgba(132,204,22,0.12)"}}/>}{sec.items.map(item=>(<div key={item.id}><button onClick={()=>{nav(item.id);setMobileMenuOpen(false);}} style={{display:"flex",alignItems:"center",gap:12,width:"100%",padding:item.indent?"10px 14px 10px 28px":"12px 14px",border:"none",borderRadius:10,background:activeNav===item.id?"rgba(132,204,22,0.15)":"transparent",color:activeNav===item.id?C.acc:"rgba(255,255,255,0.85)",fontSize:item.indent?13:14,fontWeight:activeNav===item.id?600:500,cursor:"pointer",marginBottom:4,fontFamily:"inherit"}}>{item.icon}<span style={{flex:1,textAlign:"left"}}>{item.label}</span></button></div>))}</div>))}</div></div>}

      {/* Main */}
      <div className="main-content" style={{flex:1,overflow:"auto",padding:"28px 32px",scrollbarGutter:"stable"}}>
        <div style={{maxWidth: 1440, margin:"0 auto"}}>
          {navStack.length > 1 && (
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:16,fontSize:13,flexWrap:"wrap"}}>
              {navStack.map((entry, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span style={{color:C.border,fontSize:11,userSelect:"none"}}>›</span>}
                  {i < navStack.length - 1 ? (
                    <span onClick={() => { setPage(entry.page); setParams(entry.params); setNavStack(s => s.slice(0, i + 1)); const url = buildUrl(locSlug, entry.page, entry.params, data); if (window.location.pathname !== url) window.history.pushState({}, "", url); }}
                      style={{cursor:"pointer",color:C.pri,fontWeight:500,padding:"2px 6px",borderRadius:6,transition:"background 0.15s"}}
                      onMouseEnter={e=>e.currentTarget.style.background=C.priLt}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      {breadcrumbLabel(entry.page, entry.params)}
                    </span>
                  ) : (
                    <span style={{fontWeight:600,color:C.text,padding:"2px 6px"}}>{breadcrumbLabel(entry.page, entry.params)}</span>
                  )}
                </React.Fragment>
              ))}
            </div>
          )}
          <ErrorBoundary key={page}>{renderPage()}</ErrorBoundary>
        </div>
      </div>


      {/* ═══ Time Travel Banner ═══ */}
      {isDevUser && timeTravelDate && (
        <div style={{position:"fixed",top:0,left:0,right:0,height:32,background:"#DC2626",color:"white",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,zIndex:10000,letterSpacing:0.5,fontFamily:"inherit"}}>
          ⚠ TIME TRAVEL ACTIVE — Simulating {(() => { try { const d = new Date(timeTravelDate + "T12:00:00"); return d.toLocaleDateString("en-US",{weekday:"short",month:"long",day:"numeric",year:"numeric"}); } catch { return timeTravelDate; } })()} (real: {new Date().toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})})
          <button onClick={() => updateTimeTravel("")} style={{marginLeft:16,padding:"2px 10px",borderRadius:4,border:"1px solid rgba(255,255,255,0.5)",background:"transparent",color:"white",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Clear</button>
        </div>
      )}

      {/* ═══ Time Travel Toolbar ═══ */}
      {isDevUser && (
        <div style={{position:"fixed",bottom:24,left:24,zIndex:9998,fontFamily:"inherit"}}>
          {!timeTravelOpen ? (
            <button onClick={() => setTimeTravelOpen(true)} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 16px",borderRadius:24,border:timeTravelDate ? "2px solid #DC2626" : "1px solid #d1d5db",background:timeTravelDate ? "#FEF2F2" : "#fff",color:timeTravelDate ? "#DC2626" : "#374151",fontSize:12,fontWeight:600,cursor:"pointer",boxShadow:"0 4px 12px rgba(0,0,0,0.12)",fontFamily:"inherit",transition:"all 0.2s"}}>
              <span style={{fontSize:16}}>🕐</span>
              {timeTravelDate ? `Simulating: ${timeTravelDate}` : "Time Travel"}
            </button>
          ) : (
            <div style={{width:320,background:"#fff",border:timeTravelDate ? "2px solid #DC2626" : "1px solid #d1d5db",borderRadius:16,padding:20,boxShadow:"0 12px 32px rgba(0,0,0,0.18)"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:18}}>🕐</span>
                  <span style={{fontSize:14,fontWeight:700,color:"#111"}}>Time Travel</span>
                  <span style={{fontSize:10,padding:"2px 6px",borderRadius:4,background:"#EFF6FF",color:"#1D4ED8",fontWeight:600}}>DEV</span>
                </div>
                <button onClick={() => setTimeTravelOpen(false)} style={{width:24,height:24,borderRadius:12,border:"none",background:"#f3f4f6",cursor:"pointer",fontSize:14,fontWeight:700,color:"#6b7280",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"inherit"}}>×</button>
              </div>
              <div style={{fontSize:11,color:"#6b7280",marginBottom:10}}>Override the app's date for testing. DB writes still use real time.</div>
              <input type="date" value={timeTravelDate} onChange={e => updateTimeTravel(e.target.value)} style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,fontFamily:"inherit",marginBottom:12,boxSizing:"border-box"}} />
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
                {[["Today",""],["+ 1d",1],["+ 7d",7],["+ 30d",30],["+ 90d",90]].map(([label,days]) => (
                  <button key={label} onClick={() => {
                    if (days === "") { updateTimeTravel(""); return; }
                    const d = new Date(); d.setDate(d.getDate() + days);
                    updateTimeTravel(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`);
                  }} style={{padding:"5px 10px",borderRadius:6,border:"1px solid #e5e7eb",background:days === "" ? "#f3f4f6" : "#fff",fontSize:11,fontWeight:600,cursor:"pointer",color:days === "" ? "#DC2626" : "#374151",fontFamily:"inherit"}}>
                    {label}
                  </button>
                ))}
              </div>
              {timeTravelDate && (
                <div style={{padding:"8px 10px",borderRadius:8,background:"#FEF2F2",border:"1px solid #FECACA",fontSize:11,color:"#DC2626",fontWeight:600,textAlign:"center"}}>
                  Active: {timeTravelDate} → {(() => { try { return new Date(timeTravelDate+"T12:00:00").toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"}); } catch { return timeTravelDate; } })()}
                </div>
              )}
              <div style={{fontSize:10,color:"#9ca3af",marginTop:8,textAlign:"center"}}>Real date: {new Date().toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}</div>
            </div>
          )}
        </div>
      )}

      {/* ═══ Global Toast ═══ */}
      {globalToasts.length > 0 && (
        <div style={{position:"fixed",bottom:24,right:24,zIndex:9999,display:"flex",flexDirection:"column",gap:8,maxWidth:400}}>
          {globalToasts.map(t => {
            const tIcon = t.type === "error" ? I.AlertTriangle : t.type === "info" ? I.InfoCircle : I.Check;
            const tBg = t.type === "error" ? (C.danLt||"#fef2f2") : t.type === "info" ? (C.priLt||"#eff6ff") : (C.sucLt||"#e8f5e9");
            const tFg = t.type === "error" ? C.dan : t.type === "info" ? C.pri : C.suc;
            return (
            <div key={t.id} style={{display:"flex",alignItems:"center",gap:12,background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"12px 16px",boxShadow:"0 8px 24px rgba(0,0,0,0.12)",animation:"k9toast 0.3s ease-out"}}>
              <div style={{width:28,height:28,borderRadius:14,background:tBg,color:tFg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{React.createElement(tIcon)}</div>
              <div style={{flex:1,fontSize:13,fontWeight:600,color:C.text}}>{t.message}</div>
              {t.actionLabel && <button onClick={()=>{t.onAction&&t.onAction();dismissGlobalToast(t.id);}} style={{padding:"6px 14px",borderRadius:8,border:"none",background:C.pri,color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>{t.actionLabel}</button>}
              <button onClick={()=>dismissGlobalToast(t.id)} style={{width:22,height:22,borderRadius:11,border:"none",background:"transparent",cursor:"pointer",color:C.textMut,fontSize:15,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",padding:0,fontFamily:"inherit"}}>&times;</button>
            </div>
            );
          })}
        </div>
      )}

      {/* ═══ Superhuman-style "New" Overlay ═══ */}
      {showNewOverlay && <NewOverlay data={data} nav={nav} onClose={() => setShowNewOverlay(false)} />}
      {commandBarOpen && <CommandBar data={data} profile={profile} isOpen={commandBarOpen} onClose={() => setCommandBarOpen(false)} nav={nav} allLocations={allLocations} onLocationChange={handleLocationChange} />}
    </div>
    </ErrorBoundary>
  );
}

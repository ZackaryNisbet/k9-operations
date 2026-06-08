# Base Platform Pages (K9 Operations / Lite / KOL)

Every screen in the base + Analytics edition (`src/kol/`), each with its **purpose**,
its **files & directory organization**, and its **backend functionality** (tables /
RPCs / edge functions / hooks, realtime, and the permission that gates it).

- **Edition entry:** [`src/kol/KolApp.jsx`](../../src/kol/KolApp.jsx) — a thin shell that
  renders the role‑aware sidebar and a `renderPage()` switch over a `page` id. URL
  routing is `parseLiteUrl`/`buildLiteUrl` (`/{location}/{page}`); there is no React Router.
- **Permissions:** each `page` id maps to a lean permission area in `PAGE_PERMISSION_MAP`
  (KolApp) and is checked by `canAccessLitePage` via [`shared/permissions.js`](../../src/shared/permissions.js).
- **Data patterns:** **Hook** (`src/hooks/use*.js`), **RPC** (`supabase.rpc`), **Edge fn**
  (`supabase.functions.invoke`). See [Backend & Data](Backend-and-Data.md) and
  [PAGE_DATA_LOGIC.md](../architecture/PAGE_DATA_LOGIC.md).

> Convention below — **Files** lists the route entry first, then colocated
> components/libs; **Backend** lists tables → RPCs → edge fns → hooks, then realtime
> and the permission key.

## Contents
- [Home & reporting](#home--reporting) — Home, Dashboard, Reports, Occupancy
- [Daily operations](#daily-operations) — Ops Hub, Daily Ops, Care Reports, Roll Call, Weekly Maintenance, My Work, EOD
- [Customer lifecycle & CRM](#customer-lifecycle--crm) — Lifecycle, Client/Dog Detail, New Client, CRM, Funnel
- [Labor, scheduling & interviews](#labor-scheduling--interviews) — Labor, Scheduling, Interviews, Attendance, Audit Log
- [Enrichment & care](#enrichment--care) — Enrichments, Photos
- [Inventory & finance](#inventory--finance) — Inventory, Inventory Report, Cash Tips, Refunds
- [Front of house](#front-of-house) — Checkout TV, Checkout Notes, Calendar
- [Marketing](#marketing) — Grassroots, Marketing Directory
- [Facilities & incidents](#facilities--incidents) — Resort Upkeep, Incidents, Resources, Role Layout
- [Admin & config](#admin--config) — Settings, Gingr Config, Test Health, Onboarding, Pricing
- [Enterprise](Enterprise.md) (separate page)

---

## Home & reporting

### Home — `/{loc}/home`
- **Purpose:** role‑aware landing — shift/oversight summary, in‑house/arrivals/departures/occupancy KPIs, "today's enrichment", and a launcher grid to every other area.
- **Files:** `src/kol/pages/HomePage.jsx`.
- **Backend:** `useFacilityPresence` (canonical BOH presence, polled) + `rpc("dashboard_mobile_snapshot")`, `ops-platform-health` edge fn, weather hook. **Realtime:** presence poll (5s). **Permission:** none (universal landing).

### Dashboard — `/{loc}/dashboard`
- **Purpose:** revenue (cash + accrual), occupancy, labor %, funnel and ops KPIs with charts. Featured in the **Analytics** edition (`?mode=analytics`); financial widgets are permission‑gated.
- **Files:** `src/kol/pages/DashboardPage.jsx` + `src/kol/pages/dashboard/`.
- **Backend:** `useDashboardMetrics` over precomputed `dashboard_metrics_daily` (+ `shared/dashboardCache.js`, IndexedDB) and `rpc("snapshot_live")`; `useAccrualRevenue`/`useCashBasisRevenue`. **Realtime:** poll + stale‑while‑revalidate. **Permission:** `Financial Reporting` for $ widgets.

### Reports — `/{loc}/reports`
- **Purpose:** "Revenue Intelligence" workspace — cash/accrual revenue, RevPAR, category/composition breakdowns, plain‑language "ask anything".
- **Files:** `src/kol/pages/ReportsPage.jsx`.
- **Backend:** revenue engines (`shared/accrualEngine.js`, `shared/cashBasisRevenue.js`) over Gingr mirror; `nlp-query` edge fn for natural‑language. **Permission:** `Financial Reporting`.

### Occupancy Report — `/{loc}/occupancy-report`
- **Purpose:** occupancy % trend (today / avg / peak / low) over a selectable window.
- **Files:** `src/kol/pages/OccupancyReportPage.jsx`.
- **Backend:** occupancy aggregates over reservations (`refreshOptions`‑driven). **Permission:** `Occupancy Reports`.

---

## Daily operations

### Operations Hub / Ops Overview — `/{loc}/operations`
- **Purpose:** today's progress across every daily‑ops surface (opening/closing, FE/BE, room cleaning, private play, collars, lodging transfers, EOD, weekly inventory/maintenance, services).
- **Files:** `src/kol/pages/OperationsHub.jsx`; helpers in `src/shared/opsHelpers.js`.
- **Backend:** `lite_daily_ops` (via `useRealtimeOps` + `useWorkflowProgressSnapshot`), `ops-compute`/`ops-compute-ondemand` edge fns. **Realtime:** yes. **Permission:** `Operations Hub`.

### Daily Ops checklists — `/{loc}/ops/*` (opening, front-end, back-end, rooms, pictures, private-play, closing, bathing, belongings, collars, lodging-transfers, pamper, service)
- **Purpose:** the individual live checklists; each is a `DailyOpsPage` sub‑mode with real‑time completion.
- **Files:** `src/kol/pages/DailyOpsPage.jsx` (+ `WeeklyMaintenancePage.jsx`).
- **Backend:** `lite_daily_ops`, `lite_checklist_templates` (template source for web + mobile), `ops-compute-ondemand`. **Realtime:** yes. **Permission:** `Operations Hub`.

### Care Reports (feeding & meds) — `/{loc}/ops/feeding-meds/*`, `feeding-report`, `medication-report`
- **Purpose:** AM/midday/PM feeding & medication reports computed from Gingr instructions.
- **Files:** `src/kol/pages/CareReportsPage.jsx`.
- **Backend:** `ops-compute-ondemand` edge fn. **Permission:** `Operations Hub`.

### Roll Call — `/{loc}/ops/roll-call/{opening|closing}`
- **Purpose:** opening/closing roll‑call sessions (who's in the building).
- **Files:** `src/kol/pages/RollCallSessionsPage.jsx`.
- **Backend:** facility presence + roll‑call session tables. **Permission:** `Operations Hub`.

### My Work — `/{loc}/role-page`
- **Purpose:** the staff execution surface — the logged‑in role's checklist/task feed for the shift.
- **Files:** `src/kol/pages/RolePage.jsx`; editor at `src/kol/pages/RoleLayoutPage.jsx`.
- **Backend:** role page config + `lite_daily_ops`; `rpc("replace_role_page_config")` to edit. **Realtime:** yes. **Permission:** `My Work` (editor: `Checklist Templates`).

### End of Day — `/{loc}/eod`
- **Purpose:** the end‑of‑day report form (counts, cash, notes, mentions).
- **Files:** `src/kol/pages/EODPage.jsx`.
- **Backend:** `lite_daily_ops` (type `eod`) + EOD section settings. **Realtime:** yes. **Permission:** `EOD Reports`.

---

## Customer lifecycle & CRM

### Customer Lifecycle — `/{loc}/lifecycle`
- **Purpose:** every client auto‑segmented into lead / active / lapsed with follow‑ups and outreach logging.
- **Files:** `src/kol/pages/ClientsPage.jsx` (detail: `ClientDetailPage.jsx`, `DogDetailPage.jsx`/`DogProfilePage.jsx`).
- **Backend:** `useGingrData` (clients/dogs/reservations, `lite_clients`, `lite_client_lifecycle`, `ignite_leads`) + `rpc("get_client_stats")`; lifecycle writes upsert `lite_client_lifecycle`. **Realtime:** yes. **Permission:** `Customer Lifecycle`.

### New Client — `/{loc}/new-client`
- **Purpose:** create a "lite" client (lead) with phone/email dedup.
- **Files:** `src/kol/pages/NewClientPage.jsx`; `insertLiteClient`/`updateLiteClient` in `src/hooks/useGingrData.js`.
- **Backend:** `lite_clients`. **Permission:** `Customer Lifecycle`.

### CRM — `/{loc}/crm`
- **Purpose:** the Ignite / web‑form intake pipeline (booking availability, employment, history tabs) with call/text/note logging.
- **Files:** `src/kol/pages/CrmPage.jsx`; logic in `src/kol/crmData.js`.
- **Backend:** Gingr + `ignite_leads` + `lite_client_lifecycle` (the canonical "log an update" surface). **Realtime:** yes. **Permission:** `CRM Access`.

### Funnel — `/{loc}/funnel`
- **Purpose:** conversion‑funnel metrics derived from lifecycle data.
- **Files:** `src/kol/pages/FunnelPage.jsx`.
- **Backend:** derived from `useGingrData`/lifecycle. **Permission:** `Customer Lifecycle`.

---

## Labor, scheduling & interviews

### Labor / Training — `/{loc}/labor` (tabs: roster, training, performance‑reviews, templates, attendance, interviews, notes, capacity‑planning)
- **Purpose:** the full labor program — roster, training records, 30/60/90 compliance reviews, templates, and capacity/labor‑model planning.
- **Files:** `src/kol/pages/TrainingPage.jsx` + `src/kol/pages/training/` (constants, helpers, components); `src/kol/trainingData.js`, `performanceReviewData.js`, `laborRosterPdf.js`.
- **Backend:** `labor_employees`, `training_records`, `employee_review_instances`, `labor_compliance_*`, `labor_position_hierarchy`, `labor_capacity_model*`, `daily_staff_plan`; many `rpc("…labor…")`; PDF export. **Realtime:** yes. **Permission:** `Labor Management` + per‑tab keys (e.g. `Labor Roster`, `Labor Compliance View`, `Labor Interviews`).

### Scheduling — `/{loc}/scheduling`
- **Purpose:** the 7‑day demand‑vs‑staffing matrix, capacity watch, and back‑end rotation builder.
- **Files:** `src/kol/pages/SchedulingPage.jsx` + `src/kol/scheduling/`; engine `src/shared/schedulingEngine.js`.
- **Backend:** `useSchedulingData` over `scheduling_matrix_daily`, `daily_staff_plan`, `rotation_schedules`, `scheduling_projection_snapshots`; `compute-scheduling-matrix` / `compute-rotation-schedule` / `scheduling-audit` edge fns. **Permission:** `Operations Hub`.

### Interviews — `/{loc}/labor/interviews`
- **Purpose:** interview workflow — records, PDF preview, AI draft summary, audio transcription.
- **Files:** `src/kol/pages/LaborInterviewsPage.jsx` + `src/kol/pages/laborInterviews/`; `src/kol/interviewData.js`.
- **Backend:** `rpc("get_labor_interview_records_redacted")`; `interview-ai-draft` / `interview-transcribe-audio` edge fns + `api/interview-normalize-audio` (FFmpeg). **Permission:** `Labor Interviews`.

### Attendance — `/{loc}/attendance`
- **Purpose:** the attendance tracker (and summary view).
- **Files:** `src/kol/pages/AttendancePage.jsx` + `src/kol/pages/attendance/`; `src/kol/attendanceData.js`.
- **Backend:** `rpc("get_labor_roster_snapshot")` + attendance tables. **Realtime:** yes. **Permission:** `Attendance Tracker`.

### Audit Log — `/{loc}/audit-log`
- **Purpose:** the location's change/audit history.
- **Files:** `src/kol/pages/AuditLogPage.jsx`.
- **Backend:** `lite_audit_log`. **Permission:** `User Management`.

---

## Enrichment & care

### Enrichments — `/{loc}/enrichments`
- **Purpose:** the enrichment portal — daily dog queue, event plan/SOP, and a planning calendar.
- **Files:** `src/kol/pages/EnrichmentsPage.jsx` + `src/kol/pages/enrichments/`.
- **Backend:** `useEnrichmentEvents` (`enrichment_events`) + `useEnrichmentWorkflow` (`gingr_animals`, `v_dog_playgroup_assignments_current`, `gingr_reservations`, `lite_daily_ops`); `useEnrichmentProgramConfig`. **Realtime:** yes. **Permission:** none (open to staff).

### Photos — `/{loc}/photos`
- **Purpose:** photo grid with HEIC conversion and automatic breed‑based pet pairing.
- **Files:** `src/kol/pages/PhotosPage.jsx` + `src/kol/pages/photos/` (`BrowseDogsPanel`, `BulkPairModal`, `pairingData.js`).
- **Backend:** Storage bucket `photos`, `gingr_animals`/`gingr_animal_icons`, `breed-detect` edge fn. **Permission:** `Photos Module`.

---

## Inventory & finance

### Inventory — `/{loc}/inventory`
- **Purpose:** weekly count cycles, catalog, on‑hand/in‑transit/reorder, depletion rates.
- **Files:** `src/kol/pages/InventoryPage.jsx` + `src/kol/pages/inventory/` (`DepletionRateModal`, …).
- **Backend:** `inventory_catalog`, `inventory_snapshots`, `inventory_counts`. **Realtime:** yes. **Permission:** `Inventory Management`.

### Inventory Report — `/{loc}/inventory/report`
- **Purpose:** inventory reporting & valuation.
- **Files:** `src/kol/pages/InventoryReportPage.jsx`. **Permission:** `Inventory Management`.

### Cash Tips — `/{loc}/cash-tips`
- **Purpose:** cash tips tracking & reconciliation.
- **Files:** `src/kol/pages/CashTipsPage.jsx`. **Backend:** cash‑basis tables. **Permission:** `Financial Reporting`.

### Refunds — `/{loc}/refunds`
- **Purpose:** refunds view.
- **Files:** `src/kol/pages/RefundsPage.jsx`. **Permission:** financial.

---

## Front of house

### Checkout TV — `/{loc}/checkout-tv`
- **Purpose:** the live lobby checkout board (fullscreen) — who's going home and when.
- **Files:** `src/kol/pages/CheckoutTVPage.jsx`; freshness in `checkoutTvFreshness.js`.
- **Backend:** `facility_presence_snapshot` RPC + `gingr-boh-poll`. **Realtime:** yes (2s‑throttled). **Permission:** `Checkout TV Access`.

### Checkout Notes (Today's Notes) — `/{loc}/checkout-notes`
- **Purpose:** per‑dog owner/checkout notes pulled from Gingr.
- **Files:** `src/kol/pages/CheckoutNotesPage.jsx`.
- **Backend:** `gingr-today-notes` edge fn. **Realtime:** yes.

### Calendar — `/{loc}/calendar`
- **Purpose:** the aggregated multi‑source calendar (labor starts, compliance, training due, marketing, enrichment, inventory, holidays).
- **Files:** `src/kol/pages/CalendarPage.jsx`, `src/kol/pages/calendarSources.js`; `src/shared/AggregatedCalendar.jsx`, `calendarGrid.js`.
- **Backend:** `rpc("get_calendar_events")` (server‑aggregated). **Realtime:** yes (subscribed to source tables). **Permission:** `Calendar Access`.

---

## Marketing

### Grassroots / Marketing — `/{loc}/grassroots`
- **Purpose:** local outreach tracker — events, visits, partnerships with follow‑ups.
- **Files:** `src/kol/pages/GrassrootsPage.jsx` + `src/kol/pages/grassroots/`; `src/kol/grassrootsData.js`, `grassrootsAddress.js`.
- **Backend:** `grassroots_*` tables; `rpc("save_grassroots_*")`; Google Places autocomplete. **Realtime:** yes. **Permission:** `Grassroots Access`.

### Marketing Directory — `/{loc}/marketing-directory`
- **Purpose:** the organization/contact directory for marketing.
- **Files:** `src/kol/pages/MarketingDirectoryPage.jsx`; `src/kol/marketingDirectoryData.js`, `marketingDirectorySync.js`.
- **Backend:** marketing directory tables. **Permission:** `Marketing Directory Access`.

---

## Facilities & incidents

### Resort Upkeep — `/{loc}/resort-upkeep`
- **Purpose:** building maintenance, vendors, and licenses with due/overdue tracking.
- **Files:** `src/kol/pages/ResortUpkeepPage.jsx`; `src/kol/resortUpkeepData.js`.
- **Backend:** `resort_upkeep_*` tables via ~19 `rpc("resort_upkeep_*")`. **Realtime:** yes. **Permission:** `Resort Upkeep Access`.

### Incidents — `/{loc}/incidents`
- **Purpose:** incident cases/forms and incident‑rate inputs.
- **Files:** `src/kol/pages/ClientManagementPage.jsx`; `src/kol/clientManagementData.js`.
- **Backend:** `rpc("incident_rate_inputs")` + incident tables. **Permission:** `Customer Lifecycle`.

### Resources — `/{loc}/resources`
- **Purpose:** SOPs, HR links, and shared docs organized into reusable sections.
- **Files:** `src/kol/pages/ResourcesPage.jsx`.
- **Backend:** resources/settings tables. **Permission:** none (staff).

### Role Layout — `/{loc}/role-layout`
- **Purpose:** the checklist/role‑page template editor.
- **Files:** `src/kol/pages/RoleLayoutPage.jsx`.
- **Backend:** `rpc("replace_role_page_config")`. **Permission:** `Checklist Templates`.

---

## Admin & config

### Settings — `/{loc}/settings`
- **Purpose:** Gingr/Ignite/rooms/permissions/weather configuration (tabbed).
- **Files:** `src/kol/pages/SettingsPage.jsx` + `src/kol/settings/`.
- **Backend:** per‑tab settings tables (`lite_settings`, `lite_permissions`) + `rpc("replace_gingr_workflow_mapping")`. **Permission:** none gate (admin surfaces inside are role‑gated).

### Gingr Configuration — `/{loc}/gingr-icons`
- **Purpose:** map Gingr icons/reservation types into the platform's workflow categories.
- **Files:** `src/kol/pages/GingrIconsPage.jsx`.
- **Backend:** Gingr mapping settings tables. **Permission:** `Gingr Integration`.

### Test Health — `/{loc}/test-health`
- **Purpose:** surfaces the Vitest results dashboard (non‑blocking) generated at build.
- **Files:** `src/kol/pages/TestHealthPage.jsx`; data from `public/test-results.json` (`scripts/generate-test-results.js`).

### Onboarding / Pricing — `/onboarding`, `/pricing`
- **Purpose:** the Ignite onboarding flow and the public pricing/plan selector.
- **Files:** `src/kol/pages/OnboardingPage.jsx` (+ `src/kol/onboarding/`), `src/kol/pages/PricingPage.jsx`.
- **Backend:** subscription/plan tables; billing via `stripe-checkout`. **Permission:** top‑level (no location).

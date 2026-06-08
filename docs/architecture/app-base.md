# Edition: K9 Operations (base / Lite / KOL)

The default authenticated application and the **target architecture** for the
product. Internally called "Lite" or "KOL"; lives under `src/kol/`.

> See [EDITIONS.md](EDITIONS.md) for how this edition is selected vs. Analytics
> and POS.

---

## Entry & shell

- **Mounted by:** `Root()` in `src/main.jsx` for any authenticated path that does
  not start with `/pos` (`return <LiteApp />`).
- **Component:** `LiteApp` (default export of [`src/kol/KolApp.jsx`](../../src/kol/KolApp.jsx))
  → `LeanAppInner`, wrapped in `BrandedErrorBoundary`.
- **Responsibility of the shell:** location/nav state, internal URL routing,
  sidebar, and a `renderPage()` switch that mounts page components. `KolApp.jsx`
  is explicitly a *thin router* ("DO NOT add page logic here").

## Internal routing

- URL scheme: `/{locationSlug}/{pageSlug}` (root‑relative; legacy `/lite` prefix
  stripped). Special forms: top‑level pages (`/onboarding`, `/pricing`),
  enterprise (`/enterprise/{page}`), client/dog nesting
  (`/{loc}/client/{phone}/{dog}`), labor tabs (`/{loc}/labor/{tab}`).
- Helpers: `parseLiteUrl(pathname)` and `buildLiteUrl(locSlug, page, params)` keep
  the address bar in sync via `history.pushState`/`replaceState`.

## Navigation & permissions

Nav is **role‑based**. `KolApp.jsx` selects a nav array, then filters each item
through `canAccessLitePage(profile, id)` against `PAGE_PERMISSION_MAP`:

| Role bucket | Nav array | Highlights |
| --- | --- | --- |
| staff (pct/csr) | `STAFF_NAV_ITEMS` | Home, My Work, Enrichments, Inventory, Photos, TV, Settings |
| manager/supervisor | `MANAGER_NAV_ITEMS` | + CRM, Scheduling, Labor, Incidents, Resources, Marketing, Resort Upkeep, Cash Tips |
| owner/admin | `LEAN_NAV_ITEMS` | Home, CRM, Calendar, Labor, Marketing, Inventory, Settings (rest via Home cards) |
| enterprise view | `LEAN_ENTERPRISE_NAV_ITEMS` | Volume, Attendance, Performance, Vendors, Licenses, Locations, User Mgmt, Company Directory |

Permission resolution: `src/shared/permissions.js` (role → permission set, with
overrides). A subscription gate (`src/shared/SubscriptionGate.jsx`) exists but is
currently disabled (`ENABLE_SUBSCRIPTION_GATE = false`).

## Feature modules (under `src/kol/`)

Pages live in `src/kol/pages/` with domain logic in colocated `*Data.js` modules
and React data in `src/hooks/*`. Major areas:

- **Customer lifecycle / CRM:** `ClientsPage`, `ClientDetailPage`, `CrmPage`,
  `FunnelPage`, `GrassrootsPage`, `MarketingDirectoryPage` (+ `crmData.js`,
  `grassrootsData.js`, `marketingDirectoryData.js`).
- **Daily operations:** `OperationsHub`, `DailyOpsPage`, `RolePage`,
  `RoleLayoutPage`, `EODPage`, `CareReportsPage`, `RollCallSessionsPage`,
  `WeeklyMaintenancePage`, `ResortUpkeepPage` (+ `shared/opsHelpers.js`).
- **Labor & training:** `TrainingPage`, `LaborInterviewsPage`, `AttendancePage`
  (+ `trainingData.js`, `interviewData.js`, `laborRosterPdf.js`,
  `components/PerformanceReviewComplianceGrid.jsx`).
- **Scheduling:** `SchedulingPage` (+ `kol/scheduling/*`, `shared/schedulingEngine.js`).
- **Inventory:** `InventoryPage`, `InventoryReportPage` (+ `inventory*.js`).
- **Front of house:** `CheckoutTVPage`, `CheckoutNotesPage`, `PhotosPage`,
  `CashTipsPage`.
- **Enterprise (multi‑location):** `src/kol/enterprise/*`
  (`EnterpriseDashboard`, `CompanyDirectory`, `UserManagement`, `OpsMatrix`, …).
- **Settings:** `src/kol/settings/*` tabs (Gingr, Ignite, permissions, rooms,
  weather, scheduling capacity, …).
- **Enrichments / onboarding / reports:** `src/kol/enrichments/*`,
  `src/kol/onboarding/*`, `src/kol/reports/*`.

## Data access

- **Hooks** in `src/hooks/*` are the primary data layer: `useGingrData`
  (phased load + IndexedDB cache + column projection), `useDashboardMetrics`
  (server‑precomputed, stale‑while‑revalidate), `useSchedulingData`,
  `useFacilityPresence`, `useEnrichmentWorkflow`, `useEnterpriseDirectory`, …
- **Writes** are RPC‑first (`supabase.rpc(...)`) for transactional domains
  (labor, resort upkeep, enterprise) so the server owns invariants under RLS.
- **Realtime** subscriptions push live updates; newer pages debounce/coalesce
  refreshes (and the shared `reloadScheduler` centralizes this — see the egress
  PR).

## Reorganization (in flight)

The base edition is the cleanest of the three but still has large pages. First
wave PRs split the biggest into feature subfolders without behavior change:
`TrainingPage` → `src/kol/pages/training/` (#92), `SchedulingPage` →
`…/scheduling/` (#93), `DashboardPage` → `…/dashboard/` (#94), `InventoryPage` →
`…/inventory/` (#95). See [FILE_ORGANIZATION.md](FILE_ORGANIZATION.md).

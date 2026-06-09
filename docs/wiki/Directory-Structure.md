# Directory Structure (master directory)

The complete map of the repository — every top‑level entry and the important
subtrees, with what each is responsible for. For the *in‑flight* reorg and target
layout, see [FILE_ORGANIZATION.md](../architecture/FILE_ORGANIZATION.md).

## Top level

```
k9-operations/
├── index.html              # Vite HTML entry (mounts #root, loads /src/main.jsx)
├── vite.config.js          # Vite + Vitest config (build, test env, esbuild drop)
├── vercel.json             # Vercel routing/headers for the SPA + api/
├── package.json            # scripts + deps (React 18, Vite 6, Supabase JS, Vitest)
├── src/                    # all application source (see below)
├── api/                    # Vercel serverless functions (Node)
├── supabase/               # backend: migrations, edge functions, SQL
├── scripts/                # Node maintenance/ops scripts (cron audits, captures)
├── public/                 # static assets served as-is (logos, fonts, shots/)
├── docs/                   # engineering docs + this wiki/
├── dist/                   # build output (gitignored)
├── ARCHITECTURE.md         # master architecture overview
├── DESIGN.md               # design system (tokens, components, standards)
├── README.md               # front page
└── LICENSE / NOTICE        # licensing
```

## `src/` — application source

```
src/
├── main.jsx                # Entry. Root() dispatches edition/public surface by URL.
├── supabaseClient.js       # Singleton Supabase client (+ Demo-mode fetch wrapper)
├── AuthProvider.jsx        # Auth context: session bootstrap, profile load, password set
├── authRuntime.js          # Auth timeout/failure classification helpers
│
├── App.jsx                 # POS edition shell (legacy; delegates into src/pos/)
├── useData.js              # POS data layer (normalized V2 schema CRUD)
├── LandingPage.jsx         # Public marketing one-pager (K9Operations.com)
├── Login.jsx               # Staff sign-in + forgot password
├── SignupPage.jsx          # Sign-up (currently unwired)
├── BookingPage.jsx         # Public self-booking + OTP portal (delegates into src/booking/)
├── PublicPages.jsx         # Public e-sign (/sign) + intake (/form) pages
│
├── kol/                    # ── Base + Analytics edition ("Lite"/KOL) ──
│   ├── KolApp.jsx          # Thin shell: role-aware sidebar nav + page switch (renderPage)
│   ├── pages/              # 70+ page components + colocated *.js domain libs
│   │   ├── training/       # Labor/Training feature (constants, helpers, components)
│   │   ├── scheduling/     # Scheduling rotation/matrix pieces
│   │   ├── dashboard/      # Dashboard sections
│   │   ├── inventory/      # Inventory components/lib
│   │   ├── enrichments/    # Enrichment workflow UI
│   │   ├── grassroots/     # Marketing tracker columns/editors
│   │   ├── photos/         # Photo browse/pair panels
│   │   ├── attendance/     # Attendance constants
│   │   └── laborInterviews/# Interview workflow components
│   ├── enterprise/         # Multi-location views (OpsMatrix, Attendance, Users, Directory, Locations)
│   ├── settings/           # Settings tabs
│   ├── onboarding/         # Ignite onboarding flow
│   ├── reports/            # Email report builders
│   ├── components/         # Shared-within-KOL components
│   └── *Data.js            # Domain logic: trainingData, crmData, grassrootsData,
│                           #   resortUpkeepData, marketingDirectoryData, …
│
├── pos/                    # ── POS edition (extracted from App.jsx) ──
│   ├── pages/              # POS screens (Dashboard, LodgingCalendar, Payments, …)
│   ├── components/  charts/  lib/  constants/  demo/
│   ├── brand.jsx           # POS theming
│   └── icons.jsx
│
├── booking/                # Public booking feature (extracted from BookingPage.jsx)
├── ignite/                 # Lead-email parser backend (Ignite intake)
├── shared/                 # ── Cross-edition layer (design system + engines) ──
│   ├── ui.jsx              # Modal, Inp, Btn, CustomSelect, LogEntryModal, RecordActivityModal
│   ├── listSurface.jsx     # DenseTable, ListTabBar, PillFilter, StatusPill (the list standard)
│   ├── theme.js  icons.jsx # Tokens, constants, icon set
│   ├── permissions.js      # Role + lean-permission resolution (incl. demo role)
│   ├── demoMode.js         # Demo-mode PII scrubber + read-only helpers
│   ├── opsHelpers.js  metricsHelpers.js  playgroupAssignments.js
│   ├── schedulingEngine.js  accrualEngine.js  cashBasisRevenue.js  # pure engines
│   ├── reloadScheduler.js  dashboardCache.js  gingrLive.js         # perf/egress
│   ├── AggregatedCalendar.jsx  InteractiveLineChart.jsx  WeatherHourlyGraph.jsx
│   └── LocationSelector.jsx  AppCrashScreen.jsx  SubscriptionGate.jsx
│
├── hooks/                  # Cross/Lite React data hooks (useGingrData, useDashboardMetrics,
│                           #   useSchedulingData, useEnrichment*, useFacilityPresence, …)
├── migrations/             # Client-side data migration helpers
└── __tests__/              # Vitest suites (66 files, 1000+ tests) + fixtures
```

## `supabase/` — backend

```
supabase/
├── migrations/             # ~218 SQL migrations: schema, RLS, RPCs, realtime publication
│                           #   (the source of truth; wins over older top-level *.sql)
└── functions/              # ~33 Deno Edge Functions, e.g.:
    ├── gingr-sync          # pull Gingr → mirror tables (clients/pets/reservations)
    ├── gingr-boh-poll      # back-of-house presence polling
    ├── gingr-today-notes   # owner/dog notes for checkout
    ├── ops-compute(-ondemand) # compute daily-ops checklists/reports
    ├── compute-scheduling-matrix / compute-rotation-schedule
    ├── ai-assistant / nlp-query        # LLM assistant + plain-language queries
    ├── interview-* / performance-review-signing / docuseal-webhook
    ├── breed-detect(-bulk) / breed-compare
    ├── stripe-checkout / stripe-webhook # billing
    ├── send-otp / send-reminders        # Twilio
    ├── ignite-webhook / ignite-* / inbound-email # lead capture
    ├── weather-daily
    └── _shared             # shared edge-fn utilities
```

See [Backend & Data](Backend-and-Data.md) and [BACKEND.md](../architecture/BACKEND.md)
for the full inventory.

## `api/` — Vercel serverless

```
api/
├── interview-normalize-audio.js   # FFmpeg transcode (too heavy for Deno edge)
└── inbound-email.js               # inbound lead email handoff
```

## `public/` — static assets

```
public/
├── shots/                  # PII-reviewed marketing screenshots used by LandingPage
├── fonts/  vendor/  labor/  rooms/  demos/
├── favicon*  og-image.png  apple-touch-icon.png
└── k9-logo*  k9_mark*.svg  body-check-template.pdf
```

## `scripts/` — Node maintenance & ops

Cron/ops helpers (`audit-cron-jobs`, `reconcile-cron-jobs`, `deploy-risky-functions`,
`rollback-functions`, `report-room-cleaning-drift`, `probe-supabase-auth`),
data importers (`import_enterprise_directory.py`, `seed_inventory.mjs`), the
test‑results generator (`generate-test-results.js`, run as `prebuild`), and the
marketing screenshot capture (`capture-marketing-shots.mjs`).

## `docs/` — engineering docs

```
docs/
├── wiki/                   # THIS wiki (navigable guide)
├── architecture/           # deep dives: EDITIONS, BACKEND, FILE_ORGANIZATION,
│                           #   PAGE_DATA_LOGIC, FLOWCHARTS, app-base/analytics/pos, …
├── agents/                 # agent SOPs (issue tracker, triage labels, domain)
├── operations/  redesign/  refactor/
└── *.md                    # specs, audits, setup guides
```

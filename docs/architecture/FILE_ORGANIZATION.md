# File Organization System

How the source is organized today, the **reorganization that is in flight**, and
the **target structure** every new file should follow.

---

## 1. Principles

1. **Edition roots own their UI.** `kol/` (Base + Analytics), `pos/` (POS),
   `booking/` (public booking), and the marketing/auth files each own their
   feature‑specific code. Editions talk to each other **only through `shared/`** —
   never by importing a sibling edition's internals.
2. **`shared/` is the cross‑edition layer.** The design system
   (`ui.jsx`, `listSurface.jsx`, `theme.js`, `icons.jsx`), pure engines
   (`schedulingEngine.js`, `accrualEngine.js`, `cashBasisRevenue.js`), and
   permission primitives live here. New surfaces **compose** `ui.jsx` +
   `listSurface.jsx` (mandated by `DESIGN.md` §5).
3. **Per‑feature split.** A feature folder separates concerns:
   `pages/` (route entry, thin) → `components/` (UI) → `lib/` (pure logic) →
   `constants/` (static config) → `hooks/` (React data subscriptions).
4. **Pure logic is extracted and tested.** Domain math lives in `*Data.js` / `lib/`
   modules with Vitest coverage; components stay declarative.
5. **No new god files.** Target ceiling for new files is ~500–800 lines; pages are
   thin and delegate to components/lib.

## 2. Naming conventions

| Kind | Convention | Example |
| --- | --- | --- |
| Component / page file | `PascalCase.jsx` | `DashboardPage.jsx`, `BookingCalendar.jsx` |
| Hook | `useThing.js` | `useDashboardMetrics.js` |
| Pure logic / data module | `camelCase.js` | `inventoryDepletion.js`, `trainingData.js` |
| Constants module | `camelCase.js` under `constants/` | `pos/constants/pricing.js` |
| Feature folder | lowercase | `training/`, `scheduling/`, `inventory/` |
| Test | `name.test.js` (or `.ts` for typed logic) | `schedulingEngine.test.js` |

## 3. Current top‑level layout

```
src/
├── main.jsx                # entry + edition routing (Root())
├── supabaseClient.js       # singleton Supabase client
├── AuthProvider.jsx        # auth context
├── authRuntime.js          # auth timeout/failure helpers
├── App.jsx                 # POS edition (god file → src/pos/)
├── useData.js              # POS data layer
├── BookingPage.jsx         # public booking (god file → src/booking/)
├── LandingPage.jsx         # marketing one-pager
├── Login.jsx               # staff login
├── PublicPages.jsx         # /sign + /form public pages
├── SignupPage.jsx          # (unwired) signup
├── tracker-data.js         # dev tracker spec data
├── kol/                    # Base + Analytics (Lite) edition
│   ├── KolApp.jsx          # thin shell / router
│   ├── pages/              # 40+ page components + colocated *.js libs
│   ├── settings/           # settings tabs
│   ├── enterprise/         # multi-location
│   ├── scheduling/         # rotation engine pieces
│   ├── enrichments/        # enrichment feature
│   ├── onboarding/         # Ignite onboarding
│   ├── reports/            # email reports
│   ├── components/         # shared-within-kol components
│   └── *Data.js            # domain logic (trainingData, crmData, …)
├── shared/                 # cross-edition design system + engines (25 files)
├── hooks/                  # Lite/shared React data hooks (20 files)
├── ignite/                 # lead email parser backend
├── migrations/             # (client-side migration helpers)
└── __tests__/              # 63 Vitest files + fixtures
```

## 4. Reorganization in flight (first wave)

The two genuine god files — `App.jsx` (~32k) and `TrainingPage.jsx` (~29k) — plus
several ~3–4k‑line pages are being decomposed by **pure move‑and‑relink**:
self‑contained pieces move into focused modules and are imported back, with the
file's path and public exports unchanged so nothing else needs editing. Every
step is verified by the full test suite (988) + a production build.

| File | Before → After | New modules under | PR |
| --- | --- | --- | --- |
| `App.jsx` (POS) | 32,173 → 30,569 | `src/pos/` (`brand.jsx`, `lib/`, `constants/`, `demo/`) | #91 |
| `TrainingPage.jsx` | 28,826 → 24,329 | `src/kol/pages/training/` (`constants.js`, `helpers.js`, `components/*`) | #92 |
| `BookingPage.jsx` | 3,656 → 3,111 | `src/booking/` (`constants.js`, `lib.js`, `components/*`) | #90 |
| `SchedulingPage.jsx` | 3,830 → 2,136 | `src/kol/pages/scheduling/` | #93 |
| `DashboardPage.jsx` | 3,932 → 1,400 | `src/kol/pages/dashboard/` | #94 |
| `InventoryPage.jsx` | 3,783 → 2,202 | `src/kol/pages/inventory/` | #95 |

Combined, the six god files drop from **76,200 → 63,747 lines** (~12,450 lines
relocated into ~80 focused modules). All six branches merge cleanly together and
stay green (verified via an integration octopus‑merge: 988 tests + build).

These were split by file ownership to keep each change focused — multiple
workstreams on the *same* file would only create merge conflicts.

## 5. Target structure

Conventions from §1–2 applied edition by edition. (Folders marked → are the
destinations the in‑flight PRs and follow‑ups move code into.)

```
src/
├── main.jsx                       # routing only
├── supabaseClient.js
│
├── auth/                          # ← cross-edition auth (from root files)
│   ├── AuthProvider.jsx
│   ├── authRuntime.js
│   ├── Login.jsx
│   └── SignupPage.jsx
│
├── public/                        # ← unauthenticated marketing + forms
│   ├── LandingPage.jsx
│   └── PublicPages.jsx
│
├── shared/                        # cross-edition design system + engines
│   ├── ui.jsx  listSurface.jsx  listSurfaceModel.js  theme.js  icons.jsx
│   ├── permissions.js  opsHelpers.js  metricsHelpers.js
│   ├── schedulingEngine.js  accrualEngine.js  cashBasisRevenue.js
│   ├── reloadScheduler.js  dashboardCache.js  weather.js  calendarGrid.js
│   ├── AggregatedCalendar.jsx  InteractiveLineChart.jsx  WeatherHourlyGraph.jsx
│   ├── LocationSelector.jsx  AppCrashScreen.jsx  SubscriptionGate.jsx
│   └── bookingTheme.js
│
├── hooks/                         # cross-edition hooks only
│
├── kol/                           # Base + Analytics edition
│   ├── KolApp.jsx                 # thin shell: nav + route switch
│   ├── hooks/                     # ← Lite data hooks (from src/hooks)
│   ├── training/                  # pages/ components/ lib/ constants/
│   ├── scheduling/                # (page) pages/ components/ lib/
│   ├── dashboard/                 # pages/ components/
│   ├── inventory/                 # pages/ components/ lib/
│   ├── clients/                   # ClientsPage, ClientDetailPage, FunnelPage, …
│   ├── operations/                # OperationsHub, DailyOps, EOD, RolePage, …
│   ├── checkout/                  # CheckoutTV, CheckoutNotes (+ lib)
│   ├── crm/                       # CrmPage (+ crmData, crmFormFields)
│   ├── marketing/                 # Grassroots, MarketingDirectory (+ data)
│   ├── enrichments/  enterprise/  settings/  onboarding/  reports/
│   └── pages/                     # TEMP: pages not yet clustered
│
├── pos/                           # POS edition (from App.jsx)
│   ├── App.jsx                    # thin shell
│   ├── hooks/useData.js
│   ├── constants/  lib/  demo/  components/  pages/
│   └── brand.jsx
│
├── booking/                       # public booking (from BookingPage.jsx)
│   ├── BookingPage.jsx            # thin orchestrator
│   ├── constants.js  lib.js
│   └── components/                # BookingCalendar, BkInput, BkBreedSearch, …
│
├── ignite/                        # lead parser backend
└── __tests__/                     # mirror feature paths over time
```

### Edition → folder mapping

| Edition | URL signal | Root folder | Shared deps |
| --- | --- | --- | --- |
| Base | `/{loc}/{page}` | `src/kol/` | `shared/`, `auth/` |
| Analytics | + `?mode=analytics` | `src/kol/` (branch in `KolApp`) | same |
| POS | `/pos/{loc}/{page}` | `src/pos/` | `shared/theme.js`, `auth/` |
| Public booking | `/book/{slug}` | `src/booking/` | `shared/bookingTheme.js` |
| Marketing/forms | `/`, `/welcome`, `/sign`, `/form` | `src/public/` | minimal |

## 6. Migration order (recommended)

1. **Converge `App.jsx` → `shared/theme.js` + `shared/ui.jsx`** (kills the largest
   duplication; makes POS use the shared layer like KOL does).
2. **Finish `src/pos/`** — split `App.jsx` by vertical (clients, reservations,
   enterprise, settings, payments).
3. **Finish `src/booking/`** — smallest god file, clearest win (started in #90).
4. **Feature‑folder the Lite god pages** — `training/`, `scheduling/`,
   `dashboard/`, `inventory/` (started in #92–#95); move colocated `*.js` libs
   into each feature's `lib/`.
5. **Cluster remaining `kol/pages/`** into `clients/`, `operations/`, `crm/`,
   `marketing/`, `checkout/`, `calendar/`.
6. **Relocate hooks** — Lite hooks → `kol/hooks/`, POS `useData` → `pos/hooks/`;
   move auth/public root files into `auth/` and `public/`.

Each step stays behavior‑preserving and is gated on `vitest run` + `vite build`.

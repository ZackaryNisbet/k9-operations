# Decomposing the god files (`App.jsx`, `BookingPage.jsx`)

**Status:** Plan. Execution proceeds in small, independently-reviewable PRs.
**Goal:** Turn the two largest files into a set of focused modules **without changing
behavior**, so the codebase is presentable and maintainable.

---

## The problem, in numbers

| File | Lines | What it is |
|------|-------|------------|
| `src/App.jsx` | ~32,200 | The legacy **POS** app (served at `/pos/*`). A single module holding routing, formatters, pricing, demo data, duplicated UI primitives, ~30 page components, charts, and the AI assistant. |
| `src/BookingPage.jsx` | ~3,400 | The **customer booking** site (`/book/:slug`). One default-export component with several large inline `render*` functions. |
| `src/useData.js` | ~1,950 | The data layer (addressed separately; see the egress work). |

`App.jsx` is the headline liability: a 2.3 MB source file is unreviewable, unsearchable
in practice, and the first thing that signals "this code is a disaster."

> **Context that lowers the stakes:** `App.jsx` (`/pos/*`) is the *legacy* surface. Active
> development happens in `src/kol/` (the Lite/KOL app). Much of `App.jsx` is **duplicated**
> in `src/kol/` and `src/shared/`. So a large part of "decomposition" is really
> **de-duplication**: delete the App.jsx copy and import the shared one — once we confirm
> the two copies haven't diverged.

---

## Non-negotiable constraints

1. **Behavior-preserving.** Each step is a pure move/dedupe. No feature, style, or data
   change rides along.
2. **The POS has no behavioral test suite.** So every step must be verifiable by the two
   gates we *do* have — `npx vitest run` (998 tests) and `npx vite build` — plus a manual
   smoke pass of the affected POS screen. Steps are ordered so the build alone catches the
   common failure (an unresolved reference) before anything ships.
3. **Small PRs.** One concern per PR, each revertable in isolation. No "big bang" rewrite.
4. **No destructive deletes without sign-off.** Dead code that represents *content* (e.g.
   a curated knowledge base) is flagged for a decision, not silently removed.

---

## The safe extraction process (repeat per module)

1. Pick a target from the order below.
2. Read the block; list every symbol it **references** and every symbol that **references
   it** (grep). A block is "ready" when its outward references are all either (a) already
   importable from `shared/`, or (b) moving with it.
3. Create the new file under the right home (`src/pos/...`), `export` the symbol(s).
4. Replace the block in `App.jsx` with an `import`.
5. `npx vite build` (catches unresolved refs) → `npx vitest run` (catches logic regressions)
   → manual smoke of the affected screen.
6. Commit. One module (or one tightly-related cluster) per commit.

A target directory structure for the POS, mirroring the existing `src/kol/` layout:

```
src/pos/
├── constants/      # C, PERMISSION_CATEGORIES, DEFAULT_ROLES, VACCINES, DEF_PRICING, checklist templates
├── lib/            # formatters (fmtDate*, gid, todayStr…), pricing (calcReservationPricing), eval scoring
├── demo/           # generateDemoData, DEMO, NEW_LOCATION_DEFAULTS
├── charts/         # SVGLineChart, SVGBarChart, SVGDonutChart, SVGHeatmap, SVGFunnel, KPICard, DataTable
├── modals/         # BoardingPreviewModal, PaymentFormModal, NewOverlay…
├── settings/       # the settings tabs (mirror src/kol/settings/)
└── pages/          # DashboardPage, ClientsPage, ClientDetailPage, ReportsPage, …
```

---

## Recommended order (low risk / high ROI first)

Ordered so the earliest steps are the safest and the build is the safety net.

### Phase 0 — Decisions & dead code (no risk)
- **`OPS_MANUAL_KB` (~170 lines, L26839).** Confirmed **dead**: defined once, referenced
  nowhere in `src/`, not exported. It is a curated front-desk knowledge base (hours, dress
  code, collar system…). **Decision needed:** wire it into the AI assistant (it looks
  intended for exactly that) **or** remove it. Do not delete blindly — it is real content.
- Sweep for other unreferenced top-level symbols with the same grep technique.

### Phase 1 — Pure data & constants (very low risk)
Leaf data with no logic. ES-module import hoisting makes these safe; the build verifies refs.
- `K9_LOGO_PNG` + `K9Logo`/`K9LogoMini` → `src/pos/constants/brand.js`
- `VACCINES`, `PERMISSION_CATEGORIES`, `DEFAULT_ROLES`, `DEF_PRICING`, checklist templates,
  dropdown defaults (the L934–1791 config block) → `src/pos/constants/`
- **Dedupe check:** several of these mirror `src/shared/theme.js`. Where identical, import
  from `shared` instead of re-housing.

### Phase 2 — Pure functions (low risk; unit-testable)
Self-contained helpers — and this is where we *add* tests as we go, since they become
importable:
- Formatters (`gid`, `fmtDate*`, `fmtTime`, `todayStr`, `addDays`) → `src/pos/lib/format.js`
- Eval scoring (`EVAL_SECTIONS`, `getEvalResult`) → `src/pos/lib/evaluation.js`
- Pricing (`getAddOnPrices`, `calcReservationPricing`, ~215 lines) → `src/pos/lib/pricing.js`
- `generateDemoData` (~555 lines) → `src/pos/demo/` (depends on the Phase 1 constants)

### Phase 3 — Shared-UI de-duplication (medium risk; biggest cleanup)
`App.jsx` re-declares primitives that already exist in `src/shared/ui.jsx`
(`Modal`, `Btn`, `Inp`, `CustomSelect`, `Card`, `Badge`, calendar pickers, …). For each:
diff the App.jsx copy against the shared one; if equivalent, delete the local copy and import
from `shared/ui.jsx`; if diverged, reconcile first. This both shrinks `App.jsx` and removes
a whole class of "two sources of truth" bugs (the portaled-modal backdrop bug in DESIGN.md
is exactly this failure mode).

### Phase 4 — Charts (medium risk)
`SVGLineChart`, `SVGBarChart`, `SVGDonutChart`, `SVGHeatmap`, `SVGFunnel`, `KPICard`,
`DataTable`, `InteractiveLineChart` (L27630–28725) → `src/pos/charts/`. Some overlap
`src/shared/InteractiveLineChart.jsx`; dedupe where possible.

### Phase 5 — Page components & modals (highest effort)
The large screens, biggest first, each its own PR after its dependencies (constants, lib,
UI) have moved so the extraction is mostly mechanical:
- `BoardingPreviewModal` (~2,210 lines) → `src/pos/modals/`
- `DashboardPage` (~1,877), `NewReservationPage` (~1,913), `ReportsPage` (~1,638),
  `SettingsPage` (~1,494), `ClientsPage` (~1,371), `LodgingCalendarPage` (~1,096),
  `ClientDetailPage` (~1,065) → `src/pos/pages/`
- Settings tabs (L18547–24412) → `src/pos/settings/`
- **Dedupe vs. `src/kol/pages/`:** many of these have Lite twins. The end state is one
  implementation; reconcile POS and Lite per component rather than maintaining both.

### End state
`App.jsx` becomes a thin shell: imports + the `App()` root (data loading, location state,
`renderPage()`, layout) — a few hundred lines, like `src/kol/KolApp.jsx` already is.

---

## `BookingPage.jsx` (smaller, same playbook)

1. `GLOBAL_CSS` + theme → `src/shared/bookingTheme.js` (already started).
2. `BookingCalendar`, `BkBreedSearch`, `BkInput`/`BkSelect`, reveal helpers → `src/booking/components/`.
3. Each inline `render*` → its own component: `SplashPage`, `AvailabilityPage`,
   `RegistrationPage`, `ConfirmationPage`, `CustomerPortal` (the account portal alone is ~800 lines).
4. `BookingPage()` becomes a router over those pages.

---

## Why plan-first (and not a one-shot rewrite)

A 32k-line file with no behavioral tests is precisely where "just refactor it" goes wrong:
one missed reference or a diverged duplicate becomes a production POS regression that no test
catches. Decomposing in small, build-verified, individually-revertable steps is slower per
PR but is the only approach that is safe *and* reviewable — which is the whole point of making
this codebase presentable. Execution starts at Phase 0/1 (the safe end) on request.

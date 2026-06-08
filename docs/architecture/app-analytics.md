# Edition: K9 Operations + Analytics

The Analytics edition is **the base (Lite/KOL) app with one flag flipped** — not
a separate application, build, or route prefix. It surfaces the
reporting/intelligence layer (dashboards, customer lifecycle, ops overview,
financials) on top of the same operational app.

> See [app-base.md](app-base.md) for the underlying app and [EDITIONS.md](EDITIONS.md)
> for how all three editions are selected.

---

## How it's enabled

A single URL flag, read once in [`src/kol/KolApp.jsx`](../../src/kol/KolApp.jsx):

```js
const IS_ANALYTICS_MODE =
  new URLSearchParams(window.location.search).get("mode") === "analytics";
```

Any Lite URL with `?mode=analytics` runs the Analytics edition, e.g.:

- `/cherry-hill/dashboard?mode=analytics`
- `/cherry-hill/home?mode=analytics`

The location switcher exposes a demo entry **"K9 Operations + Analytics"** →
`/cherry-hill/dashboard?mode=analytics` (visible to owner / developer /
enterprise‑admin).

## What the flag changes

**1. Navigation.** When the flag is on, nav selection short‑circuits the
role‑based logic and returns the widest set, `ANALYTICS_NAV_ITEMS`:

> Home · CRM · **Dashboard** · **Customer Lifecycle** · **Ops Overview** ·
> Scheduling · Enrichments · Labor · Incidents · Resources · Marketing ·
> Resort Upkeep · Inventory · Cash Tips · Photos · TV · Settings

Compared with the base owner nav (`LEAN_NAV_ITEMS`), Analytics adds Dashboard,
Customer Lifecycle, Ops Overview, Scheduling, Enrichments, Incidents, Resources,
Resort Upkeep, Cash Tips, Photos and TV directly into the sidebar (rather than
behind Home‑page launcher cards).

**2. Feature visibility inside pages.** Pages receive `analyticsMode` and widen
what they render. The clearest example is `DashboardPage`:

```js
const analyticsMode = IS_ANALYTICS_MODE;
const hasFinancial = analyticsMode || hasLeanPermission(profile, "Financial Reporting");
const hasOpsHub   = analyticsMode || hasLeanPermission(profile, "Operations Hub");
// → showRevenue / showFunnel / showOps … passed into <DashboardPage>
```

`HomePage` and `SettingsPage` also receive `analyticsMode`.

## Analytics surfaces (the intelligence layer)

| Surface | Backing data |
| --- | --- |
| **Dashboard** (`DashboardPage`) | server‑precomputed `dashboard_metrics_daily` via `useDashboardMetrics` + `snapshot_live` RPC; cached in IndexedDB (`dashboardCache.js`) |
| **Customer Lifecycle** | lifecycle segmentation from Gingr history + CRM data |
| **Ops Overview** | `ops-platform-health` edge function + `workflow_progress_snapshot` |
| **Revenue / EOD / Cash Tips** | accrual + cash‑basis engines (`accrualEngine.js`, `cashBasisRevenue.js`), `EODPage`, `CashTipsPage` |
| **Plain‑language queries** | `nlp-query` edge function (LLM) |

## Why a flag instead of a separate edition

- **No code fork.** Analytics reuses every base page and hook; the only
  difference is *how much is shown*.
- **Lockstep parity.** A manager's operational view and an owner's analytics view
  never drift, because they are literally the same components.
- **Cheap to gate.** Whether a section is visible is `analyticsMode ||
  hasPermission(...)`, so the same screens also light up for permissioned users
  without the flag.

## Architectural note

Because Analytics is a flag, its "architecture" *is* the base architecture
([app-base.md](app-base.md)) plus the visibility branches above. The dashboard's
heavy lifting is deliberately **server‑side** (precomputed metrics tables +
edge functions) to keep client egress and compute low — see
[BACKEND.md](BACKEND.md) and the egress work (PR #85).

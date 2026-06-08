# Edition: K9 Operations POS (legacy)

The original point‑of‑sale application, served under `/pos/*`. It is the
**legacy** surface: new feature work happens in the Base/Analytics (Lite) app,
and POS is the larger of the two god files currently being decomposed.

> See [EDITIONS.md](EDITIONS.md) for selection vs. the other editions.

---

## Entry & selection

- **Mounted by:** `Root()` in `src/main.jsx` when `path.startsWith('/pos')`
  (`return <App />`).
- **Component:** `App` (default export of [`src/App.jsx`](../../src/App.jsx)) — a
  single monolithic module containing routing, theme/constants, a pricing engine,
  permissions, demo data, inline UI primitives, and every POS page.

## Internal routing

- All routes live under `POS_BASE = "/pos"`.
- Helpers `parseUrl(pathname)` / `buildUrl(locSlug, page, params)` map between
  URLs and page IDs via `PAGE_SLUGS`. Examples:

| URL | Page |
| --- | --- |
| `/pos/cherry-hill/dashboard` | dashboard |
| `/pos/cherry-hill/lodging` | reservations (Lodging Calendar) |
| `/pos/cherry-hill/lifecycle` | customer lifecycle |
| `/pos/cherry-hill/client/{phone}` | client detail |
| `/pos/cherry-hill/ops/opening` | daily ops (opening checklist) |
| `/pos/enterprise/locations` | enterprise location management |

## Navigation & permissions

- `locationNavSections`: Dashboard, Lodging Calendar, Online Bookings, Customer
  Lifecycle, Messages, Operations, Learning (LMS), AI Command, Settings, Reports.
- `enterpriseNavSections`: Location Management, Operations Oversight, Package
  Management, User Management, Management.
- Gated by `NAV_PERM_MAP` + the POS `hasPermission(profile, data, key)` (e.g.
  `view_clients`, `view_calendar`). Enterprise pages require owner /
  enterprise‑admin.

## Notable POS‑only capabilities

Full reservation CRUD, evaluations, payments, messages, an **AI assistant**
(`ai-assistant` edge function, now backed by the Operations Manual KB — PR #89),
an in‑app LMS, and online‑bookings administration. Several of these have no Lite
equivalent yet, which is why POS is kept alive.

## Data access

- The central hook is [`src/useData.js`](../../src/useData.js) — a ~1.9k‑line
  normalized V2‑schema layer that loads ~55 tables and performs entity CRUD.
- Historically this loaded the whole location dataset on any of ~40 table changes
  plus a 30s poll; the egress work (PR #85) makes that refetch
  visibility‑aware and coalesced via `src/shared/reloadScheduler.js`.

## Known issues / cleanup targets

- **Duplication:** `App.jsx` re‑implements primitives that already exist in
  `src/shared/ui.jsx` and constants that exist in `src/shared/theme.js` (it
  currently imports almost nothing from `shared/`). Converging on `shared/` is the
  single biggest cleanup.
- **Size:** ~32k lines. The first decomposition wave (PR #91) extracts
  self‑contained data/constants/helpers to `src/pos/` without behavior change
  (32,173 → 30,569 lines); the bigger components (e.g. `BoardingPreviewModal`
  ~2.2k lines) are sequenced next.
- **Naming drift:** the sidebar label reads "Lite · KOL" inside the POS shell.

## Strategic note

The end state is one of:
1. **Decompose POS** onto `shared/` + page modules (mirroring how `KolApp`
   already works), or
2. **Sunset POS** once Lite covers its remaining unique features (reservations,
   payments, LMS, AI command).

Either way, the decomposition in `src/pos/` (see
[FILE_ORGANIZATION.md](FILE_ORGANIZATION.md)) makes the code reviewable and the
shared‑vs‑duplicated boundary explicit, which is a prerequisite for both paths.

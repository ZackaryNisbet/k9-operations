# Incidents — Redesign Proposal

**Status:** Proposed (discovery + first slice). Awaiting owner confirmation on the open decisions in §7.
**Unit:** X1 (`fanout/2026-05-30/incidents-redesign`), part of the 2026-05-30 fan-out batch.
**Owner prompt:** "I'm not happy with the current state of incidents… it needs work." This is a discovery + safe-first-slice unit, not a blind rebuild.
**Surfaces:** `src/kol/pages/ClientManagementPage.jsx`, `src/kol/clientManagementData.js`, the `client_incident_*` tables + `incident-documents` bucket + `incident_active_dog_counts` RPC.
**Design authority:** `DESIGN.md` (the dense-table standard, §"Data tables & list surfaces"). No `PRODUCT.md` exists in the repo today (noted as a gap; this doc leans on `DESIGN.md` + the fan-out brief). Shaped via `/impeccable shape` (product register, Restrained color strategy). Image-probe step skipped: the harness has no native image generation.

---

## 0. Update — post-review iteration (2026-05-30)

Owner review of the first preview drove three changes, now in this PR:

1. **The rate denominator was wrong (unique dogs) and is fixed to dog VOLUME.** The old `incident_active_dog_counts` RPC counted unique dogs (≈628/month for Adair Forsythe), which reads as absurdly low (the resort sees that in a week). The rate now divides by **dog volume**, the per-day reservation counts that Scheduling already treats as the count authority (`gingr_reservation_widget_daily.total_reservation_volume`), summed over the window by a new `incident_rate_inputs` RPC (`supabase/migrations/20260530130000_incident_rate_inputs_rpc.sql`). For the same month that read 628, volume is **3,143**. **Unique dogs** is retained as a secondary column (both are shown). Windows where widget coverage doesn't reach the window start are flagged "partial" (the widget table currently starts 2026-04-22, so QTD/YTD are partial).
2. **Incidents now opens to a Summary, not a metrics hero.** The gradient "Incident Rate" hero and the "rate /1k vs %" math card are gone. The landing view is a clean period table: MTD / QTD / YTD (plus TTM / Last Full Year / All Time) with `Incidents | Dog Volume | Unique Dogs | Rate /1k`. A single rate representation (per 1,000), no percentage.
3. **Two views + filters in the search bar.** A `Summary | Log` tab bar. The **Log** view is the data-entry surface (the dense incident table), and its filter pills now live **inside** the search bar (the app-standard ClientsPage/Grassroots layout), not in a separate row below it. The period selector no longer doubles as a list filter.

Everything below is the original discovery write-up; §4.1 (inverted hierarchy) and §4.5/§4.6 (metric confusion) are what this iteration resolves.

---

## 1. TL;DR

Incidents works, but it is upside down. The page leads with a large gradient "Incident Rate" hero plus a second full analytics table, so the operational incident log (the thing staff actually open the page to use) sits two screens down. That directly contradicts the `DESIGN.md` list standard ("plain title, no hero metrics, no big banners"). Meanwhile a rich data model is barely used: the case table has columns for severity, narrative, time, area, a second subject, and client/owner contact, plus an `under_review` status and a whole `client_incident_activity` audit table, and almost none of it is reachable from the UI. There is also a meaningful amount of dead code (an entire 350-line form library and a second, divergent metric system) kept alive only by its own unit tests.

The redesign: put the **incident log first**, demote analytics to a compact strip (or a secondary tab), make **follow-ups a first-class workflow** (overdue / due-today badges, a quick filter), add a **per-case detail/edit view** that surfaces the fields the schema already has, and start **writing the activity timeline** that the schema already supports. Adopt the shared dense-table standard (the `DenseTable` that foundation unit F1 is extracting from `DenseGrassrootsTable`).

This PR ships only the **first safe slice**: first-class follow-ups (additive migration + workflow UI). Everything else is proposed here for sequencing behind F1.

---

## 2. How Incidents works today

**Where it lives.** Nav item "Incidents" (`id: client-management`) under the alt-app "Customer Lifecycle" permission surface; mounted in `src/kol/KolApp.jsx` (nav at lines 334 / 365, permission at 427, render at 1366–1367, slug → `incidents` at 133). Page component: `ClientManagementPage.jsx`.

**Data model** (`20260414214824_client_management_red_binder_incidents.sql`):
- `client_incident_cases` — the one table the UI actually uses. Columns: `case_type` (6 types), `status` (`open` / `under_review` / `closed`), `severity` (`standard` / `elevated` / `critical`), `incident_date`, `incident_time`, `incident_area`, `subject_name`, `secondary_subject_name`, `client_name`, `owner_phone`, `summary`, `narrative`, `metadata jsonb`, full `*_by_user_id`/`*_by_name` audit columns, `closed_at`, timestamps.
- `client_incident_documents` — per-case structured form payloads (`form_payload jsonb`, `form_code`, draft/final). **Zero references in `src/`.**
- `client_incident_activity` — an append-only audit/timeline (`activity_type`: created / updated / status_change / form_added / note). **Zero references in `src/`.**
- RLS is management-scoped via `labor_has_management_access(location_id)` on all three.

**Storage** (`20260529120000_incident_documents_storage_bucket.sql`): a private `incident-documents` bucket (25 MB, pdf/png/jpeg/webp/heic), path `<location_id>/<case_id>/<file>`. Its own header comment records the pivot: *"The Incidents module was reworked from a form-filling tool into a simple upload-the-signed-PDF + log-the-entry table. Uploaded documents live in a private bucket and are referenced from `client_incident_cases.metadata.document`."*

**Analytics RPC** (`20260529130000_incident_active_dog_counts_rpc.sql`): `incident_active_dog_counts(location_id, as_of)` returns the population at risk (unique non-tour/non-grooming/non-cancelled dogs with a stay overlapping each standard window: MTD / QTD / YTD / TTM / Last Full Year / All Time), computed server-side because the browser only holds a recent slice of reservations.

**The page** renders, top to bottom: a title + "New Incident" button; a period-selector pill row; a large gradient **Incident Rate hero** with a "how this is calculated" breakdown (lines ~374–425); a second **"all periods at a glance"** analytics table (~427–455); a search + type-filter-pill row (~457–498); the **incident log table** (Type / Date / Subject / Status / Document / Logged / delete, ~500–585); and a **New Incident modal** (type / date / subject / note / PDF upload, ~587–677). Create writes `metadata: { source: "incident_upload" }`, uploads the file, then stores the document descriptor at `metadata.document`.

---

## 3. What works (keep it)

- **The PDF-upload + log flow is the right altitude.** Quick-log a signed paper form and attach the scan. Don't regress this back into a 350-field digital form.
- **The active-dogs RPC is correct and valuable.** Server-side denominators over full reservation history are the right call, and the rate-by-period concept (incidents ÷ population at risk) is a genuinely good operational metric.
- **The page already speaks the brand dialect**: colored type/status pills, the Grassroots-style search + filter-pill row, forest-green primary. The bones match `DESIGN.md`; the hierarchy is what's wrong.
- **RLS + storage pathing are sound** (location-scoped, management-gated, signed URLs with a 300s TTL).

---

## 4. What's rough (the findings)

### 4.1 The information hierarchy is inverted (biggest issue)
`DESIGN.md` is explicit: a list surface starts with "a plain title in the top-left. **No hero metrics, no big banners, no side-stripes.**" Incidents leads with exactly that: a gradient hero metric (a pattern the `impeccable` skill calls out as "the hero-metric template" SaaS cliché) and then a *second* analytics table, pushing the actual log below the fold. Staff open this page to log and triage incidents, not to read a dashboard. Analytics should be a compact strip or a secondary tab, not the headline.

### 4.2 Rich schema, thin UI (most of the model is unreachable)
The case table captures far more than the UI exposes:
- **`severity`** is auto-derived from type at create (`serious_animal_event` → critical, `employee_injury` → elevated, else standard; lines ~227–231) and then never shown or editable. Severity should be visible and adjustable; it is the natural triage axis.
- **`status = under_review`** is unreachable: the only control is a pill that toggles `open` ↔ `closed` (`toggleStatus`, ~305–322). A valid, colored state can never be set.
- **`narrative`, `incident_time`, `incident_area`, `secondary_subject_name`, `client_name`, `owner_phone`** are never captured or displayed. There is no detail view and no edit at all: you cannot fix a typo in the subject, date, or type after creation. The only row actions are status-toggle, view-PDF, and delete.

### 4.3 Follow-ups don't exist as a concept
There is no due date, no "needs follow-up" state, no overdue signal, anywhere. Incidents that need a vet recheck, an owner callback, or a corrective action have nowhere to record it, so they fall through the cracks. `DESIGN.md` even specifies "Overdue/Today badges stack under the date" for exactly this. **This is the gap the first slice closes.**

### 4.4 The activity timeline table is orphaned
`client_incident_activity` exists with a sensible `activity_type` vocabulary, but nothing writes to or reads from it. There is no audit trail of who changed a status or added a note, despite the schema being ready for one.

### 4.5 Dead / divergent code (kept alive only by tests)
None of the following is referenced by any component (confirmed: the only non-definition references are in `src/__tests__/clientManagementData.test.js`):
- **`RED_BINDER_FORM_LIBRARY`** — a ~350-line structured form library (6 forms) from the abandoned form-filling era.
- **`buildClientIncidentMetrics` + `computeDogDaysLast30`** — a *second* metric system that computes a different headline number (incidents per 100 **dog-days**), inconsistent with the per-1,000-**active-dogs** rate the page actually shows.
- **`buildIncidentRateForPeriod` + `countActiveDogsInRange`** — a client-side reimplementation of the period rate that uses the browser's partial reservation slice (the exact thing the server RPC was added to fix), so it is both redundant and wrong for historical windows.
- **`INCIDENT_CATEGORY_OPTIONS` / `getIncidentCategoryLabel`** — a defined incident-category taxonomy never surfaced in the UI (the old metrics keyed off `metadata.incident_category`, which the current create flow never sets).

Because the tests pin this code, deleting it is a deliberate refactor (remove code **and** its tests together), not a "safe" change. It is called out here as planned cleanup, not done in the first slice.

### 4.6 Data buried in `metadata` jsonb
The uploaded document descriptor lives at `metadata.document` (bucket/path/file_name/size/content_type/uploaded_at). jsonb is fine for the opaque descriptor, but anything we want to **filter, sort, index, or flag** (follow-up dates, incident category) must be a real column. The first slice promotes follow-ups out of jsonb; the redesign should do the same for category.

### 4.7 The period selector does double duty (subtle)
The period pills set both the analytics window **and** filter the log to that window. Selecting "MTD" silently hides every incident outside this month. That conflates an analytics control with a list filter; `DESIGN.md` wants pills to be quick-filters and a clear separator before view/mode switches.

---

## 5. Redesign proposal (the `/impeccable shape` brief)

**Feature summary.** A calm, dense incident register for facility managers: log an incident in seconds (optionally attach the signed PDF), see at a glance what is open / severe / overdue for follow-up, open any case for the full record, and keep an honest rate metric in view without it dominating. Product register, Restrained color strategy (tinted neutrals + forest-green primary; red/amber reserved for severity and overdue, never decoration).

**Scene sentence (theme).** A shift manager standing at the front desk in bright daylight, phone in one hand, logging a dog-fight while the lobby is busy, needs the open and overdue items to jump out and everything else to stay quiet. → **Light theme, high density, urgent states earn the only saturated color.**

**Anchor references.** Linear's issue list (dense rows, status pills, keyboard-fast), a hospital triage whiteboard (severity-first scanning), an aviation incident logbook (append-only, auditable, sober).

**Primary user action.** Triage the log: scan open + overdue, open one, act. Logging is the second action; analytics is a glance, not a task.

### 5.1 Layout (top to bottom)
1. **Plain title** "Incidents" + primary "New Incident" (per the standard; drop the gradient hero).
2. **Compact metric strip** (one line, not a hero): selected-period incident rate `/1k`, open count, and a needs-follow-up count, each a small stat with the period as an inline control. Full math + the all-periods breakdown move behind a small "Rate detail" disclosure or an **Analytics** sub-tab. Keeps the good metric, removes the banner.
3. **Search + filters row** (the standard): search input, then status / severity / type quick-filter pills, a vertical separator, then the secondary toggles ("Needs follow-up", "Past/closed"). Decouple the analytics window from list filtering.
4. **One-line explainer** (faint brand-tinted strip) describing the current view.
5. **Dense table** via the shared `DenseTable` (F1 extraction of `DenseGrassrootsTable`): identity/subject in primary, **severity + status pills**, compact date with the **follow-up badge stacked under it**, document affordance, right-aligned icon actions. ~6px row padding, sortable headers.
6. **Inline expansion** (not a modal) for the per-case detail: the full record (narrative, time, area, second subject, client/owner contact), the attached document, the **activity timeline**, and inline edit. Opens edge-to-edge beneath the row with a 3px primary left border, per the standard.

### 5.2 Key states
Default (triage), empty (teach: "Log your first incident"), loading (skeleton rows, not a spinner), error (load failure toast + retry), row-expanded (detail/edit), follow-up overdue (red) / due-today (amber) / upcoming (neutral) / done (muted), severity critical/elevated/standard, status open/under-review/closed.

### 5.3 Interaction model
Click a row to expand inline; edit fields in place; status and severity are click-to-cycle pills (status becomes a 3-way that can reach `under_review`); the follow-up badge is click-to-complete; every mutation appends a `client_incident_activity` row so the timeline builds itself. Logging stays a fast modal (a modal is justified here: it is a focused create, not a detail view).

### 5.4 Recommended `impeccable` references for implementation
`interaction-design.md` (inline edit, click-to-cycle pills, the create flow), `spatial-design.md` (relocating analytics without losing it), `motion-design.md` (restrained expand/collapse).

---

## 6. Phased roadmap

| Slice | What | Risk | Depends on |
|------|------|------|------------|
| **1 — First-class follow-ups (this PR)** | Additive migration (`follow_up_*` columns + partial index, backfill from metadata), follow-up capture in the create modal, overdue/due-today badge under the date, "Needs follow-up" filter, click-to-complete. Pure helpers + tests. | Low, additive, no F1 dep | — |
| 2 — Invert the hierarchy | Demote the hero to a compact strip / Analytics sub-tab; lead with the log; decouple period window from list filter. | Med (UI) | F1 (`DenseTable`, page chrome) |
| 3 — Per-case detail + edit | Inline-expansion detail surfacing narrative/time/area/2nd subject/contact; full edit; severity visible + editable; status 3-way (reaches `under_review`). | Med | F1 |
| 4 — Activity timeline | Write `client_incident_activity` on every mutation; render the timeline in the detail panel. | Low–med | Slice 3 |
| 5 — Category first-class + dead-code cleanup | Promote `incident_category` to a column + filter; remove `RED_BINDER_FORM_LIBRARY` and the divergent metric functions **with their tests**; consolidate on the RPC-backed rate. | Med (touches tested code; needs owner sign-off on dropping the form library) | — |

Slices 2–4 should branch from F1 once it merges (`--base-branch fanout/2026-05-30/shared-ui-foundation`) so they consume the shared `DenseTable` instead of re-styling.

---

## 7. Open product decisions (assumptions made, please confirm)

These were front-loaded; the first slice proceeds on the documented assumption and nothing here blocks it.

1. **Keep upload-only, or bring back light structured capture?** *Assumption:* keep PDF-upload + a few first-class fields (no return to the 350-field forms). The `RED_BINDER_FORM_LIBRARY` is slated for removal in slice 5 unless you want digital forms back.
2. **Is the rate metric a headline or a glance?** *Assumption:* a glance. Demote it to a strip / Analytics tab so the log leads. Confirm you're happy losing the big hero number from the top.
3. **Who can manage incidents?** Currently `Customer Lifecycle` permission. *Assumption:* unchanged. Follow-ups inherit the same gate.
4. **Follow-up model.** *Assumption:* a single dated, completable follow-up per case (date + note + done), sufficient for vet-recheck / owner-callback. If incidents routinely need multiple tracked actions, slice 4 can promote it to a `client_incident_activity`-backed task list.
5. **Nav placement / "Incidents" vs "Customer Lifecycle".** Out of scope here (owned by the F2 nav unit); flagged only so it isn't lost.

---

## 8. First slice shipped in this PR

**Goal:** make follow-ups real, safely, with no dependency on F1 and no risk to existing data.

**Migration** `supabase/migrations/20260530120000_incident_follow_up_first_class.sql` (additive, non-destructive):
- Adds nullable `follow_up_at date`, `follow_up_note text`, `follow_up_completed_at timestamptz`, `follow_up_completed_by_user_id uuid`, `follow_up_completed_by_name text`.
- Backfills `follow_up_at` from `metadata->>'follow_up_at'` / `metadata->>'follow_up_date'` if present, **without** removing the metadata.
- Adds a partial index on `(location_id, follow_up_at) WHERE follow_up_at IS NOT NULL AND follow_up_completed_at IS NULL` for the open-follow-ups query.
- Inherits the table's existing RLS + grants; no policy changes. No column is dropped or rewritten.

**Data layer** (`clientManagementData.js`, pure + unit-tested):
- `getIncidentFollowUpState(caseRow, asOf)` → `{ has, tone, due, dueKey, completed, overdue, dueToday, upcoming }`. Date-only, local-noon comparison so time-of-day and DST never flip a day. `tone` ∈ `done | overdue | today | upcoming`.
- `countOpenFollowUps(cases, asOf)` → count of incomplete follow-ups due today or earlier (the actionable set).

**UI** (`ClientManagementPage.jsx`, using existing shared primitives, no F1 dependency):
- New Incident modal: optional **Follow-up Date** + **Follow-up Note** (note gated on a date). Written to the first-class columns, not metadata.
- Table: a **follow-up badge stacked under the incident date** (per `DESIGN.md`): red "Overdue", amber "Due today", neutral "Due {date}", muted "Followed up". Click (for managers) to mark done / reopen.
- Filter row: a vertical separator + a **"Needs follow-up N"** toggle (counts overdue + due-today), shown when there's anything to act on.
- `toggleFollowUp` mutation records `follow_up_completed_at` + who completed it.

**Tests:** 4 new cases for the follow-up helpers; full suite green (54 files / 744 tests). Production build clean.

**Deliberately *not* in this slice:** the hierarchy inversion, the detail/edit view, the activity timeline, and the dead-code removal. Those are sequenced in §6 (most behind F1) so this PR stays small, safe, and reviewable.

---

## 9. Appendix — file reference map

| Concern | Location |
|---|---|
| Page component | `src/kol/pages/ClientManagementPage.jsx` |
| Data + helpers | `src/kol/clientManagementData.js` |
| Cases/documents/activity tables | `supabase/migrations/20260414214824_client_management_red_binder_incidents.sql` |
| Documents bucket (+ pivot note) | `supabase/migrations/20260529120000_incident_documents_storage_bucket.sql` |
| Active-dog denominators RPC | `supabase/migrations/20260529130000_incident_active_dog_counts_rpc.sql` |
| Follow-up first-class (this PR) | `supabase/migrations/20260530120000_incident_follow_up_first_class.sql` |
| Nav / routing / permission | `src/kol/KolApp.jsx` (334, 365, 427, 1366–1367, 133) |
| Tests | `src/__tests__/clientManagementData.test.js` |
| Dense-table standard | `DESIGN.md` §"Data tables & list surfaces"; reference impl `DenseGrassrootsTable` in `GrassrootsPage.jsx` |

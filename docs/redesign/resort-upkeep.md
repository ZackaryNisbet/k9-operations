# Resort Upkeep: Audit and Redesign Proposal

Status: proposal (discovery unit X2, batch 2026-05-30)
Scope of the accompanying PR: this document plus one safe, read-only first slice (the "Due" rollup tab). No schema changes ship in this PR.

> Owner's framing: "this resort upkeep feature is so bad and needs to be completely redone properly." This is a discovery and redesign proposal, not a blind rebuild. The guiding principle, in the owner's words, is to **get the fundamentals right and avoid over-complication**.

---

## 1. What Resort Upkeep is

A single-location facility operations surface with four loosely-related domains bolted together:

| Domain | Job to be done | Backing tables |
|---|---|---|
| **Building Maintenance** | Recurring facility checklists (monthly / quarterly / semi-annual / annual), completed and submitted by staff, with notes and photos. | `templates`, `template_versions`, `periods`, `item_states` |
| **Local Vendors** | Directory of contractors (HVAC, plumbing, pest, fire), contract proof, service history. | `vendors`, `vendor_logs` |
| **Licenses** | Permits and compliance requirements with renewal dates and proof files. | `licenses`, `license_logs` |
| **Troubleshooting** | A static field-reference knowledge base with an escalation contact. | `troubleshooting_articles` |

Cross-cutting: `attachments` (polymorphic file metadata) and `audit_events` (a unified audit table).

The feature is **single-location** today (everything keys on `location_id`; there is no enterprise rollup).

---

## 2. Current architecture

**Tables (11):** `resort_upkeep_` + `templates`, `template_versions`, `periods`, `item_states`, `vendors`, `vendor_logs`, `licenses`, `license_logs`, `attachments`, `troubleshooting_articles`, `audit_events`.

**RPC surface (~18):** `get_dashboard`, `get_period_snapshot`, `list_periods`, `list_maintenance_templates`, `publish_template_version`, `save_item_state`, `submit_period`, `reopen_period`, `ensure_period`, `save_vendor`, `archive_vendor`, `add_vendor_log`, `save_license`, `deactivate_license`, `add_license_log`, `record_attachment`, `has_any_access`, plus template-list helpers.

**Period state machine (5 stored states)** via a `resort_upkeep_period_status` enum:
`open` to `in_progress` to `submitted`, with `amending` (a submitted period reopened for edits) and `late_submitted` (submitted after the due date). The UI then layers **derived** values on top (`ready_to_submit`, `overdue`, `submitted_late`) and has to reconcile them at read time:

```js
const computedStatus = snapshot?.computedStatus || period?.computed_status || period?.status;
```

**Materialization:** periods are created by `ensure_period`, which snapshots the active template version into a new period row. Submitting locks the period; a manager can reopen it "during the checklist period" only; template edits flow into open periods but submitted history keeps its snapshot.

---

## 3. Audit findings

The four problems below match the owner's priorities (all four were flagged) and the migration history confirms them.

### 3.1 The maintenance state machine is over-engineered

Five stored states plus three derived states, edit-locks, manager-only reopen windows, and an auto-submit prompt (a 250ms timer that pops a `window.confirm`) make a simple "did we do the monthly checklist" workflow hard to reason about. The state is split between the database (`status`) and the client (`computed_status`), so the two can disagree. `amending` and `late_submitted` encode as *states* things that are really *facts* (a period was reopened; a submission happened after the due date).

### 3.2 No unified "what's due" view

Maintenance due dates, license renewals, and vendor contract end dates each live in their own tab. There is no cross-cutting "what needs attention" surface, and nothing a future aggregated Calendar can read cheaply. A manager cannot answer "what is overdue or coming due across the whole facility this month" without visiting three tabs and doing the math by eye.

### 3.3 Duplicate audit trails

`resort_upkeep_audit_events` is a unified audit table, yet `resort_upkeep_vendor_logs` and `resort_upkeep_license_logs` persist the *same* activity separately. Every vendor and license editor loads both and shows them in two different widgets (a "Development log" composer and an "activity log" trail). Two sources of truth for one question ("what happened to this vendor"), double the write paths, double the triggers.

### 3.4 Period creation churned because reads had write side-effects

Period materialization (`ensure_period`) was entangled with reads. The fix migration says it plainly:

> "Keep dashboard/list reads side-effect-free for template metadata. ... reading a dashboard should not need template-management write rights just because a template's active_version_id is stale."

A read that writes is a read that needs write permissions, write locks, and conflict handling. That is the root of much of the same-day repair traffic.

### 3.5 The migration history is a tell

Sixteen migrations landed for this feature **in a single day (2026-05-16), ~6,700 lines**. At least half are reactive repairs to the first two:

| Migration | Lines | Nature |
|---|---:|---|
| `…151412_resort_upkeep_admin` | 1847 | initial schema + RPCs |
| `…154646_…period_history` | 1278 | period history + snapshots |
| `…161216_…template_fallback` | 138 | repair |
| `…162226_…amend_access_audit_hardening` | 371 | hardening |
| `…163039_…source_file_text_reconciliation` | 236 | repair |
| `…163426_…open_period_source_snapshot_repair` | 112 | repair |
| `…163602_…direct_source_text_repair` | 50 | repair |
| `…164734_…ensure_period_noop_conflict` | 114 | repair |
| `…165413_…history_backfill_and_edit_lock` | 381 | backfill + lock |
| `…165750_…window_lint_cleanup` | 57 | repair |
| `…181926_…policy_permission_alignment` | 356 | alignment |
| `…183029_…storage_policy_alignment` | 61 | alignment |
| `…194042_…vendor_license_rpc_writes` | 1456 | move direct writes to RPCs |
| `…220700_…ensure_period_read_side_effect_fix` | 112 | repair |
| `…222337_…has_any_access_lite_only` | 62 | repair (avoid legacy RLS) |
| `…223352_…template_list_rpc` | 66 | repair (avoid RLS recursion) |

Eight of sixteen are same-day repairs (`*_repair`, `*_fix`, `*_cleanup`, `*_noop_conflict`, `*_reconciliation`). That is the signature of a design that did not hold up under edge cases, not of bad luck.

### 3.6 The UI deviates from DESIGN.md "THE STANDARD"

DESIGN.md defines one list/record pattern for the whole app (the dense table, first established on Grassroots). Resort Upkeep ignores it:

- **Hero metric cards** (four big-number cards) lead the page. DESIGN.md: "No hero metrics, no big banners." The impeccable shared laws list the hero-metric template as an absolute ban.
- **Custom tab-cards** (a 4-card grid with descriptions) instead of the standard connected tab bar (full-width tabs, 3px underline, count pills).
- **No dense table anywhere.** Vendors and Licenses use roomy master-detail card lists with a right-hand editor panel, not the ~35px-row dense table with inline edge-to-edge expansion.
- **A hardcoded escalation contact** ("Facilities Vendor", a personal phone number and email) is baked into the Troubleshooting panel rather than being a location setting.
- **`fontWeight: 950`** throughout (not a real weight; clamps to 900) where DESIGN.md asks for 600-700.

---

## 4. Proposed redesign

Each change targets one of the pains above. The theme is subtraction.

### 4.1 Collapse the state machine: 3 stored states, the rest derived

Stored `state`: **`open` to `submitted` to `closed`.** Everything else becomes a pure function of data already on the row:

| Old | New |
|---|---|
| `open` | `open` |
| `in_progress` | `open` + derived `in_progress` (any item checked) |
| `submitted` | `submitted` |
| `late_submitted` | `submitted` + derived `late` (`submitted_at > due_date`) |
| `amending` | `open` again, with an audit event recording the reopen |
| (derived) `overdue` | `open` + `now > due_date` |

`closed` is set once by the scheduler when the period window ends, which locks history. Reopen is `submitted` to `open` plus an audit event, not a distinct state. Lateness is computed, never stored. This removes the client/server status reconciliation entirely: the server returns `state`, the client derives presentation.

### 4.2 Flatten item tracking onto the period

Replace `period` to `item_states` (one row per item per period) with an `items jsonb` column on the period, snapshotted from the template version at creation:

```jsonc
items: [
  { "key": "hvac-filter", "label": "Replace HVAC filters", "required": true,
    "checked": true, "checked_at": "2026-05-12T14:02:00Z", "checked_by": "A. Diaz", "note": "" }
]
```

A period becomes self-contained (the submitted snapshot is the jsonb, for free). `attachments` keep their own table (they carry storage metadata and signed-URL needs) and reference `(period_id, item_key)`. Templates and `template_versions` stay; versioned templates are genuinely useful. Trade-off: per-item rows lose SQL-level queryability, which a checklist does not need; the period is the unit of access and audit.

### 4.3 One audit pattern

Keep `audit_events` as the single activity log. Deprecate `vendor_logs` and `license_logs`:

1. Backfill their rows into `audit_events` (`event_type = 'note'`, payload carries `summary`, `notes`, `status_snapshot`).
2. Repoint the UI "Development log" to read `audit_events` filtered by `entity_type` + `entity_id`.
3. Stop writing to the per-entity log tables (keep them read-only until a later, approved drop).

One place to read "what happened to this entity," one trigger pattern, one write path.

### 4.4 Explicit, idempotent period creation

Replace read-triggered materialization with an explicit opener:

- `resort_upkeep_open_due_periods(location_id, anchor_date)`: `INSERT … ON CONFLICT (location_id, template_id, period_start) DO NOTHING`. Idempotent by construction.
- Run it from a **scheduled automation** (pg_cron or a Supabase scheduled function) daily, and optionally from an explicit manager action ("Open current periods").
- `get_dashboard` / `list_periods` become **pure SELECTs**: no writes, no write-permission coupling, no conflict handling. (The read-side-effect-fix migration started this; the redesign finishes it.)

### 4.5 Calendar-ready denormalized due dates

Add one uniform read model so any consumer (and the future Aggregated Calendar, unit C1) can read upcoming due dates cheaply:

```sql
create view resort_upkeep_due_dates as
  select location_id, 'maintenance_period' as source_type, id as source_id,
         coalesce(template_name, template_slug) as title, due_date, state as status
  from resort_upkeep_periods where state = 'open'
  union all
  select location_id, 'license_renewal', id, requirement_name,
         coalesce(expiration_date, next_expected_date), status
  from resort_upkeep_licenses where is_active
  union all
  select location_id, 'vendor_contract', id, business_name,
         contract_effective_end, 'contract'
  from resort_upkeep_vendors where has_contract and not is_archived and contract_effective_end is not null;
```

Columns: `location_id, source_type, source_id, title, due_date, status`. The Calendar reads `WHERE due_date BETWEEN … `. This is exactly what the **Due tab shipped in this PR computes on the client today**; the proposal promotes that logic to the server. It is additive (a view over existing columns), so it carries no data risk.

### 4.6 UI to DESIGN.md "THE STANDARD"

- Replace the four hero metric cards with the Due rollup as the landing surface; move counts into the connected tab bar's pills. (This PR keeps the cards per the owner's choice and adds the Due tab first; removing the cards is the next step.)
- Convert Vendors and Licenses from master-detail card lists to the dense table with inline edge-to-edge expansion (not a side panel or modal).
- Collapse the custom tab-cards into the standard connected tab bar.
- Replace the hardcoded escalation contact with a location setting or a troubleshooting record.
- Adopt F1's shared `DenseTable` / `PageHeader` / `TabBar` once F1 lands; until then follow DESIGN.md directly (this PR's Due tab already does).

---

## 5. Non-destructive migration path

Every phase is additive and reversible. No `DROP` of a table or column holding live data ships without a separate, explicitly-approved, backed-up migration.

| Phase | Change | Risk |
|---|---|---|
| **0 (this PR)** | Client-side Due rollup + this proposal. | None (read-only, no schema change). |
| **1** | Add `resort_upkeep_due_dates` view; point the future Calendar at it. | None (additive view). |
| **2** | Idempotent `open_due_periods` RPC + scheduled automation; make all reads pure. Keep `ensure_period` as a thin back-compat wrapper. | Low (new RPC + cron). |
| **3** | Add `state` (open/submitted/closed); backfill from `status`; dual-read; map `amending`→`open`, `late_submitted`→`submitted` + derived `late`. Keep the enum until callers migrate. | Low/medium (dual-read soak). |
| **4** | Add `items jsonb` to periods; backfill from `item_states`; dual-write; switch reads; retire `item_states` after a soak. | Medium (data backfill, soak required). |
| **5** | Backfill `vendor_logs` + `license_logs` into `audit_events`; switch UI reads; stop writes. | Low/medium. |

Phases 1, 2, and 5 deliver most of the value (a calendar feed, side-effect-free reads, one audit trail) at low risk and can land before the riskier 3 and 4.

---

## 6. What this PR ships (the first safe slice)

A new **"Due" tab**, set as the default view, that answers "what is overdue or coming due across the whole facility?" in one dense, scannable table:

- Aggregates **active maintenance periods** (from the existing dashboard), **license renewals** (expiration or next-expected date), and **vendor contract end dates** into one list, sorted most-urgent first, with items needing attention but no date pinned to the top.
- Built to DESIGN.md "THE STANDARD": search + pill filters (All / Maintenance / Licenses / Vendors) and a 30/60/90/All window toggle, a one-line explainer, then a dense table (Type pill, Item, Due + urgency badge, Status pill, open affordance). Rows open the source tab.
- **Read-only. No new RPC, no migration.** The aggregation is a pure, unit-tested function (`buildUpkeepDueItems` in `resortUpkeepData.js`), which doubles as the executable specification for the Phase 1 `resort_upkeep_due_dates` view.

### Why this slice de-risks the rebuild

It delivers the single highest-value missing capability (pain 3.2) immediately, with zero schema risk, and it proves out the denormalized due-date model (4.5) in code before any migration is written. The pure function is the contract the server view must satisfy.

---

## 7. Assumptions and open questions

**Assumptions (documented, proceeding):**
- Resort Upkeep stays single-location for this batch; an enterprise rollup is out of scope.
- The Calendar (C1) is the first real consumer of the denormalized due dates; this proposal is written so C1 can adopt the view without re-deriving anything.
- "Never drop data" is a hard rule; all destructive steps are deferred to separate, approved migrations.

**Open questions for the owner / orchestrator:**
- Renewal lead time: is 60 days the right default "coming due" window for licenses and contracts, or should it be configurable per location?
- Should `closed` periods be user-visible as read-only history, or archived out of the default view?
- Vendor contract renewals: should an expiring contract create a follow-up task, or is surfacing it in the Due rollup enough?
- Escalation contact: location setting, or a pinned troubleshooting record?

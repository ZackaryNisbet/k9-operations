# GINGR Icons Dynamic Configuration Plan

Last updated: 2026-05-18

## Objective

Make K9 Operations repeatable for Cherry Hill, every future K9 Resorts location, and non-K9 customers by removing hard-coded GINGR pairings from daily workflow computation.

The product outcome is a location setup flow that connects GINGR, discovers the location's reference data, guides a user through workflow mappings, starts the historical sync, and lets web/mobile render trusted server-computed outputs while the long bootstrap continues in the background.

This is not only an icon picker. It is the configuration layer for GINGR-derived operational truth.

## Current State

Already real:

- Animal icon assignments can be pulled through `POST /api/v1/get_icons` and persisted in `gingr_animal_icons_live`.
- A narrow mapping table exists: `gingr_icon_mappings`.
- Current icon inventory/status views exist: `v_gingr_icon_inventory_current`, `v_gingr_icon_mapping_status`.
- Current playgroup assignments can be computed from icon mappings through `v_dog_playgroup_assignments_current`.
- Rooms/runs/occupancy can be pulled from `POST /api/v1/get_runs_and_reservations`.
- Historical reservation backfill already starts from `2015-01-01` using `gingr_sync_state.backfill_cursor`.

Not yet solved:

- Client icons are not verified or wired.
- Full system/template icon catalog is not verified or wired.
- Services and add-ons are endpoint-verified but not persisted as a canonical catalog.
- Onboarding writes credentials to a path that does not match what `gingr-sync` reads.
- Onboarding tests GINGR directly from the browser with the API key.
- Runtime compute still falls back to hard-coded icon titles, service strings, reservation type names, room names, workflow IDs, and Cherry Hill-specific cron payloads.

## Hard-Coded Runtime Surface

These are the high-risk places that still need to be moved onto dynamic configuration.

| Area | Current hard-code | Files |
| --- | --- | --- |
| Icon capabilities | `play.private_play`, `play.large_daycare`, `play.small_daycare`, `play.evaluation`, bathing type/modifier keys, title fallback labels | `src/kol/settings/GingrIconsTab.jsx`, `supabase/functions/_shared/gingr-icon-mappings.ts`, `supabase/migrations/20260415135840_room_cleaning_and_gingr_icon_mappings.sql` |
| Private play | day boarding auto-inclusion, service name contains `private play`, required sessions = 3 | `supabase/functions/ops-compute/index.ts`, `supabase/functions/ops-compute-ondemand/index.ts`, `src/shared/opsHelpers.js`, mobile `PrivatePlayPage.tsx` |
| Bathing | bath/groom string inclusion, fixed bath type/modifier arrays, icon group `Bath`, default labels/styles | `supabase/functions/_shared/bathing-logic.ts`, `supabase/functions/ops-compute/index.ts`, `supabase/functions/ops-compute-ondemand/index.ts`, web/mobile services pages |
| Reservation categories | `boarding`, `day boarding`, `daycare`, `evaluation`, `tour`, `groom`, `bath` inferred from names | `gingr-sync`, `room-occupancy.ts`, `room-cleaning.ts`, `scheduling-matrix.ts`, web/mobile helpers |
| Rooms/runs | Cherry Hill room labels/counts, run `is_private_play` / `is_isolation` from name, `type_id = "5"` | `gingr-sync`, `src/shared/theme.js`, `useGingrData.js`, mobile `workflow-reports.ts` |
| Service reports | `bath`, `pamper`, `enrichment`, `ice cream`, `gourmet`, `Luxury Suite`, service exclusions | `OperationsHub.jsx`, `DailyOpsPage.jsx`, mobile `OperationsHub.tsx`, mobile `ServicesPage.tsx` |
| Workflow progress | fixed report IDs, setting keys, `lite_daily_ops` IDs, role/card mappings | `workflow_progress_snapshot` migrations, `useWorkflowProgressSnapshot.js`, mobile `workflow-progress.ts`, role layout files |
| Scheduling | static display buckets, static reservation categories, Cherry Hill scheduling cron jobs | `scheduling-matrix.ts`, `supabase/ops/cron-jobs.json` |
| Mobile fallbacks | local recompute from raw GINGR services/icons, fixed room order, missing location filters in some canonical reads | `k9-operations-mobile/client/src/pages/*`, `workflow-reports.ts`, `room-occupancy.ts` |

## Dynamic Configuration Contract

The following arrays/catalogs should become location-scoped data, not source-code constants used by runtime compute.

| Config family | Purpose | Examples |
| --- | --- | --- |
| `gingr_reference_sync_runs` | Track onboarding/bootstrap and reference discovery progress | reservations, animals, icons, rooms, services, historical backfill percent |
| `gingr_icon_inventory` | Store observed or discovered icon identities per location | template id, identity key, group, title, image/color metadata, first/last seen |
| `gingr_client_icon_inventory` | Store owner/client icons if verified | owner id, icon identity, group/title metadata |
| `gingr_service_catalog` | Persist services/add-ons from GINGR | service id, add-on id, name, type, active flag, raw payload |
| `gingr_reservation_type_catalog` | Persist reservation types from GINGR | type id, name, active flag, raw payload |
| `gingr_run_catalog` | Persist runs/rooms/areas | run id, name, area, run type, room label, active flag |
| `workflow_capability_catalog` | Define normalized capabilities the app understands | play.private_play, bathing.type.medicated, service.enrichment |
| `location_workflow_mappings` | Map GINGR reference values to capabilities/workflows | icon -> play.private_play, service -> private_play, reservation type -> daycare |
| `location_workflow_catalog` | Enable/label/configure workflows per location | bathing, private play, room cleaning, enrichment, care reports |
| `workflow_progress_sources` | Normalize progress rows/setting keys/type_sub | `lite_daily_ops` id pattern, completion setting key, session count |
| `cron_location_manifest` | Generate/reconcile cron payloads by active location | sync cadence, compute cadence, scheduling windows |

The existing `gingr_icon_mappings` table can remain as the first concrete mapping table. The broader design should either extend it into a generic mapping model or add sibling tables for service, reservation type, run, and workflow mappings.

## Target Onboarding Flow

1. Connect GINGR
   - User enters subdomain and API key.
   - Browser sends credentials only to a Supabase Edge Function.
   - Function validates access, stores server-owned config, and returns connection status.

2. Discover reference data
   - Pull reservation types.
   - Pull service/add-on catalog.
   - Pull runs/rooms/areas.
   - Pull animal list and current icon assignments.
   - Attempt client icon and system/template icon discovery. Mark these as verified, blocked, or unsupported instead of pretending they exist.

3. Seed suggested mappings
   - Use Cherry Hill-style text heuristics only as import suggestions.
   - Mark suggestions as unverified until the user accepts them.
   - Never let title guesses run silently in production compute.

4. Configure workflows
   - Show a workflow grid with rows for operational domains and columns for downstream surfaces.
   - Minimum domains: Playgroups/Private Play, Bathing, Room Cleaning/Setup, Service Reports, Scheduling Capacity, Care Reports, Checkout TV.
   - Let the user map icons, services, reservation types, runs/rooms, and workflow settings from discovered GINGR data.

5. Validate impact
   - Show sample dogs/reservations affected by each mapping.
   - Show unresolved icons/services/types.
   - Block "ready" status when required mappings for enabled workflows are missing.

6. Start initial historical sync
   - Run a durable `initial-bootstrap` job.
   - Historical pull must include all records since inception, matching the Cherry Hill approach.
   - Today and near-future reports should compute early so the app is usable before full history finishes.

7. Global sync status
   - App shell displays a persistent bottom floating progress component while the initial sync is active.
   - Once complete for that location, the component never returns unless a new bootstrap/rebuild is explicitly started.

## Backend Execution Plan

### Phase 0: Safety and source-of-truth cleanup

- Reconcile credential storage into the path `gingr-sync` actually reads.
- Move onboarding connection tests to a server function.
- Add a user-facing sync run/status table and view.
- Add explicit rollback instructions for every Edge Function change before production deploy.
- Add tests proving compute does not change Cherry Hill results before dynamic mappings are enabled.

### Phase 1: Reference discovery

- Persist `get_services_by_type` results into a service/add-on catalog.
- Persist reservation type catalog from GINGR.
- Normalize `get_runs_and_reservations` room/run/area data into a durable run catalog.
- Keep animal icon assignment sync as-is, but split "observed icon inventory" from "current dog assignments."
- Investigate client icons and full system icons separately; document verified endpoints before shipping them as product claims.

### Phase 2: Mapping model

- Extend `gingr_icon_mappings` or add generic mapping tables for services, reservation types, and runs.
- Add status views that report required, mapped, unmapped, stale, and ambiguous values by workflow.
- Add seed/import functions that propose mappings from text matches without making them runtime truth.
- Add audit fields: who mapped it, when, from what discovered reference row, and whether it was suggested or manually confirmed.

### Phase 3: Compute migration

- Update `ops-compute` and `ops-compute-ondemand` to load one shared location config object.
- Replace private-play service/icon/session constants with configured mappings.
- Replace bath type/modifier arrays with configured bath capability mappings while preserving the Fresh N Clean business rule.
- Replace reservation category string classifiers with configured reservation type mappings.
- Replace room cleaning inclusion/setup/disinfect categories with configured reservation/run mappings.
- Replace service report keyword parsing with configured service-to-report mappings.
- Replace scheduling category classifiers with the same shared config.
- Remove runtime title fallbacks from SQL views after seeding/migration is complete.

### Phase 4: Web UI

- Create a route-level `Gingr Icons` workspace instead of keeping the feature buried in Settings.
- Settings should deep-link to the workspace.
- Enterprise location rows should link to location-specific GINGR setup/config.
- Page structure:
  - connection health
  - reference discovery status
  - mapping completeness
  - workflow grid
  - unresolved values
  - impact preview
  - sync progress/history
- Keep the UI dense and operational, not a marketing page.

### Phase 5: Mobile cleanup

- Mobile should consume canonical computed rows, workflow progress, and normalized capabilities only.
- Remove local parsing of raw GINGR service strings/icons from Operations Hub, Services, Collars, Photos, Private Play, and Room Cleaning.
- Fix location scoping in canonical mobile reads called out by the audit.
- Render required private-play sessions from server config instead of fixed `[1,2,3]`.

### Phase 6: Cron and multi-location operations

- Replace Cherry Hill-only cron payloads with a Git-tracked location-aware cron manifest or a scheduler that iterates active configured locations.
- Add reconciliation tooling to verify production cron jobs match Git.
- Add monitoring for missing required mappings, failed reference discovery, stale sync runs, and failed compute outputs by location.

## Validation Plan

Minimum validation before shipping:

- Cherry Hill before/after diff for bathing, private play, playgroups, room cleaning, scheduling capacity, and workflow progress.
- Unit tests for mapping resolution:
  - exact configured icon wins
  - service mapping wins when icon absent
  - unmapped value is explicit unresolved, not guessed
  - Fresh N Clean still works
  - private-play session count is configurable
- SQL/RPC tests for required mapping status.
- Mobile checks that no employee-facing report recomputes GINGR categories from raw strings.
- Browser verification of the new Gingr Icons workspace at desktop and mobile widths.
- Historical bootstrap dry run against a non-production or controlled location before any broad rollout.

## Morning Decision Points

- Decide whether the first implementation scope should be Cherry Hill-compatible refactor only, or full onboarding UI in the same branch.
- Decide whether dynamic services/add-ons are mandatory for the first ship. Private Play and Bathing need them for the feature to be genuinely scalable.
- Decide how strict to make missing mappings: warn-only, block report compute, or compute with explicit unresolved rows.
- Decide whether Checkout TV should show the initial sync banner or stay clean during onboarding.
- Decide whether this branch should touch mobile immediately or stage mobile cleanup after backend config is stable.

## Recommended First Ship Slice

The smallest meaningful slice is:

1. Server-side GINGR credential validation and unified credential storage.
2. Durable reference sync/status table.
3. Service/add-on and reservation-type catalogs.
4. Dynamic mapping table/status for services and reservation types.
5. Private Play compute moved to dynamic icon/service/session config.
6. Bathing compute moved to dynamic service/icon bath mappings while preserving Fresh N Clean.
7. Route-level Gingr Icons workspace showing icon/service/type mapping status.
8. Cherry Hill parity tests proving no operational output changed unintentionally.

Room cleaning, scheduling, care report registry, mobile fallback removal, client icons, and full system icon templates should follow once that slice is stable.

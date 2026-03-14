# DE-006: Data Expansion Verification Report

**Date:** 2026-03-14
**Phase:** 5 — Verify & Test All Existing Features
**Status:** CRITICAL ISSUES FOUND — must resolve before building on expanded data
**Author:** Agent W4-1

---

## Executive Summary

This report audits the full K9 Operations codebase against the data expansion migrations (DE-001 through DE-005). Three **critical blocking issues** were found that will prevent the expanded tables from working in production:

1. **`location_id` type mismatch** — New DE tables use `UUID`, but the app passes `TEXT` slugs (e.g., `"cherry-hill"`). Queries will silently return zero rows.
2. **`gingr_id` / `animal_gingr_id` type mismatch** — New DE tables use `BIGINT`, but pre-existing tables store these as `TEXT`. Cross-table joins and app queries will fail.
3. **RLS policies reference non-existent `user_locations` table** — Every DE migration uses `user_locations` in RLS policies, but this table does not exist. The existing schema uses `lite_profiles` for authorization.

Additionally, one **high-severity bug** exists in DogDetailPage where `dog._gingr_id` is referenced but the field is actually named `dog.gingrId`.

---

## 1. Schema Verification — Full Table Inventory

### 1.1 Pre-existing Tables (from `supabase/migrations/`)

| Table | Migration File | Used in App Code | Sync Function | Status |
|-------|---------------|-----------------|---------------|--------|
| `gingr_owners` | `20260313_gingr_sync_tables.sql` | `useGingrData.js` (fetchAll) | `syncOwners()` | OK |
| `gingr_animals` | `20260313_gingr_sync_tables.sql` | `useGingrData.js` (fetchAll) | `syncAnimals()` | OK |
| `gingr_reservations` | `20260313_gingr_sync_tables.sql` | `useGingrData.js` (fetchAll), `CheckoutTVPage.jsx` (direct poll) | `syncReservations()` | OK |
| `gingr_immunizations` | `20260313_gingr_sync_tables.sql` | Referenced by `DogDetailPage.jsx` (DE-004 version) | N/A (synced via animals) | See §2.4 |
| `gingr_reservation_types` | `20260313_gingr_sync_tables.sql` | `useGingrData.js`, `RoomConfig.jsx` | `syncReservationTypes()` (inline) | OK |
| `gingr_breeds` | `20260313_gingr_sync_tables.sql` | `gingr-sync/index.ts` | `syncAnimals()` (breeds inline) | OK |
| `gingr_immunization_types` | `20260313_gingr_sync_tables.sql` | `useGingrData.js` | `syncImmunizationTypes()` | OK |
| `gingr_sync_state` | `20260313_gingr_sync_tables.sql` | `useGingrData.js`, `GingrIntegrationTab.jsx` | Used by all sync functions | OK |
| `lite_profiles` | `001_lite_profiles.sql` | `TeamManagementTab.jsx`, RLS policies throughout | N/A (app-native) | OK |
| `lite_daily_ops` | `20260312_lite_ops_tables.sql` | `DailyOpsPage.jsx`, `OperationsHub.jsx` | N/A (app-native) | OK |
| `lite_audit_log` | `20260312_lite_ops_tables.sql` | `AuditLogPage.jsx`, `ClientDetailPage.jsx`, `NewClientPage.jsx` | N/A (app-native) | OK |
| `lite_permissions` | `20260313_lite_permissions_templates_settings.sql` | `PermissionsTab.jsx` | N/A (app-native) | OK |
| `lite_checklist_templates` | `20260313_lite_permissions_templates_settings.sql` | `DailyOpsPage.jsx`, `ChecklistTemplatesTab.jsx` | N/A (app-native) | OK |
| `lite_settings` | `20260313_lite_permissions_templates_settings.sql` | Multiple pages (EOD, Clients, Retention, Room, Ignite) | N/A (app-native) | OK |
| `lite_client_lifecycle` | `20260315_lite_client_lifecycle.sql` | `useGingrData.js`, `NewClientPage.jsx` | N/A (app-native) | OK |
| `k9_gingr_credentials` | `20260312_gingr_credentials_table.sql` | `GingrIntegrationTab.jsx` | N/A (config) | OK |

### 1.2 DE-001: Form Reference Tables

| Table | Sync Function | App Code References | Status |
|-------|--------------|-------------------|--------|
| `gingr_form_definitions` | **NONE** — not in `gingr-sync/index.ts` | `RequiredFieldsTab.jsx` (line 351) | BLOCKED — see §3.1, §3.2, §3.3 |
| `gingr_icon_templates` | **NONE** | `PublicRoadmap.jsx`, `RoadmapPage.jsx` (display only) | BLOCKED — see §3.1, §3.2, §3.3 |

### 1.3 DE-002: Reference / Lookup Tables

| Table | Sync Function | App Code References | Status |
|-------|--------------|-------------------|--------|
| `gingr_breeds` (DE-002 version) | **CONFLICT** — DE-002 creates `gingr_breeds` with `BIGINT` PK + `UUID` location_id, but this table already exists from `20260313_gingr_sync_tables.sql` with `BIGSERIAL` PK + `TEXT` location_id | `gingr-sync/index.ts` (original schema) | **SCHEMA CONFLICT** — `CREATE TABLE IF NOT EXISTS` will silently skip; columns won't match |
| `gingr_species` | **NONE** | `ReportsPage.jsx` (text mention only), `LiteApp.jsx` (text mention) | BLOCKED — see §3.1, §3.2, §3.3 |
| `gingr_temperaments` | **NONE** | `RoadmapPage.jsx` (display only) | BLOCKED — see §3.1, §3.2, §3.3 |
| `gingr_immunization_types` (alteration) | N/A — adds columns to existing table | Already used by `useGingrData.js` | OK (additive only) |

### 1.4 DE-003: Financial Data Tables

| Table | Sync Function | App Code References | Status |
|-------|--------------|-------------------|--------|
| `gingr_invoices` | **NONE** | `useData.js` (POS), `App.jsx`, `LandingPage.jsx` (text mentions) | BLOCKED — see §3.1, §3.2, §3.3; no KOL page consumes this yet |
| `gingr_transactions` | **NONE** | `ReportsPage.jsx` (text keyword matching only), `ai-assistant/index.ts` (text mention) | BLOCKED — see §3.1, §3.2, §3.3; no actual queries yet |
| `v_daily_revenue` (view) | N/A | **NO app references** | No consumer code exists |
| `v_client_lifetime_value` (view) | N/A | **NO app references** | No consumer code exists |

**Note:** `ReportsPage.jsx` currently computes all revenue from `data.reservations` pricing data (reservation-level `pricing.total`), NOT from the `gingr_transactions` table. The DE-003 tables are created but have no data pipeline and no consumer code.

### 1.5 DE-004: Animal Enrichment

| Table | Sync Function | App Code References | Status |
|-------|--------------|-------------------|--------|
| `gingr_feeding_schedules` | **NONE** | `DogDetailPage.jsx` (line 115), `useData.js`, `App.jsx`, `ai-assistant` | BLOCKED — see §3.1, §3.2, §3.3, §3.4 |
| `gingr_medications` | **NONE** | `DogDetailPage.jsx` (line 116) | BLOCKED — see §3.1, §3.2, §3.3, §3.4 |
| `gingr_immunizations` (DE-004 version) | **NONE** | `DogDetailPage.jsx` (line 117) | **SCHEMA CONFLICT** — table already exists from `20260313_gingr_sync_tables.sql` with different column set; `CREATE TABLE IF NOT EXISTS` will silently skip |
| `gingr_vets` | **NONE** | `DogDetailPage.jsx` (line 118) | BLOCKED — see §3.1, §3.2, §3.3, §3.4 |
| `gingr_animal_icons` | **NONE** | `DogDetailPage.jsx` (line 119), `CheckoutTVPage.jsx` (line 353) | BLOCKED — see §3.1, §3.2, §3.3 |

### 1.6 DE-005: Client Enrichment

| Table | Sync Function | App Code References | Status |
|-------|--------------|-------------------|--------|
| `gingr_emergency_contacts` | **NONE** | `ClientDetailPage.jsx` (field mapping only — reads from `gingr_owners.emergency_contact_name`), `NewClientPage.jsx`, `useGingrData.js` (transforms `o.emergency_contact_name` from owners table) | Not consumed as standalone table |
| `gingr_client_notes` | **NONE** | **NO app references** | No consumer code exists |
| `gingr_communication_preferences` | **NONE** | **NO app references** | No consumer code exists |
| `gingr_referral_sources` | **NONE** | **NO app references** | No consumer code exists |
| `gingr_agreements` | **NONE** | **NO app references** | No consumer code exists |
| `gingr_subscriptions` | **NONE** | **NO app references** | No consumer code exists |

---

## 2. Feature Verification — KOL Page Audit

### 2.1 ClientsPage.jsx (Lifecycle Funnel)

- **Data sources:** `data.clients`, `data.reservations`, `data.dogs`, `data.payments`, `data.serverStats` (RPC), `lite_settings` (lifecycle views)
- **Schema match:** OK — queries `gingr_owners` (via useGingrData), `get_client_stats` RPC, `lite_client_lifecycle`
- **Issues:**
  - `data.payments` is always `[]` (hardcoded in useGingrData return). Payment-based calculations return zero. Will become stale if/when `gingr_transactions` is integrated.
  - Revenue calculations rely on `serverStats.total_spent` from the RPC, which sums `transaction->price` from `gingr_reservations`. This is an approximation, not real financial data.

### 2.2 ClientDetailPage.jsx

- **Data sources:** `data.clients`, `data.dogs`, `data.reservations`, `data.auditLog`, `ignite_leads`, `gingr_owners`, `gingr_animals`
- **Schema match:** OK for current queries
- **Issues:**
  - Emergency contact data comes from `gingr_owners` columns (`emergency_contact_name`, `emergency_contact_phone`), NOT from the new `gingr_emergency_contacts` table. The DE-005 table would provide richer data (multiple contacts, relationships, authorized pickup) but there's no code to query it yet.
  - Push-to-Gingr feature directly queries `gingr_owners` and `gingr_animals` — this works with current schema.

### 2.3 DogDetailPage.jsx

- **Data sources:** `data.clients`, `data.dogs`, `data.reservations`, direct Supabase queries to 5 DE-004 tables
- **CRITICAL BUG:** Line 103 uses `dog._gingr_id` but the transform in `useGingrData.js` (line 78) maps it as `dog.gingrId`. The field `_gingr_id` does NOT exist on the dog object. This means:
  - The `useEffect` guard condition `!dog._gingr_id` is always truthy (undefined is falsy)
  - The enrichment fetch never fires
  - All feeding schedules, medications, immunizations, vets, and animal icons silently fail to load
  - **Fix:** Change `dog._gingr_id` → `dog.gingrId` on lines 103, 108, 134

### 2.4 CheckoutTVPage.jsx

- **Data sources:** `data.reservations`, `data.dogs`, `data.clients`, direct Supabase queries to `gingr_animal_icons` and `gingr_reservations`
- **Schema match:** Queries use `profile.location_id` (TEXT slug) against `gingr_animal_icons.location_id` (UUID in DE-004 schema) — type mismatch will return zero rows
- **Issues:**
  - Animal icon fetch (line 353) will silently return empty results due to §3.1
  - Reservation polling (line 444) queries pre-existing `gingr_reservations` — this works fine
  - The `gingr_animal_icons` query fetches ALL icons for a location then builds a client-side lookup. For facilities with thousands of animals, this is wasteful — see §4.

### 2.5 FunnelPage.jsx

- **Data sources:** `data.clients`, `data.serverStats`
- **Schema match:** OK — no DE tables involved
- **Issues:** None

### 2.6 DailyOpsPage.jsx / OperationsHub.jsx

- **Data sources:** `data.dailyOps`, `data.reservations`, `data.rooms`, `data.dogs`, `data.clients`, `lite_checklist_templates`
- **Schema match:** OK — no DE tables involved
- **Issues:** None

### 2.7 EODPage.jsx

- **Data sources:** `data.eodEntries`, `data.dogs`, `data.reservations`, `lite_settings`
- **Schema match:** OK — no DE tables involved
- **Issues:** None

### 2.8 DashboardPage.jsx

- **Data sources:** `data.reservations`, `data.dogs`, `data.rooms`, `data.clients`, `data.serverStats`, `data.payments`
- **Schema match:** OK for current queries
- **Issues:**
  - Revenue metrics derived from reservation pricing, not from `gingr_transactions`. Once DE-003 is populated, the Dashboard should switch to real financial data.
  - `data.payments` is always `[]`, making some dashboard widgets non-functional.

### 2.9 ReportsPage.jsx

- **Data sources:** `data.reservations`, `data.rooms`, `data.dogs`, `data.clients`, `data.payments`
- **Schema match:** OK for current queries
- **Issues:**
  - "Cash basis" and "accrual" revenue are both computed from `data.reservations[].pricing.total` — they're actually the same data source with different date windowing. True cash-basis reporting requires `gingr_transactions` data.
  - Payment methods are hardcoded as `"gingr"` (line 140). The `gingr_transactions` table has `payment_method` (credit_card, cash, check, etc.) which would enable real payment method breakdowns.
  - Transaction list is synthetic (built from reservations), not from real `gingr_transactions`.

### 2.10 NewClientPage.jsx

- **Data sources:** `data.clients`, `gingr_owners`, `gingr_animals`, `lite_client_lifecycle`, `lite_audit_log`
- **Schema match:** OK — direct inserts to pre-existing tables
- **Issues:** None

### 2.11 AttendancePage.jsx / AuditLogPage.jsx / PhotosPage.jsx / SettingsPage.jsx

- **Schema match:** OK — no DE tables involved
- **Issues:** None

### 2.12 RequiredFieldsTab.jsx (Settings)

- **Data sources:** Direct query to `gingr_form_definitions` (line 351)
- **Issues:**
  - Query has **no `location_id` filter** — fetches all form definitions across all locations. For a multi-location deployment this is a data leak.
  - Subject to §3.1 (location_id type mismatch) and §3.3 (RLS policy references non-existent table)

---

## 3. Critical Blocking Issues

### 3.1 CRITICAL: `location_id` Type Mismatch (TEXT vs UUID)

**Pre-existing tables:** `location_id TEXT NOT NULL` (stores slugs like `"cherry-hill"`)
**DE-001–005 tables:** `location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE`

The app code passes `profile.location_id` (a text slug, e.g., `"cherry-hill"`) in all `.eq("location_id", ...)` queries. When this hits a UUID column, PostgreSQL will reject the comparison (type mismatch error) or return zero rows.

**Impact:** Every query to every DE table will silently fail.

**Fix options:**
- A) Change DE migrations to use `TEXT` for `location_id` (matches existing tables)
- B) Migrate all pre-existing tables to UUID (requires app-wide refactor + data migration)
- Option A is strongly recommended for consistency with the existing schema.

### 3.2 CRITICAL: `gingr_id` / FK Type Mismatch (TEXT vs BIGINT)

**Pre-existing tables:** `gingr_id TEXT`, `animal_gingr_id TEXT`, `owner_gingr_id TEXT`
**DE-001–005 tables:** `gingr_id BIGINT`, `animal_gingr_id BIGINT`, `owner_gingr_id BIGINT`

The app code stores gingr IDs as strings (e.g., `dog.gingrId` is derived from `gingr_animals.gingr_id` which is TEXT). When the app passes these string IDs in `.eq("animal_gingr_id", animalGingrId)` to a BIGINT column, PostgreSQL may:
- Implicitly cast and work (for numeric strings)
- Throw a type error (for non-numeric values)
- Silently fail joins between pre-existing and DE tables

**Impact:** Cross-table lookups (e.g., looking up feeding schedules for a dog) may fail unpredictably.

**Fix:** Change DE migrations to use `TEXT` for all `gingr_id`, `animal_gingr_id`, `owner_gingr_id` columns to match pre-existing schema.

### 3.3 CRITICAL: RLS Policies Reference Non-Existent `user_locations` Table

Every DE migration (001–005) creates RLS policies like:
```sql
USING (location_id IN (
  SELECT location_id FROM user_locations WHERE user_id = auth.uid()
))
```

**The `user_locations` table does not exist anywhere in the database.** The existing schema uses `lite_profiles` for user-location mapping. The pre-existing Gingr sync tables use a simpler model: `FOR SELECT TO authenticated USING (true)`.

**Impact:** If these migrations were to run, the RLS policies would fail with a "relation user_locations does not exist" error, potentially blocking table creation entirely.

**Fix:** Replace `user_locations` references with either:
- `lite_profiles` (matching the existing auth model), or
- Simple authenticated access (`USING (true)`) matching the existing gingr_* tables

### 3.4 HIGH: `dog._gingr_id` Field Name Bug in DogDetailPage.jsx

Line 103: `if (!profile?.location_id || !dog._gingr_id)` — the property `_gingr_id` does not exist on the transformed dog object. The correct property is `gingrId` (set in `useGingrData.js` line 78).

**Impact:** The entire enrichment data fetch (feeding schedules, medications, immunizations, vets, animal icons) never executes. All collapsible sections in the Dog Detail page will always appear empty, even when data exists in the database.

**Fix:** Replace `dog._gingr_id` with `dog.gingrId` on lines 103, 108, and 134.

---

## 4. Performance Notes

### 4.1 Missing Location Scope in RequiredFieldsTab.jsx

```js
supabase.from("gingr_form_definitions").select("*").order("display_order", { ascending: true })
```

No `.eq("location_id", ...)` filter. In a multi-location deployment, this fetches all rows across all locations.

**Fix:** Add `.eq("location_id", profile.location_id)` to the query.

### 4.2 CheckoutTVPage.jsx — Full-Table Icon Fetch

```js
supabase.from("gingr_animal_icons").select("animal_gingr_id,icon_url,icon_type,is_primary").eq("location_id", locationId)
```

This fetches ALL animal icons for a location and builds a client-side map. For a facility with 5,000+ animals, this could return thousands of rows. The TV page only needs icons for currently checked-in animals.

**Recommendation:** Scope the query to only animals present in today's reservations, or use an IN filter with the relevant `animal_gingr_id` values.

### 4.3 CheckoutTVPage.jsx — Polling Without Indexes

The checkout detection poll runs every 3 seconds:
```js
supabase.from("gingr_reservations")
  .select("gingr_id,animal_gingr_id,animal_name,owner_last_name,reservation_type_name,check_out_date")
  .eq("location_id", locationId)
  .not("check_in_date", "is", null)
  .is("check_out_date", null)
  .is("cancelled_date", null)
```

Pre-existing indexes cover `location_id`, `check_in_date`, and `check_out_date` individually. A composite index on `(location_id, check_in_date, check_out_date, cancelled_date)` would improve this high-frequency poll.

### 4.4 useGingrData.js — Full Table Scans

The `fetchAll()` helper fetches entire tables:
- `gingr_owners` — all owners for the location
- `gingr_animals` — all animals for the location
- `gingr_reservations` — all reservations for the location (background)

For a facility with 50K+ reservations, the reservation fetch is already optimized with pagination (1000-row pages, parallel batches of 10). The owners and animals fetches should remain manageable. However, as data grows, consider adding server-side aggregation or date-range filtering.

### 4.5 DE-003 Views — No Index Support for Aggregation

The `v_daily_revenue` and `v_client_lifetime_value` views aggregate `gingr_transactions` with `GROUP BY`. The existing indexes (`location_id`, `owner_gingr_id`, `transaction_date`) should be adequate, but for large volumes, consider materialized views refreshed on sync.

### 4.6 No N+1 Query Patterns Found

The codebase generally uses bulk fetches (all data loaded upfront in `useGingrData.js`) and `Promise.all` for parallel queries in page-level enrichment (e.g., `DogDetailPage.jsx` loads 5 tables in one `Promise.all`). No N+1 patterns were detected.

---

## 5. Sync Engine Gap Analysis

The current Gingr sync engine (`supabase/functions/gingr-sync/index.ts`) only syncs:

| Entity | Sync Function | DE Table |
|--------|--------------|----------|
| Owners | `syncOwners()` | Pre-existing |
| Animals | `syncAnimals()` | Pre-existing |
| Reservations | `syncReservations()` | Pre-existing |
| Breeds | Inline in `syncAnimals()` | Pre-existing |
| Immunization Types | `syncImmunizationTypes()` | Pre-existing |
| Reservation Types | Inline | Pre-existing |

**DE tables with NO sync function (14 tables + 2 views):**

| DE Phase | Tables Missing Sync |
|----------|-------------------|
| DE-001 | `gingr_form_definitions`, `gingr_icon_templates` |
| DE-002 | `gingr_species`, `gingr_temperaments` (+ `gingr_breeds` column gap) |
| DE-003 | `gingr_invoices`, `gingr_transactions` |
| DE-004 | `gingr_feeding_schedules`, `gingr_medications`, `gingr_immunizations` (expanded), `gingr_vets`, `gingr_animal_icons` |
| DE-005 | `gingr_emergency_contacts`, `gingr_client_notes`, `gingr_communication_preferences`, `gingr_referral_sources`, `gingr_agreements`, `gingr_subscriptions` |

**Impact:** Even after fixing the schema issues (§3.1–§3.3), these tables will remain empty until sync functions are added to the edge function.

---

## 6. Schema Conflicts — Tables Created Twice

Two tables are created in BOTH the pre-existing migrations AND the DE migrations with incompatible schemas:

### 6.1 `gingr_breeds`

- **Pre-existing** (`20260313_gingr_sync_tables.sql`): `BIGSERIAL PK`, `gingr_id TEXT`, `location_id TEXT`, `name TEXT`
- **DE-002** (`002_de002_reference_tables.sql`): `BIGINT GENERATED ALWAYS AS IDENTITY PK`, `gingr_id BIGINT`, `location_id UUID`, `name TEXT`, `species_id BIGINT`, `size_category TEXT`, `is_active BOOLEAN`, `raw_data JSONB`, `synced_at`, `created_at`, `updated_at`

`CREATE TABLE IF NOT EXISTS` will skip the DE-002 version entirely. The extra columns (`species_id`, `size_category`, `is_active`, etc.) will not be added.

### 6.2 `gingr_immunizations`

- **Pre-existing** (`20260313_gingr_sync_tables.sql`): `gingr_id TEXT`, `location_id TEXT`, `animal_gingr_id TEXT`, `type_name`, `type_id`, `expiration_date BIGINT`, `formatted_expiry`, `last_updated_at`, `updated_by`, `note`
- **DE-004** (`004_de004_animal_enrichment.sql`): `gingr_id BIGINT`, `location_id UUID`, `animal_gingr_id BIGINT`, `immunization_type_gingr_id`, `vaccination_name`, `date_administered`, `expiration_date DATE`, `administered_by`, `lot_number`, `is_verified`, `verification_notes`

Same issue — `CREATE TABLE IF NOT EXISTS` silently skips. The DogDetailPage queries columns like `vaccination_name`, `date_administered`, `expiration_date` (as DATE), `is_verified` that DO NOT exist on the pre-existing table. These columns will return `null`.

---

## 7. Recommendations — Priority Order

### Must Fix Before Any New Features (P0)

1. **Fix DE migrations: change `location_id` from `UUID` to `TEXT`** across all DE-001 through DE-005 migration files. Match the existing schema convention.

2. **Fix DE migrations: change all `gingr_id`, `animal_gingr_id`, `owner_gingr_id` from `BIGINT` to `TEXT`** across all DE-001 through DE-005 migration files. Match the existing schema convention.

3. **Fix DE migrations: replace `user_locations` in all RLS policies** with either `lite_profiles` or simple authenticated access matching the existing `gingr_*` tables.

4. **Fix `DogDetailPage.jsx`:** Change `dog._gingr_id` to `dog.gingrId` (lines 103, 108, 134). Note: this file is in `pages/` and is editable per AGENTS.md rules. However, even after this fix, the enrichment queries will return empty results until §7 items 1–3 and sync functions are implemented.

5. **Resolve schema conflicts** for `gingr_breeds` and `gingr_immunizations`:
   - Use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` to add missing columns to the pre-existing tables
   - Do NOT use `CREATE TABLE IF NOT EXISTS` for tables that already exist with different schemas

### Should Fix (P1)

6. **Add location_id filter** to `RequiredFieldsTab.jsx` query (line 351) — currently leaks data across locations.

7. **Scope `CheckoutTVPage.jsx` animal icons query** to only animals in today's reservations.

8. **Build sync functions** for all DE tables in `gingr-sync/index.ts`. Without data flowing into these tables, the expanded schema provides no value.

### Nice to Have (P2)

9. **Add composite index** `(location_id, check_in_date, check_out_date, cancelled_date)` on `gingr_reservations` for the TV polling query.

10. **Switch `ReportsPage.jsx` revenue calculations** from reservation-based pricing to `gingr_transactions` data once DE-003 is populated and synced.

11. **Integrate `v_daily_revenue` and `v_client_lifetime_value` views** into DashboardPage and ClientDetailPage for accurate financial reporting.

---

## 8. Tables With No Consumer Code

The following DE tables have been defined in migrations but have zero references in any application code (excluding tracker-data.js and roadmap display pages):

- `gingr_icon_templates` (DE-001)
- `gingr_species` (DE-002)
- `gingr_temperaments` (DE-002)
- `gingr_invoices` (DE-003) — referenced in POS `useData.js` but not in KOL
- `v_daily_revenue` (DE-003 view)
- `v_client_lifetime_value` (DE-003 view)
- `gingr_client_notes` (DE-005)
- `gingr_communication_preferences` (DE-005)
- `gingr_referral_sources` (DE-005)
- `gingr_agreements` (DE-005)
- `gingr_subscriptions` (DE-005)

These tables will exist as empty structures until both sync functions and consumer code are built.

---

## 9. Conclusion

The data expansion migrations (DE-001 through DE-005) represent a well-structured plan for enriching the K9 Operations data model. However, **three critical schema-level incompatibilities prevent the new tables from functioning**. These must be resolved at the migration level before any app code can consume the expanded data.

The existing features (lifecycle, operations hub, EOD, reports, TV) continue to work correctly against the pre-existing schema and are not broken by the expansion. The primary risk is that new code (DogDetailPage enrichment, RequiredFieldsTab form definitions, CheckoutTVPage icons) has been written to query DE tables but will silently return empty results due to the schema mismatches.

**Verdict: DE-006 quality gate FAILS. Three critical issues and one high-severity bug must be resolved before proceeding to DE-007.**

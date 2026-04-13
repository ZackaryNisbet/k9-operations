# K9 Operations Lite — Comprehensive Requirements & Roadmap

**Last Updated:** March 14, 2026  
**Stack:** React (Vite) + Supabase + Vercel + Gingr API  
**Repo:** `SkyleraryBrooks/k9-operations`, branch: `main`

---

## Table of Contents

1. [Completed Features](#1-completed-features)
2. [In-Progress / Immediate Next Steps](#2-in-progress--immediate-next-steps)
3. [New Data Expansion Requirements](#3-new-data-expansion-requirements)
4. [Original Feature Requests (Remaining)](#4-original-feature-requests-remaining)
5. [Database Schema Recommendation](#5-database-schema-recommendation)
6. [Gingr API Reference (Key Endpoints)](#6-gingr-api-reference-key-endpoints)
7. [Unified Roadmap (Prioritized)](#7-unified-roadmap-prioritized)

---

## 1. Completed Features

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 1 | Checklists — names + timestamps | ✅ Done | Staff names show on check-in/out actions |
| 4 | EOD / @ mention system | ✅ Done | End-of-day notes with staff mentions |
| 7 | Checkout Notes page | ✅ Done | Dedicated page for checkout notes |
| — | Room Cleaning module (bugs fixed) | ✅ Done | Banner, inline missed rooms, room names from Gingr |
| — | Operations Hub lag fix | ✅ Done | Performance optimization |
| — | Services section redesign | ✅ Done | Clean 3-column layout for Services in Ops Hub |
| — | Day Boarding removed from Settings | ✅ Done | Per user request |
| — | Awaiting Checkout restriction removed | ✅ Done | Full Disinfect selectable at any point |
| — | Gingr Sync function (v1) | ✅ Done | Syncs owners, animals, reservations, reservation_types, immunization_types |
| — | Services section: dynamic detection | ✅ Done | Auto-discovers all 7 active services from Gingr _services data |
| — | Services section: immediate loading | ✅ Done | Bath + Pamper show instantly with "Loading…" before data arrives |
| — | Supabase migration: DROP POLICY fix | ✅ Done | Added `DROP POLICY IF EXISTS` before all 66 `CREATE POLICY` statements |
| — | Toast notification system | ✅ Done | Real animated toasts (was console.log no-op) |
| — | Breadcrumb nav fix | ✅ Done | Funnel & Reports added to TOP_LEVEL_PAGES |
| — | Dead code cleanup | ✅ Done | Removed old `renderPictures` (34 lines), consolidated to single version |

---

## 2. In-Progress / Immediate Next Steps

### 2A. Bathing Report — Bath Type Column ✅ DONE

**Implemented:** Bath type now shows in Bathing Report with color-coded pills (Premium=blue, Hypoallergenic=yellow, Medicated=red, Whitening=purple, Shampoo From Home=green). Fetches from `existing_reservation_estimate` API per-dog, batched 5 at a time, with caching in state.

**Bath Addon IDs:** 38=Premium, 39=Hypoallergenic-NO SPRAY, 79=Hypoallergenic-WITH SPRAY, 40=Medicated, 75=Whitening, 76=Shampoo From Home.

---

### 2B. Pamper Package Plus Report — Room Numbers ✅ DONE

**Implemented:** Room numbers show in Pamper report from `res.room` (assigned by `assignRoomsIntelligently()`). Grouped by room, sorted numerically.

---

## 3. New Data Expansion Requirements

The user wants to pull significantly more data from Gingr into Supabase to power new UI features. These new data sources need to be added to the `gingr-sync` edge function.

### 3A. Feeding Info

- **Endpoint:** `GET get_feeding_info?key=API_KEY&animal_id={id}`
- **What it returns:** Array of feeding instructions per animal (food type, portions, schedule, special instructions)
- **Where to display:** Dog-level detail page (matching POS app.jsx design quality)
- **Sync strategy:** Per-animal call. Run for all animals with active reservations (checked-in today).

### 3B. Medication Info

- **Endpoint:** `GET get_medication_info?key=API_KEY&animal_id={id}`
- **What it returns:** Array of medications per animal (name, dosage, frequency, instructions)
- **Where to display:** Dog-level detail page (matching POS app.jsx design quality)
- **Sync strategy:** Per-animal call. Run for all animals with active reservations.

### 3C. Reservation Estimates (Pricing)

- **Endpoint:** `GET existing_reservation_estimate?key=API_KEY&id={reservation_id}`
- **What it returns:** Full cost breakdown per reservation — base rate, final rate, modifiers, tax, services with addons, POS items
- **Where to use:**
  - Revenue calculation: both cash-basis and accrual forecasting
  - Bath type extraction (from `reservation_services[].addon_id`)
  - Service detail visibility
- **Sync strategy:** For active reservations (today's checked-in). Also useful for historical analysis.

### 3D. Vet Records

- **Endpoint:** `GET get_vets?key=API_KEY&vetFlag=true`
- **What it returns:** 645 vet records — `id`, `name`, `phone`, `address`, etc.
- **Where to display:** Client/dog pages. Note: there's already a vet column in the system — this fills it with actual data.
- **Sync strategy:** Full sync (reference data, changes rarely). Run during full sync.

### 3E. Subscriptions / Packages

- **Endpoint:** `GET get_subscriptions?key=API_KEY`
- **What it returns:** Client subscriptions — package names, status, usage, renewal dates
- **Where to display:** Client page → packages sub-column. May already partially exist — improve if so.
- **Sync strategy:** Full sync periodically.

### 3F. Invoices

- **Endpoint:** `GET list_invoices?key=API_KEY&from_date=YYYY-MM-DD&to_date=YYYY-MM-DD`
- **What it returns:** Invoice records with line items, totals, payment status
- **Where to display:** Client page
- **Sync strategy:** Incremental by date range, similar to reservations.

### 3G. Transactions

- **Endpoint:** `GET list_transactions?key=API_KEY&from_date=YYYY-MM-DD&to_date=YYYY-MM-DD`
- **What it returns:** Payment transactions — amount, type, date, associated reservation
- **Where to display:** Client page
- **Sync strategy:** Incremental by date range.

### 3H. Room/Run Assignments (Back of House)

- **Endpoint:** `GET back_of_house?key=API_KEY&location_id=1&type_ids[]=5&type_ids[]=6&type_ids[]=7&type_ids[]=8&full_day=true`
- **What it returns:** Current room assignments — `run_name`, `area_name`, `animal_name`, `owner_name`, `check_in_date`, etc.
- **Where to use:**
  - Pamper Package report (room numbers)
  - Room Cleaning module (eliminate manual room config in Settings)
  - Any boarding-related UI
- **Sync strategy:** Real-time (changes throughout the day as dogs check in/out). Sync on each app load or refresh.

### 3I. Service Options (Bath Types)

- **Endpoint:** `GET get_services_by_type?key=API_KEY&type_id={id}`
- **What it returns:** Available services per reservation type, including `addons` array with bath type options
- **Where to use:** Bath type mapping for Bathing Report, service configuration reference
- **Sync strategy:** Reference data. Sync during full sync, cache locally.

---

## 4. Original Feature Requests (Remaining)

### 4A. Private Play Fix (#2)

- **Status:** 🔄 In Progress (overnight March 14)
- **Requirement:** Must match POS `app.jsx` UI layout. Pull dogs with "Extra Private Playtime" service from Gingr `_services` data.
- **Notes:** PP dogs are identified via `_services` array — look for `"Extra Private Playtime"` using `hasSvcIncludes('Private Play')` or similar. UI should match POS app.jsx layout quality.

### 4B. Dog/Reservation Info UI (#5)

- **Status:** 🔄 In Progress (overnight March 14)
- **Requirement:** Dog detail page that matches POS `app.jsx` design quality. This is where feeding info, medication info, and other per-dog data will be displayed.
- **Phase 1 (tonight):** Build the UI shell using currently available data (dog name, breed, owner, reservation details, services, room). Can work without new Supabase data.
- **Phase 2 (later):** Enhance with feeding info, medication info, vet data once data expansion (Section 3) is complete.

### 4C. Revenue Calculation Audit (#6)

- **Status:** 🔄 In Progress (overnight March 14)
- **Requirement:** First audit the existing math for accuracy over 3 days of real data. Then build the Revenue module if calculations check out.
- **Phase 1 (tonight):** Audit existing revenue calculations against Gingr API data.
- **Phase 2 (tonight if time):** Build Revenue module with cash-basis and accrual-basis views.

### 4D. Push to Gingr (#8)

- **Status:** ⏸️ Blocked — User must be present
- **Requirement:** Map K9 Ops lead fields to Gingr client fields in Settings. Visual drag-line UI for field mapping.
- **Notes:** Write operations to Gingr — needs careful testing. Gingr API supports `create_owner` and `create_animal`. User explicitly requested to be present for this.

### 4E. Checkout TV Screen (#9)

- **Status:** 🔄 In Progress (overnight March 14)
- **Requirement:** Shows both daycare AND boarding dogs. Behind login. Large-format display for lobby TV.
- **Design:** Dog grid with names/photos, real-time updates, clean large-format layout suitable for wall-mounted TV.
- **Auth:** Behind K9 Operations login (not public URL). Accessible at a route like `/checkout-tv`.

---

## 5. Database Schema Recommendation

### The Question: JSONB vs. Dedicated Tables

**Recommendation: Hybrid Approach** — dedicated tables for high-query data, JSONB for reference/rarely-queried data.

### Tier 1: Dedicated Tables (query frequently, join often, filter/sort)

These already exist or need their own tables:

| Table | Why Dedicated | Notes |
|-------|--------------|-------|
| `gingr_reservations` | ✅ Exists | Core data, filtered by date/type/status constantly |
| `gingr_animals` | ✅ Exists | Joined with reservations, filtered by name |
| `gingr_owners` | ✅ Exists | Joined with animals/reservations |
| `gingr_reservation_types` | ✅ Exists | Reference lookup |
| `gingr_breeds` | ✅ Exists | Reference lookup |
| `gingr_immunization_types` | ✅ Exists | Reference lookup |
| `gingr_invoices` | 🆕 Needs table | Filtered by date, joined to owners. Revenue calcs. |
| `gingr_transactions` | 🆕 Needs table | Filtered by date, revenue reporting |
| `gingr_vets` | 🆕 Needs table | Joined from animals, 645 records |
| `gingr_subscriptions` | 🆕 Needs table | Filtered by status, renewal dates |

### Tier 2: JSONB Columns on Existing Tables (per-entity data, read-only display)

These are child data that always belongs to a parent entity and is never queried independently:

| Data | Store As | On Table | Rationale |
|------|----------|----------|-----------|
| Feeding info | `feeding_info JSONB` | `gingr_animals` | Per-animal, displayed inline, never queried independently |
| Medication info | `medication_info JSONB` | `gingr_animals` | Per-animal, displayed inline |
| Reservation estimate | `estimate_data JSONB` | `gingr_reservations` | Per-reservation, used for bath type + pricing |
| Back of house (room) | `room_assignment JSONB` | `gingr_reservations` | Per-reservation, room/run info |
| Service addons | Already in `estimate_data` | `gingr_reservations` | Extracted from estimate |

### Tier 3: JSONB on Reference Table (config data, rarely changes)

| Data | Store As | On Table | Rationale |
|------|----------|----------|-----------|
| Service options/addons | `service_config JSONB` | `gingr_reservation_types` | Reference data, maps type→available services→addons |
| Bath addon mapping | `bath_addons JSONB` | `lite_settings` | Static config: addon_id → bath type name |

### New Tables Needed

```sql
-- Invoices
CREATE TABLE gingr_invoices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  gingr_id TEXT NOT NULL,
  location_id UUID NOT NULL REFERENCES locations(id),
  owner_gingr_id TEXT,
  reservation_gingr_id TEXT,
  invoice_date DATE,
  total_amount NUMERIC(10,2),
  amount_paid NUMERIC(10,2),
  status TEXT,
  line_items JSONB,
  raw_data JSONB,
  synced_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(location_id, gingr_id)
);

-- Transactions
CREATE TABLE gingr_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  gingr_id TEXT NOT NULL,
  location_id UUID NOT NULL REFERENCES locations(id),
  owner_gingr_id TEXT,
  transaction_date DATE,
  amount NUMERIC(10,2),
  transaction_type TEXT,
  payment_method TEXT,
  description TEXT,
  raw_data JSONB,
  synced_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(location_id, gingr_id)
);

-- Vets
CREATE TABLE gingr_vets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  gingr_id TEXT NOT NULL,
  location_id UUID NOT NULL REFERENCES locations(id),
  name TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  raw_data JSONB,
  synced_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(location_id, gingr_id)
);

-- Subscriptions
CREATE TABLE gingr_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  gingr_id TEXT NOT NULL,
  location_id UUID NOT NULL REFERENCES locations(id),
  owner_gingr_id TEXT,
  package_name TEXT,
  status TEXT,
  start_date DATE,
  end_date DATE,
  uses_remaining INTEGER,
  raw_data JSONB,
  synced_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(location_id, gingr_id)
);
```

### New JSONB Columns on Existing Tables

```sql
-- On gingr_animals
ALTER TABLE gingr_animals ADD COLUMN IF NOT EXISTS feeding_info JSONB;
ALTER TABLE gingr_animals ADD COLUMN IF NOT EXISTS medication_info JSONB;
ALTER TABLE gingr_animals ADD COLUMN IF NOT EXISTS vet_gingr_id TEXT;

-- On gingr_reservations
ALTER TABLE gingr_reservations ADD COLUMN IF NOT EXISTS estimate_data JSONB;
ALTER TABLE gingr_reservations ADD COLUMN IF NOT EXISTS room_assignment JSONB;
ALTER TABLE gingr_reservations ADD COLUMN IF NOT EXISTS bath_type TEXT;

-- On gingr_reservation_types
ALTER TABLE gingr_reservation_types ADD COLUMN IF NOT EXISTS service_config JSONB;
```

---

## 6. Gingr API Reference (Key Endpoints)

### Currently Synced

| Endpoint | Method | What |
|----------|--------|------|
| `owners` | GET | All owners (clients) |
| `animals` | GET | All animals (dogs) |
| `get_breeds` | GET | Breed reference |
| `reservations` | POST | Reservations by date range + check-in status |
| `reservation_types` | GET | Reservation type definitions |
| `get_immunization_types` | GET | Immunization type definitions |

### To Be Added

| Endpoint | Method | Params | What |
|----------|--------|--------|------|
| `get_feeding_info` | GET | `animal_id` | Feeding instructions per animal |
| `get_medication_info` | GET | `animal_id` | Medication list per animal |
| `existing_reservation_estimate` | GET | `id` (reservation) | Full cost breakdown + service addons |
| `get_vets` | GET | `vetFlag=true` | All vets (645 records) |
| `get_subscriptions` | GET | — | Client subscriptions |
| `list_invoices` | GET | `from_date`, `to_date` | Invoice records |
| `list_transactions` | GET | `from_date`, `to_date` | Payment transactions |
| `back_of_house` | GET | `location_id`, `type_ids[]`, `full_day` | Room/run assignments |
| `get_services_by_type` | GET | `type_id` | Service definitions + addons per type |

### Other Available Endpoints (Not Yet Needed)

| Endpoint | What |
|----------|------|
| `get_locations` | Location list |
| `get_species` | Species reference |
| `get_temperaments` | Temperament options |
| `get_all_retail_items` | Retail inventory |
| `create_owner` | Create new owner (for Push to Gingr feature) |
| `create_animal` | Create new animal |
| `get_immunizations` | Animal immunization records |
| `reservations_by_animal` | Reservations filtered by animal ID |

---

## 7. Unified Roadmap (Prioritized)

### Completed (as of March 14, 2026)

| Task | Status | Notes |
|------|--------|-------|
| Bathing Report — bath type column | ✅ Done | Color-coded pills, addon ID mapping |
| Pamper Package — room numbers | ✅ Done | From `assignRoomsIntelligently()` |
| Services section — dynamic detection | ✅ Done | All 7 services auto-discovered |
| Services section — loading states | ✅ Done | Immediate render with "Loading…" |
| Supabase migration — DROP POLICY fix | ✅ Done | 66 policies fixed |
| Code quality sweep | ✅ Done | Dead code, toasts, breadcrumbs |

### Overnight Sprint (March 14, 2026)

| Priority | Task | Effort | Status |
|----------|------|--------|--------|
| P0 | Private Play fix — match POS UI | 0.5 day | 🔄 In Progress |
| P0 | Dog/Reservation Info UI — Phase 1 shell | 1 day | 🔄 In Progress |
| P0 | Checkout TV — daycare + boarding, behind login | 1 day | 🔄 In Progress |
| P1 | Revenue Audit — verify calculations | 0.5 day | 🔄 In Progress |
| P1 | Revenue Module — build if audit passes | 1 day | 🔄 In Progress |
| P2 | Data Expansion — new tables, sync, E2E verify | 2-3 days | 🔄 In Progress (LAST) |

### Remaining (Requires User)

| Priority | Task | Effort | Dependencies |
|----------|------|--------|-------------|
| P2 | Push to Gingr (#8) | 3-4 days | User must be present |
| P3 | Room Cleaning auto-config from back_of_house | 1 day | Data expansion complete |

---

## Appendix: Key Credentials & Config

- **Gingr API Key:** `[REDACTED GINGR API KEY]`
- **Gingr Subdomain:** `your-gingr-subdomain`
- **Gingr Location ID:** `1`
- **Supabase Location ID:** `11111111-1111-1111-1111-111111111111`
- **Boarding Type IDs:** 5 (Luxury Suite), 6 (Executive Room), 7 (Single Compartment), 8 (Double Compartment)
- **Bathing Type ID:** 4
- **Daycare Type IDs:** 1 (Full), 2 (Half), 3 (Eval)

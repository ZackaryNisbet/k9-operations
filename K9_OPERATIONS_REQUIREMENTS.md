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

---

## 2. In-Progress / Immediate Next Steps

### 2A. Bathing Report — Add Bath Type Column ⚡

**Problem:** The Bathing Report currently shows dog name, owner, and status — but NOT the bath type (Premium, Hypoallergenic, Medicated, etc.). Staff need this to know which shampoo to use.

**Solution (Verified via API Exploration):**

The bath type is NOT in the standard `reservations` endpoint. It IS in `existing_reservation_estimate`:

```
GET existing_reservation_estimate?key=API_KEY&id={reservation_id}
→ data.reservations[].reservation_services[]
```

Each reservation has a `reservation_services` array. The bath service has `type: "bath"` and an `id` field. Bath type addons appear as separate items in the same array with:
- `addon_id` — the addon record ID
- `s_id` — maps to the bath addon type
- `name` — the addon name (e.g., "Hypoallergenic - NO SPRAY")

**Bath Addon IDs (from `get_services_by_type`):**

| s_id | Name |
|------|------|
| 38 | Premium (default) |
| 39 | Hypoallergenic - NO SPRAY |
| 79 | Hypoallergenic - WITH SPRAY |
| 40 | Medicated |
| 75 | Whitening |
| 76 | Shampoo From Home |

If no addon is present, the bath is "Premium" (default).

**Implementation approach:**
- On Ops Hub load (or when Services tab is active), for each dog with a bath service, call `existing_reservation_estimate` to get the bath type addon
- Cache results so we don't re-fetch on every render
- Display bath type as a column in the Bathing Report
- Consider batching: fetch estimates for all bath dogs in parallel (rate-limit aware)

**Alternative (more efficient):** Pull the bath type during gingr-sync and store it in a new column or JSONB field on `gingr_reservations`. This eliminates per-render API calls.

---

### 2B. Pamper Package Plus Report — Add Room Numbers ⚡

**Problem:** The Pamper Package Plus add-on report shows dog names but not room numbers. Staff need room assignments to locate dogs.

**Solution (Verified via API Exploration):**

Room assignments come from the `back_of_house` endpoint:

```
GET back_of_house?key=API_KEY&location_id=1&type_ids[]=5&type_ids[]=6&type_ids[]=7&type_ids[]=8&full_day=true
```

Returns `run_name` (e.g., "Luxury - 102") and `area_name` (e.g., "Luxury Suites") for each checked-in boarding dog.

**Display rules:**
- Show room number per dog row
- If multiple dogs share a room (e.g., Bowie + Flynn in "Luxury - 102"), list them on separate rows but show the room number once (or on first row of the group)
- Group by room visually for quick scanning

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

- **Status:** Not started
- **Requirement:** Must match POS `app.jsx` UI layout. Pull dogs with Private Play tag from Gingr.
- **Notes:** Need to identify how PP dogs are tagged in Gingr data (likely a service or tag on the reservation).

### 4B. Dog/Reservation Info UI (#5)

- **Status:** Not started
- **Requirement:** Dog detail page that matches POS `app.jsx` design quality. This is where feeding info, medication info, and other per-dog data will be displayed.
- **Dependencies:** Requires 3A (feeding), 3B (medication), 3D (vets) data to be synced first.

### 4C. Revenue Calculation Audit (#6)

- **Status:** Not started
- **Requirement:** 3-day detailed analysis of revenue calculations. Both cash-basis and accrual-basis.
- **Dependencies:** Requires 3C (reservation estimates), 3F (invoices), 3G (transactions) data.

### 4D. Push to Gingr (#8)

- **Status:** Not started
- **Requirement:** Map K9 Ops lead fields to Gingr client fields in Settings. Visual drag-line UI for field mapping.
- **Notes:** Write operations to Gingr — needs careful testing. Gingr API supports `create_owner` and `create_animal`.

### 4E. Checkout TV Screen (#9)

- **Status:** Not started
- **Requirement:** Public URL like `/CherryHill/daycare`. 1-second polling, 60-second countdown timer, dog grid display. Large-format display for lobby TV.
- **Notes:** Standalone page, separate from main app. Real-time updates from Supabase or direct Gingr API.

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

### Phase 1: Data Infrastructure (Do First)

| Priority | Task | Effort | Dependencies |
|----------|------|--------|-------------|
| P0 | DB migrations — new tables + JSONB columns | 1 day | None |
| P0 | Update gingr-sync — add all new endpoints | 2-3 days | Migrations |
| P0 | Fix Bathing Report — add bath type column | 0.5 day | gingr-sync update (or client-side API call) |
| P0 | Fix Pamper Package — add room numbers | 0.5 day | back_of_house data |

### Phase 2: Core UI Features

| Priority | Task | Effort | Dependencies |
|----------|------|--------|-------------|
| P1 | Dog/Reservation Info UI (#5) | 2-3 days | Feeding, medication, vet data synced |
| P1 | Private Play Fix (#2) | 1 day | Need to identify PP tagging in Gingr |
| P1 | Revenue Calculation Audit (#6) | 3 days | Estimates, invoices, transactions synced |

### Phase 3: Advanced Features

| Priority | Task | Effort | Dependencies |
|----------|------|--------|-------------|
| P2 | Push to Gingr (#8) | 3-4 days | Field mapping design |
| P2 | Checkout TV Screen (#9) | 2-3 days | Real-time data pipeline |
| P2 | Room Cleaning auto-config from back_of_house | 1 day | back_of_house data |

### Total Estimated Effort

- **Phase 1:** ~4-5 days
- **Phase 2:** ~6-7 days  
- **Phase 3:** ~6-8 days
- **Grand Total:** ~16-20 days of focused development

---

## Appendix: Key Credentials & Config

- **Gingr API Key:** `[REDACTED Gingr API KEY]`
- **Gingr Subdomain:** `your-gingr-subdomain`
- **Gingr Location ID:** `1`
- **Supabase Location ID:** `11111111-1111-1111-1111-111111111111`
- **Boarding Type IDs:** 5 (Luxury Suite), 6 (Executive Room), 7 (Single Compartment), 8 (Double Compartment)
- **Bathing Type ID:** 4
- **Daycare Type IDs:** 1 (Full), 2 (Half), 3 (Eval)

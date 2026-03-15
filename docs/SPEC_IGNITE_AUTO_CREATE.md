# Spec: Auto-Create Client Records from Unmatched Ignite Leads

## Problem
When a new phone call or web form comes through Ignite from an unknown number (no match in Gingr), the lead is stored in `ignite_leads` with `match_status = "no_match"` but no client record is created. The user wants unmatched leads to automatically create a new client record in the app so they can be tracked, followed up, and managed in the Customer Lifecycle module.

## Current Behavior
1. Ignite email arrives → parsed by edge function → stored in `ignite_leads`
2. If phone/name/email matches a `gingr_owners` record → `matched_client_id = "g{gingr_id}"`
3. If no match → `match_status = "no_match"`, `matched_client_id = null`
4. No_match leads are invisible in the Customer Lifecycle page (not in any client list)

## Desired Behavior
1. When a lead is `no_match`, auto-create a lightweight client record
2. New record appears in the Leads tab of Customer Lifecycle with source "Ignite"
3. Client profile shows the Ignite lead data (phone, call recording, etc.)
4. If/when the client books through Gingr later, the record can be linked/merged

## Design Decisions Needed

### A. Where to store new client records?
**Option 1: `lite_clients` table (new)** — Purpose-built K9 Ops client table separate from Gingr. Allows clients who don't exist in Gingr.
- Pro: Clean separation, no risk of Gingr sync conflicts
- Con: Need to merge/reconcile when client eventually appears in Gingr

**Option 2: Extend `gingr_owners` with a flag** — Add `is_manual = true` column for non-Gingr clients
- Pro: One unified table, existing queries work
- Con: Pollutes Gingr sync data, risk of conflicts on next sync

**Option 3: In-memory via `lite_client_lifecycle`** — Store as lifecycle entries that the app hydrates as virtual clients
- Pro: No new tables needed
- Con: Fragile, loses data if lifecycle is cleared

**Recommendation: Option 1** — A dedicated `lite_clients` table. The app already has the pattern of merging multiple data sources.

### B. What data to populate?
From the Ignite lead:
- `first_name`, `last_name` (from caller name, reversed)
- `phone` (from caller number)
- `email` (from web form submissions, if available)
- `source` = "ignite"
- `source_date` = lead timestamp
- `ignite_lead_id` = link back to the ignite_leads row
- `lifecycle_stage` = "lead" (auto-set to Leads tab)

### C. Follow-up date logic
- Auto-set follow-up to +1 day from lead arrival
- Source = "ignite" so it appears in the Ignite filter

## Implementation Plan

### 1. Database: Create `lite_clients` table
```sql
CREATE TABLE lite_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL REFERENCES locations(id),
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  email TEXT,
  source TEXT DEFAULT 'manual',
  source_date TIMESTAMPTZ,
  notes TEXT,
  ignite_lead_id UUID REFERENCES ignite_leads(id),
  gingr_owner_id INTEGER REFERENCES gingr_owners(id),
  lifecycle_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 2. Edge Function: Auto-create on no_match
After inserting into `ignite_leads` with `no_match`:
- Insert into `lite_clients` with the lead data
- Set `ignite_lead_id` to link them
- Set `lifecycle_data.conversion.source = "ignite"`
- Set `lifecycle_data.conversion.followUpDate = tomorrow`

### 3. Frontend: Merge `lite_clients` into client list
In `useGingrData.js` or `KolApp.jsx`:
- Fetch `lite_clients` for the location
- Transform to the same client shape as Gingr owners
- Merge into `data.clients` with `id = "lc_{uuid}"`
- These clients appear in Leads tab due to lifecycle source

### 4. Frontend: Client Detail for lite_clients
- Same detail page, but with limited info (no Gingr-specific data)
- "Push to Gingr" button creates the client in Gingr and links records
- Show Ignite lead data on the Ignite tab

### 5. Dedup/Merge
When a Gingr sync brings in a client that matches a `lite_client`:
- Match by phone number
- Merge lifecycle data
- Mark `lite_client.gingr_owner_id` to link them
- Hide the `lite_client` in favor of the Gingr record

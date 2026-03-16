# Room Count Investigation — Complete Findings

## Date: March 16, 2026

## Problem
The `compute_dashboard_metrics()` SQL function hardcodes `v_total_rooms := 28` as a fallback. The function queries `setting_key = 'room_config'` but the actual data is stored under `setting_key = 'room_names'` — so the query always misses and falls back to 28.

## Root Cause
**SQL bug**: The function queries the wrong setting_key.
```sql
-- BROKEN (current production)
WHERE s.setting_key = 'room_config'

-- FIXED (correct key)
WHERE s.setting_key = 'room_names'
```

Additionally, the JSON parsing was wrong:
```sql
-- BROKEN: tries to descend into a 'room_names' sub-key that doesn't exist
jsonb_each(s.setting_value->'room_names')

-- FIXED: setting_value IS the room map directly
jsonb_each(s.setting_value)
```

## Current Room Configuration (lite_settings)
The `room_names` setting contains **65 rooms** across 4 types:

| Type | Count | Room Names |
|------|-------|------------|
| Luxury Suite | 8 | Luxury - 101 through 108 |
| Executive Room | 33 | Executive - 201–212, 301–306, 401–410, 501–505 |
| Double Compartment | 8 | Double - 1C through 8C |
| Single Compartment | 16 | Single - 1A–8A, 1B–8B |

## Gingr API Investigation

### Endpoints Tested
| Endpoint | Status | Has Room Data? |
|----------|--------|----------------|
| `/reservation_types` | ✅ 200 | Has `capacity_by_lodging` flag but NO room list |
| `/back_of_house` | ✅ 200 | Has `run_name` and `area_name` per reservation |
| `/reservation_widget_data` | ✅ 200 | Has active counts per type, no room details |
| `/existing_reservation_estimate` | ✅ 200 | Has location details, no lodging list |
| `/reservations` (POST) | ✅ 200 | No room assignment fields |
| `/booking_categories` | ✅ 200 | Category labels only |
| `/lodgings` | ❌ 404 | Does not exist |
| `/runs` | ❌ 404 | Does not exist |
| `/rooms` | ❌ 404 | Does not exist |
| `/areas` | ❌ 404 | Does not exist |
| `/get_areas` | ❌ 404 | Does not exist |
| `/get_lodgings` | ❌ 404 | Does not exist |
| `/manage_areas_lodgings` | ❌ 404 | Does not exist |
| `/availability` | ❌ 404 | Does not exist |
| `/capacity` | ❌ 404 | Does not exist |

### Key Finding: No Dedicated Lodging API Endpoint
Gingr manages Areas and Lodgings through their admin UI (Admin → Manage Areas/Lodgings) but does NOT expose a read-only API endpoint to list all configured lodgings. This is confirmed by the official Gingr API Reference at https://support.gingrapp.com/hc/en-us/articles/25722122517517

### back_of_house Endpoint (Best Available)
The `back_of_house` endpoint returns today's checking_in/checking_out with `run_name` and `area_name`:
- **Requires**: `?key=...&location_id=1&full_day=true&type_ids[]=5&type_ids[]=6&type_ids[]=7&type_ids[]=8`
- **Limitation**: Only shows rooms that have activity TODAY. Empty rooms are never listed.
- Today's data (March 16) showed 20 unique rooms — all matched the `room_names` config.

### reservation_widget_data — Occupancy Cross-Check (March 15)
| Type | Active Animals | Configured Rooms |
|------|---------------|-----------------|
| Double Compartment | 9 | 8 |
| Luxury Suite | 10 | 8 |
| Executive Room | 42 | 33 |
| Single Compartment | 6 | 16 |
| **TOTAL** | **67** | **65** |

Active > Rooms because multiple dogs from the same family share a room (board_together functionality).

## Recommendation

### Immediate Fix (Deploy Now)
Fix the SQL bug — change `room_config` → `room_names` and fix the JSON parsing. This gives us 65 rooms instead of 28. **Local edits already made**, just need deployment.

### Dynamic Room Count Strategy
Since there's no Gingr API to enumerate all lodgings, we have two options:

**Option A: Nightly back_of_house Accumulator (Recommended)**
- Run a nightly sync that calls `back_of_house` with `full_day=true`
- Accumulate unique `run_name` values into a `gingr_lodgings` table
- Over ~30 days of operation, this will discover virtually all active rooms
- Use this table as the source of truth for room count
- Pros: Fully dynamic, auto-discovers new rooms
- Cons: Takes time to build complete picture, won't capture permanently empty rooms

**Option B: Use room_names Setting as Source of Truth (Current)**
- The 65-room configuration was manually set from Gingr's actual room setup
- Fix the SQL to correctly read it → immediate fix
- Add a back_of_house validation check that warns if it sees unknown rooms
- Pros: Immediate, complete
- Cons: Manual maintenance if rooms are added/removed in Gingr

### Files Changed (Local, Not Deployed)
1. `supabase/migrations/20260316_dashboard_metrics.sql` — Fixed room_names query
2. `supabase/migrations/20260316_financial_reporting_fixes.sql` — Same fix  
3. `src/hooks/useDashboardMetrics.js` — Removed `|| 28` fallback, added `Math.min(..., 100)` occupancy cap

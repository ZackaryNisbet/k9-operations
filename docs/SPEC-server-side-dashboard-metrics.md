# Server-Side Dashboard Metrics — Technical Spec

## Problem
The dashboard computes all metrics client-side by iterating 136,560 reservations in JavaScript.
Changing timeframes triggers full recomputation (~5-15s lag). This is architecturally wrong.

## Solution
Pre-compute all dashboard metrics **server-side in Postgres**, store in a daily metrics table,
and refactor the dashboard to be a **pure view layer** that reads pre-computed rows.

---

## 1. New Supabase Table: `dashboard_metrics_daily`

One row per location per day. Contains every metric the dashboard currently computes.

```sql
CREATE TABLE IF NOT EXISTS dashboard_metrics_daily (
  id              BIGSERIAL PRIMARY KEY,
  location_id     TEXT NOT NULL,
  metric_date     DATE NOT NULL,

  -- ═══ Today's Snapshot (computed from gingr_reservations) ═══
  dogs_expected       INT DEFAULT 0,    -- arriving + in-house
  dogs_in_house       INT DEFAULT 0,    -- checked-in, checkIn <= date, checkOut >= date
  boarding_in_house   INT DEFAULT 0,
  daycare_in_house    INT DEFAULT 0,
  dogs_going_home     INT DEFAULT 0,    -- checked-in, checkOut = date
  dogs_checked_out    INT DEFAULT 0,    -- checkOut = date, status = checked-out
  dogs_arriving       INT DEFAULT 0,    -- checkIn = date
  occupancy_pct       INT DEFAULT 0,    -- (boarding_occupied / total_rooms) * 100
  total_room_count    INT DEFAULT 0,
  bookings_today      INT DEFAULT 0,    -- checkIn = date, not cancelled
  tours_today         INT DEFAULT 0,    -- type = tour, checkIn = date
  evals_today         INT DEFAULT 0,    -- type = evaluation, checkIn = date

  -- ═══ Accrual Revenue (per-night rate spread across stay) ═══
  accrual_boarding_revenue  NUMERIC(12,2) DEFAULT 0,
  accrual_daycare_revenue   NUMERIC(12,2) DEFAULT 0,
  accrual_total_revenue     NUMERIC(12,2) DEFAULT 0,
  accrual_rooms_occupied    INT DEFAULT 0,

  -- ═══ Cash-Basis Revenue (transaction price on checkIn date) ═══
  cash_total_revenue    NUMERIC(12,2) DEFAULT 0,
  cash_transaction_count INT DEFAULT 0,
  cash_boarding_revenue NUMERIC(12,2) DEFAULT 0,
  cash_daycare_revenue  NUMERIC(12,2) DEFAULT 0,

  -- ═══ Refunds & Discounts ═══
  refund_count        INT DEFAULT 0,
  refund_total        NUMERIC(12,2) DEFAULT 0,
  discounted_count    INT DEFAULT 0,
  discount_total      NUMERIC(12,2) DEFAULT 0,

  -- ═══ Customer Lifecycle (snapshot at computation time) ═══
  remaining_leads     INT DEFAULT 0,
  remaining_at_risk   INT DEFAULT 0,
  today_outreaches    INT DEFAULT 0,
  today_conversions   INT DEFAULT 0,
  first_time_payers   INT DEFAULT 0,
  today_new_leads     INT DEFAULT 0,
  conversion_rate     NUMERIC(5,2) DEFAULT 0,
  avg_ltv             NUMERIC(12,2) DEFAULT 0,
  total_ltv           NUMERIC(14,2) DEFAULT 0,
  spending_clients    INT DEFAULT 0,

  -- ═══ Ops/Services (today only — from lite_daily_ops) ═══
  baths_total         INT DEFAULT 0,
  baths_done          INT DEFAULT 0,
  pp_total            INT DEFAULT 0,
  pp_done             INT DEFAULT 0,
  ice_cream_total     INT DEFAULT 0,
  ice_cream_done      INT DEFAULT 0,

  -- ═══ Checklist progress (from lite_daily_ops) ═══
  opening_pct         INT DEFAULT 0,
  closing_pct         INT DEFAULT 0,
  fe_pct              INT DEFAULT 0,
  be_pct              INT DEFAULT 0,
  room_clean_pct      INT DEFAULT 0,

  -- ═══ Metadata ═══
  computed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_dashboard_metrics UNIQUE (location_id, metric_date)
);

-- Index for fast range queries
CREATE INDEX IF NOT EXISTS idx_dashboard_metrics_loc_date
  ON dashboard_metrics_daily (location_id, metric_date DESC);
```

---

## 2. Postgres RPC: `compute_dashboard_metrics`

A Postgres function that computes all metrics for a given date directly from the existing
Supabase tables (`gingr_reservations`, `gingr_owners`, `lite_client_lifecycle`, etc.)
and upserts into `dashboard_metrics_daily`.

This is pure SQL — runs in milliseconds on Postgres, no network round-trips.

**Key computations:**
- **Occupancy/Snapshot**: `SELECT COUNT(*) FROM gingr_reservations WHERE ...` with date filters
- **Accrual Revenue**: For each boarding reservation overlapping the date, compute per-night rate
  and attribute to each night. Uses the same `countNights` logic but in SQL.
- **Cash Revenue**: `SUM(transaction.price)` grouped by `start_date::DATE`
- **Lifecycle**: Joins `gingr_owners`, `lite_client_lifecycle`, and the existing `get_client_stats` RPC
- **Ops/Checklists**: Reads from `lite_daily_ops` where date matches

The function accepts a date range so we can backfill historical data or recompute a single day.

```sql
-- Signature
CREATE OR REPLACE FUNCTION compute_dashboard_metrics(
  p_location_id TEXT,
  p_date_from DATE DEFAULT CURRENT_DATE,
  p_date_to DATE DEFAULT CURRENT_DATE
) RETURNS VOID
```

---

## 3. Integration with Gingr Sync

After the existing `gingr-sync` Edge Function finishes syncing raw data, it calls
`compute_dashboard_metrics` for today's date (and yesterday, to catch late checkouts).

```
gingr-sync completes → RPC call: compute_dashboard_metrics(location_id, yesterday, today)
```

This adds ~100-200ms to the sync cycle (pure Postgres aggregation), negligible.

**One-time backfill**: Run `compute_dashboard_metrics(location_id, '2020-01-01', today)`
once after deploying the migration. This pre-computes all historical metrics.

---

## 4. Dashboard Refactor

### What changes:
- **DashboardContent** drops all `useMemo` computation hooks
- New hook: `useDashboardMetrics(locationId, dateFrom, dateTo)` that:
  1. Queries `dashboard_metrics_daily` with date range filter
  2. Aggregates rows (SUM revenues, AVG occupancy, etc.) for the selected range
  3. Returns a flat metrics object — ready to render
- Timeframe switching = new Supabase query returning ~1-365 rows of pre-computed data
- **No 136K iteration. No useMemo. No lag.**

### What stays the same:
- The grid layout, cell components, charts, animations — all unchanged
- The visual design, timeframe selector, prior-period comparison — all unchanged
- The data accuracy — identical computations, just done in Postgres instead of JS

### Refresh UX:
- Top-right shows: "Updated 3 min ago · Next refresh in 12 min"
- Manual refresh button: triggers `gingr-sync` → recomputes metrics → dashboard re-fetches
- Auto-refresh: the existing 15-min sync timer continues; after sync completes it re-fetches
  the dashboard metrics (not the raw data)

---

## 5. What the Client Still Loads

After this change, `useGingrData` still loads clients, dogs, etc. for other pages (lifecycle,
ops hub, client detail). But **DashboardPage no longer reads `data.reservations` at all**.
The dashboard reads exclusively from `dashboard_metrics_daily`.

Pages that still need client-side data:
- Lifecycle/Funnel page (client list + filtering)
- Ops Hub (daily checklists, room assignments)
- Client Detail (individual reservation history)
- Checkout TV (live checked-in dogs)

The dashboard is the only page that attempted to aggregate 136K records client-side.
All other pages either work with filtered subsets or use server RPCs.

---

## 6. Migration Plan

1. **Deploy SQL migration**: Create `dashboard_metrics_daily` table + `compute_dashboard_metrics` RPC
2. **Run backfill**: `SELECT compute_dashboard_metrics('8ea382b0-...', '2020-01-01', CURRENT_DATE)`
3. **Update gingr-sync Edge Function**: Add RPC call after sync completes
4. **Deploy dashboard refactor**: New `useDashboardMetrics` hook + simplified DashboardContent
5. **Remove client-side computation**: Delete `metricsHelpers.js` compute functions used only by dashboard

Steps 1-3 are backward-compatible (old dashboard still works). Step 4 is the switchover.

---

## 7. Performance Characteristics

| Operation | Before | After |
|-----------|--------|-------|
| Dashboard initial load | 5-15s (136K JS iteration) | <200ms (Supabase query) |
| Timeframe change | 5-15s (full recomputation) | <100ms (new date range query) |
| Navbar interaction | 2-5s lag (re-render cascade) | 0ms (no data dep change) |
| 15-min sync impact | Triggers full recomputation | +100ms Postgres aggregation |
| Manual refresh | Full page recompute | ~2s (sync + recompute + fetch) |

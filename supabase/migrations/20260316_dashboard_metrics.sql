-- ============================================================================
-- Dashboard Metrics: Pre-computed daily metrics table + RPC
-- Eliminates client-side 136K reservation iteration.
-- Dashboard becomes a pure view layer reading pre-computed rows.
-- ============================================================================

-- ─── 1. Table ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dashboard_metrics_daily (
  id              BIGSERIAL PRIMARY KEY,
  location_id     TEXT NOT NULL,
  metric_date     DATE NOT NULL,

  -- ═══ Today's Snapshot ═══
  dogs_expected       INT DEFAULT 0,
  dogs_in_house       INT DEFAULT 0,
  boarding_in_house   INT DEFAULT 0,
  daycare_in_house    INT DEFAULT 0,
  dogs_going_home     INT DEFAULT 0,
  dogs_checked_out    INT DEFAULT 0,
  dogs_arriving       INT DEFAULT 0,
  occupancy_pct       INT DEFAULT 0,
  total_room_count    INT DEFAULT 0,
  bookings_today      INT DEFAULT 0,
  tours_today         INT DEFAULT 0,
  evals_today         INT DEFAULT 0,

  -- ═══ Accrual Revenue (per-night rate spread across stay) ═══
  accrual_boarding_revenue  NUMERIC(12,2) DEFAULT 0,
  accrual_daycare_revenue   NUMERIC(12,2) DEFAULT 0,
  accrual_total_revenue     NUMERIC(12,2) DEFAULT 0,
  accrual_rooms_occupied    INT DEFAULT 0,

  -- ═══ Cash-Basis Revenue (transaction price on start_date) ═══
  cash_total_revenue    NUMERIC(12,2) DEFAULT 0,
  cash_transaction_count INT DEFAULT 0,
  cash_boarding_revenue NUMERIC(12,2) DEFAULT 0,
  cash_daycare_revenue  NUMERIC(12,2) DEFAULT 0,

  -- ═══ Refunds & Discounts ═══
  refund_count        INT DEFAULT 0,
  refund_total        NUMERIC(12,2) DEFAULT 0,
  discounted_count    INT DEFAULT 0,
  discount_total      NUMERIC(12,2) DEFAULT 0,

  -- ═══ Outstanding Invoices (from gingr_owners.current_balance) ═══
  outstanding_invoice_count INT DEFAULT 0,
  outstanding_invoice_total NUMERIC(12,2) DEFAULT 0,

  -- ═══ Metadata ═══
  computed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_dashboard_metrics UNIQUE (location_id, metric_date)
);

CREATE INDEX IF NOT EXISTS idx_dashboard_metrics_loc_date
  ON dashboard_metrics_daily (location_id, metric_date DESC);


-- ─── 2. RPC: compute_dashboard_metrics ──────────────────────────────────────

CREATE OR REPLACE FUNCTION compute_dashboard_metrics(
  p_location_id TEXT,
  p_date_from DATE DEFAULT CURRENT_DATE,
  p_date_to DATE DEFAULT CURRENT_DATE
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  d DATE;
  v_total_rooms INT := 0;
  v_in_house INT;
  v_boarding_ih INT;
  v_daycare_ih INT;
  v_going_home INT;
  v_checked_out INT;
  v_arriving INT;
  v_pending INT;
  v_boarding_occupied INT;
  v_bookings INT;
  v_tours INT;
  v_evals INT;
  v_accrual_boarding NUMERIC(12,2);
  v_accrual_daycare NUMERIC(12,2);
  v_accrual_rooms INT;
  v_cash_total NUMERIC(12,2);
  v_cash_count INT;
  v_cash_boarding NUMERIC(12,2);
  v_cash_daycare NUMERIC(12,2);
  v_refund_count INT;
  v_refund_total NUMERIC(12,2);
  v_first_visit_evals INT;
  v_discounted_count INT;
  v_discount_total NUMERIC(12,2);
  v_outstanding_count INT;
  v_outstanding_total NUMERIC(12,2);
BEGIN
  -- Get total room count from lite_settings room_names
  -- The setting_value is a JSON object like {"Luxury Suite": [...], "Executive Room": [...], ...}
  -- Each key's value is an array of room name strings. Sum all array lengths = total rooms.
  BEGIN
    SELECT COALESCE(
      (SELECT SUM(jsonb_array_length(value))
       FROM lite_settings s, jsonb_each(s.setting_value)
       WHERE s.location_id = p_location_id
         AND s.setting_key = 'room_names'
      ),
      0
    ) INTO v_total_rooms;
  EXCEPTION WHEN OTHERS THEN
    v_total_rooms := 0;
  END;

  IF v_total_rooms IS NULL OR v_total_rooms = 0 THEN
    RAISE WARNING 'No room_names setting found for location %. Occupancy will be 0.', p_location_id;
    v_total_rooms := 1; -- Prevent division by zero but occupancy will be nonsensical — must configure rooms
  END IF;

  FOR d IN SELECT generate_series(p_date_from, p_date_to, '1 day'::interval)::DATE
  LOOP
    -- ═══ Snapshot metrics ═══
    SELECT
      COUNT(*) FILTER (WHERE
        r.check_in_date IS NOT NULL AND r.check_out_date IS NULL
        AND r.start_date::DATE <= d AND r.end_date::DATE >= d
        AND LOWER(r.reservation_type_name) NOT LIKE '%tour%'
      ),
      COUNT(*) FILTER (WHERE
        r.check_in_date IS NOT NULL AND r.check_out_date IS NULL
        AND r.start_date::DATE <= d AND r.end_date::DATE >= d
        AND (LOWER(r.reservation_type_name) LIKE '%boarding%' OR LOWER(r.reservation_type_name) LIKE '%lodging%'
             OR LOWER(r.reservation_type_name) LIKE '%overnight%' OR LOWER(r.reservation_type_name) LIKE '%suite%')
      ),
      COUNT(*) FILTER (WHERE
        r.check_in_date IS NOT NULL AND r.check_out_date IS NULL
        AND r.start_date::DATE <= d AND r.end_date::DATE >= d
        AND (LOWER(r.reservation_type_name) LIKE '%daycare%' OR LOWER(r.reservation_type_name) LIKE '%day care%'
             OR LOWER(r.reservation_type_name) LIKE '%day boarding%')
      ),
      COUNT(*) FILTER (WHERE
        r.check_in_date IS NOT NULL AND r.check_out_date IS NULL
        AND r.end_date::DATE = d
      ),
      COUNT(*) FILTER (WHERE
        r.check_out_date IS NOT NULL AND r.check_out_date::DATE = d
      ),
      COUNT(*) FILTER (WHERE
        r.start_date::DATE = d AND r.cancelled_date IS NULL
        AND LOWER(r.reservation_type_name) NOT LIKE '%tour%'
      ),
      -- PENDING: dogs scheduled for today that have NOT yet checked in
      COUNT(*) FILTER (WHERE
        r.start_date::DATE = d AND r.cancelled_date IS NULL
        AND r.check_in_date IS NULL
        AND LOWER(r.reservation_type_name) NOT LIKE '%tour%'
      ),
      COUNT(*) FILTER (WHERE
        r.check_in_date IS NOT NULL AND r.check_out_date IS NULL
        AND r.start_date::DATE <= d AND r.end_date::DATE > d
        AND (LOWER(r.reservation_type_name) LIKE '%boarding%' OR LOWER(r.reservation_type_name) LIKE '%lodging%'
             OR LOWER(r.reservation_type_name) LIKE '%overnight%' OR LOWER(r.reservation_type_name) LIKE '%suite%')
      ),
      COUNT(*) FILTER (WHERE r.created_date::DATE = d AND r.cancelled_date IS NULL AND LOWER(r.reservation_type_name) NOT LIKE '%tour%'),
      COUNT(*) FILTER (WHERE r.start_date::DATE = d AND LOWER(r.reservation_type_name) LIKE '%tour%'),
      COUNT(*) FILTER (WHERE r.start_date::DATE = d AND (LOWER(r.reservation_type_name) LIKE '%eval%' OR LOWER(r.reservation_type_name) LIKE '%assessment%'))
    INTO v_in_house, v_boarding_ih, v_daycare_ih, v_going_home, v_checked_out, v_arriving,
         v_pending, v_boarding_occupied, v_bookings, v_tours, v_evals
    FROM gingr_reservations r
    WHERE r.location_id = p_location_id
      AND r.cancelled_date IS NULL;

    -- ═══ First-visit evaluations: dogs whose first-ever non-cancelled non-tour
    -- reservation at this location starts on this day AND is a daycare type ═══
    SELECT COUNT(DISTINCT r.animal_gingr_id)
    INTO v_first_visit_evals
    FROM gingr_reservations r
    WHERE r.location_id = p_location_id
      AND r.cancelled_date IS NULL
      AND r.start_date::DATE = d
      AND (LOWER(r.reservation_type_name) LIKE '%daycare%' OR LOWER(r.reservation_type_name) LIKE '%day care%' OR LOWER(r.reservation_type_name) LIKE '%day boarding%')
      AND LOWER(r.reservation_type_name) NOT LIKE '%eval%'
      AND NOT EXISTS (
        SELECT 1 FROM gingr_reservations prev
        WHERE prev.location_id = p_location_id
          AND prev.animal_gingr_id = r.animal_gingr_id
          AND prev.cancelled_date IS NULL
          AND LOWER(prev.reservation_type_name) NOT LIKE '%tour%'
          AND prev.start_date::DATE < d
      );

    -- ═══ Accrual Revenue ═══
    SELECT
      COALESCE(SUM(
        CASE
          WHEN (LOWER(r.reservation_type_name) LIKE '%boarding%' OR LOWER(r.reservation_type_name) LIKE '%lodging%'
                OR LOWER(r.reservation_type_name) LIKE '%overnight%' OR LOWER(r.reservation_type_name) LIKE '%suite%')
               AND r.start_date::DATE <= d AND r.end_date::DATE > d
               AND GREATEST(1, r.end_date::DATE - r.start_date::DATE) > 0
          THEN COALESCE((r.transaction->>'price')::NUMERIC, (r.deposit->>'amount')::NUMERIC, 0)
               / GREATEST(1, r.end_date::DATE - r.start_date::DATE)
          ELSE 0
        END
      ), 0),
      COALESCE(SUM(
        CASE
          WHEN (LOWER(r.reservation_type_name) LIKE '%daycare%' OR LOWER(r.reservation_type_name) LIKE '%day care%')
               AND r.start_date::DATE = d
          THEN COALESCE((r.transaction->>'price')::NUMERIC, (r.deposit->>'amount')::NUMERIC, 0)
          ELSE 0
        END
      ), 0),
      COUNT(*) FILTER (WHERE
        (LOWER(r.reservation_type_name) LIKE '%boarding%' OR LOWER(r.reservation_type_name) LIKE '%lodging%'
         OR LOWER(r.reservation_type_name) LIKE '%overnight%' OR LOWER(r.reservation_type_name) LIKE '%suite%')
        AND r.start_date::DATE <= d AND r.end_date::DATE > d
      )
    INTO v_accrual_boarding, v_accrual_daycare, v_accrual_rooms
    FROM gingr_reservations r
    WHERE r.location_id = p_location_id
      AND r.cancelled_date IS NULL
      AND r.start_date::DATE <= d
      AND r.end_date::DATE >= d;

    -- ═══ Cash Revenue ═══
    -- FIX: cash_transaction_count now counts ALL non-cancelled reservations starting on this day,
    -- not just those with price > 0. Many reservations have price=0 (packages, multi-dog discounts)
    -- but are still valid transactions. Revenue sums still only count positive amounts.
    SELECT
      COALESCE(SUM(GREATEST(0, COALESCE((r.transaction->>'price')::NUMERIC, (r.deposit->>'amount')::NUMERIC, 0))), 0),
      COUNT(*),
      COALESCE(SUM(
        CASE WHEN (LOWER(r.reservation_type_name) LIKE '%boarding%' OR LOWER(r.reservation_type_name) LIKE '%lodging%'
                   OR LOWER(r.reservation_type_name) LIKE '%overnight%' OR LOWER(r.reservation_type_name) LIKE '%suite%')
          THEN GREATEST(0, COALESCE((r.transaction->>'price')::NUMERIC, (r.deposit->>'amount')::NUMERIC, 0))
          ELSE 0 END
      ), 0),
      COALESCE(SUM(
        CASE WHEN (LOWER(r.reservation_type_name) LIKE '%daycare%' OR LOWER(r.reservation_type_name) LIKE '%day care%')
          THEN GREATEST(0, COALESCE((r.transaction->>'price')::NUMERIC, (r.deposit->>'amount')::NUMERIC, 0))
          ELSE 0 END
      ), 0),
      -- FIX: Use correct Gingr field names: is_returned and refund_amount (not refund/refundAmount)
      COUNT(*) FILTER (WHERE (r.transaction->>'is_returned')::BOOLEAN = true
                          AND COALESCE((r.transaction->>'refund_amount')::NUMERIC, 0) > 0),
      COALESCE(SUM(
        CASE WHEN (r.transaction->>'is_returned')::BOOLEAN = true
          THEN GREATEST(0, COALESCE((r.transaction->>'refund_amount')::NUMERIC, 0))
          ELSE 0 END
      ), 0)
    INTO v_cash_total, v_cash_count, v_cash_boarding, v_cash_daycare, v_refund_count, v_refund_total
    FROM gingr_reservations r
    WHERE r.location_id = p_location_id
      AND r.cancelled_date IS NULL
      AND r.start_date::DATE = d;

    -- ═══ Discounts (rack-rate comparison) ═══
    -- Compares actual transaction price to expected rack rate per night.
    -- Rack rates: Luxury Suite=$95, Executive Room=$75, Double Compartment=$65, Single Compartment=$55
    -- A reservation is "discounted" if actual price < 98% of expected rack rate.
    SELECT
      COUNT(*),
      COALESCE(SUM(
        GREATEST(0,
          CASE
            WHEN LOWER(r.reservation_type_name) LIKE '%luxury%' THEN 95 * GREATEST(1, r.end_date::DATE - r.start_date::DATE)
            WHEN LOWER(r.reservation_type_name) LIKE '%executive%' THEN 75 * GREATEST(1, r.end_date::DATE - r.start_date::DATE)
            WHEN LOWER(r.reservation_type_name) LIKE '%double%' THEN 65 * GREATEST(1, r.end_date::DATE - r.start_date::DATE)
            WHEN LOWER(r.reservation_type_name) LIKE '%single%' THEN 55 * GREATEST(1, r.end_date::DATE - r.start_date::DATE)
            ELSE 0
          END
          - COALESCE((r.transaction->>'price')::NUMERIC, 0)
        )
      ), 0)
    INTO v_discounted_count, v_discount_total
    FROM gingr_reservations r
    WHERE r.location_id = p_location_id
      AND r.cancelled_date IS NULL
      AND r.start_date::DATE = d
      AND (LOWER(r.reservation_type_name) LIKE '%boarding%' OR LOWER(r.reservation_type_name) LIKE '%lodging%'
           OR LOWER(r.reservation_type_name) LIKE '%overnight%' OR LOWER(r.reservation_type_name) LIKE '%suite%')
      AND COALESCE((r.transaction->>'price')::NUMERIC, 0) > 0
      AND GREATEST(1, r.end_date::DATE - r.start_date::DATE) > 0
      AND COALESCE((r.transaction->>'price')::NUMERIC, 0) <
          0.98 * CASE
            WHEN LOWER(r.reservation_type_name) LIKE '%luxury%' THEN 95 * GREATEST(1, r.end_date::DATE - r.start_date::DATE)
            WHEN LOWER(r.reservation_type_name) LIKE '%executive%' THEN 75 * GREATEST(1, r.end_date::DATE - r.start_date::DATE)
            WHEN LOWER(r.reservation_type_name) LIKE '%double%' THEN 65 * GREATEST(1, r.end_date::DATE - r.start_date::DATE)
            WHEN LOWER(r.reservation_type_name) LIKE '%single%' THEN 55 * GREATEST(1, r.end_date::DATE - r.start_date::DATE)
            ELSE 0
          END;

    -- ═══ Outstanding Invoices (snapshot: owners with current_balance > 0) ═══
    -- This is a point-in-time snapshot, same value for every day in the range.
    -- Queries gingr_owners.current_balance which is synced from Gingr API.
    SELECT
      COUNT(*),
      COALESCE(SUM(current_balance), 0)
    INTO v_outstanding_count, v_outstanding_total
    FROM gingr_owners
    WHERE location_id = p_location_id
      AND current_balance > 0;

    -- ═══ Upsert row ═══
    INSERT INTO dashboard_metrics_daily (
      location_id, metric_date,
      dogs_expected, dogs_in_house, boarding_in_house, daycare_in_house,
      dogs_going_home, dogs_checked_out, dogs_arriving,
      occupancy_pct, total_room_count, bookings_today, tours_today, evals_today,
      accrual_boarding_revenue, accrual_daycare_revenue, accrual_total_revenue, accrual_rooms_occupied,
      cash_total_revenue, cash_transaction_count, cash_boarding_revenue, cash_daycare_revenue,
      refund_count, refund_total, discounted_count, discount_total,
      outstanding_invoice_count, outstanding_invoice_total,
      computed_at
    ) VALUES (
      p_location_id, d,
      v_pending, v_in_house, v_boarding_ih, v_daycare_ih,
      v_going_home, v_checked_out, v_arriving,
      CASE WHEN v_total_rooms > 0 THEN ROUND(v_boarding_occupied::NUMERIC / v_total_rooms * 100)::INT ELSE 0 END,
      v_total_rooms, v_bookings, v_tours, v_evals + v_first_visit_evals,
      v_accrual_boarding, v_accrual_daycare, v_accrual_boarding + v_accrual_daycare, v_accrual_rooms,
      v_cash_total, v_cash_count, v_cash_boarding, v_cash_daycare,
      v_refund_count, v_refund_total, v_discounted_count, v_discount_total,
      v_outstanding_count, v_outstanding_total,
      NOW()
    )
    ON CONFLICT (location_id, metric_date)
    DO UPDATE SET
      dogs_expected = EXCLUDED.dogs_expected,
      dogs_in_house = EXCLUDED.dogs_in_house,
      boarding_in_house = EXCLUDED.boarding_in_house,
      daycare_in_house = EXCLUDED.daycare_in_house,
      dogs_going_home = EXCLUDED.dogs_going_home,
      dogs_checked_out = EXCLUDED.dogs_checked_out,
      dogs_arriving = EXCLUDED.dogs_arriving,
      occupancy_pct = EXCLUDED.occupancy_pct,
      total_room_count = EXCLUDED.total_room_count,
      bookings_today = EXCLUDED.bookings_today,
      tours_today = EXCLUDED.tours_today,
      evals_today = EXCLUDED.evals_today,
      accrual_boarding_revenue = EXCLUDED.accrual_boarding_revenue,
      accrual_daycare_revenue = EXCLUDED.accrual_daycare_revenue,
      accrual_total_revenue = EXCLUDED.accrual_total_revenue,
      accrual_rooms_occupied = EXCLUDED.accrual_rooms_occupied,
      cash_total_revenue = EXCLUDED.cash_total_revenue,
      cash_transaction_count = EXCLUDED.cash_transaction_count,
      cash_boarding_revenue = EXCLUDED.cash_boarding_revenue,
      cash_daycare_revenue = EXCLUDED.cash_daycare_revenue,
      refund_count = EXCLUDED.refund_count,
      refund_total = EXCLUDED.refund_total,
      discounted_count = EXCLUDED.discounted_count,
      discount_total = EXCLUDED.discount_total,
      outstanding_invoice_count = EXCLUDED.outstanding_invoice_count,
      outstanding_invoice_total = EXCLUDED.outstanding_invoice_total,
      computed_at = EXCLUDED.computed_at;

  END LOOP;
END;
$$;

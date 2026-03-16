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
  v_total_rooms INT := 28;
  v_in_house INT;
  v_boarding_ih INT;
  v_daycare_ih INT;
  v_going_home INT;
  v_checked_out INT;
  v_arriving INT;
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
BEGIN
  -- Get total room count from lite_settings room_config
  BEGIN
    SELECT COALESCE(
      (SELECT SUM(jsonb_array_length(value))
       FROM lite_settings s, jsonb_each(s.setting_value->'room_names')
       WHERE s.location_id = p_location_id
         AND s.setting_key = 'room_config'
      ),
      28
    ) INTO v_total_rooms;
  EXCEPTION WHEN OTHERS THEN
    v_total_rooms := 28;
  END;

  IF v_total_rooms IS NULL OR v_total_rooms = 0 THEN
    v_total_rooms := 28;
  END IF;

  FOR d IN SELECT generate_series(p_date_from, p_date_to, '1 day'::interval)::DATE
  LOOP
    -- ═══ Snapshot metrics ═══
    SELECT
      COUNT(*) FILTER (WHERE
        r.check_in_date IS NOT NULL AND r.check_out_date IS NULL
        AND r.start_date::DATE <= d AND r.end_date::DATE >= d
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
      ),
      COUNT(*) FILTER (WHERE
        r.check_in_date IS NOT NULL AND r.check_out_date IS NULL
        AND r.start_date::DATE <= d AND r.end_date::DATE > d
        AND (LOWER(r.reservation_type_name) LIKE '%boarding%' OR LOWER(r.reservation_type_name) LIKE '%lodging%'
             OR LOWER(r.reservation_type_name) LIKE '%overnight%' OR LOWER(r.reservation_type_name) LIKE '%suite%')
      ),
      COUNT(*) FILTER (WHERE r.start_date::DATE = d AND r.cancelled_date IS NULL),
      COUNT(*) FILTER (WHERE r.start_date::DATE = d AND LOWER(r.reservation_type_name) LIKE '%tour%'),
      COUNT(*) FILTER (WHERE r.start_date::DATE = d AND (LOWER(r.reservation_type_name) LIKE '%eval%' OR LOWER(r.reservation_type_name) LIKE '%assessment%'))
    INTO v_in_house, v_boarding_ih, v_daycare_ih, v_going_home, v_checked_out, v_arriving,
         v_boarding_occupied, v_bookings, v_tours, v_evals
    FROM gingr_reservations r
    WHERE r.location_id = p_location_id
      AND r.cancelled_date IS NULL;

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
    SELECT
      COALESCE(SUM(GREATEST(0, COALESCE((r.transaction->>'price')::NUMERIC, (r.deposit->>'amount')::NUMERIC, 0))), 0),
      COUNT(*) FILTER (WHERE COALESCE((r.transaction->>'price')::NUMERIC, (r.deposit->>'amount')::NUMERIC, 0) > 0),
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
      COUNT(*) FILTER (WHERE COALESCE((r.transaction->>'refund')::NUMERIC, (r.transaction->>'refundAmount')::NUMERIC, 0) > 0),
      COALESCE(SUM(GREATEST(0, COALESCE((r.transaction->>'refund')::NUMERIC, (r.transaction->>'refundAmount')::NUMERIC, 0))), 0)
    INTO v_cash_total, v_cash_count, v_cash_boarding, v_cash_daycare, v_refund_count, v_refund_total
    FROM gingr_reservations r
    WHERE r.location_id = p_location_id
      AND r.cancelled_date IS NULL
      AND r.start_date::DATE = d;

    -- ═══ Upsert row ═══
    INSERT INTO dashboard_metrics_daily (
      location_id, metric_date,
      dogs_expected, dogs_in_house, boarding_in_house, daycare_in_house,
      dogs_going_home, dogs_checked_out, dogs_arriving,
      occupancy_pct, total_room_count, bookings_today, tours_today, evals_today,
      accrual_boarding_revenue, accrual_daycare_revenue, accrual_total_revenue, accrual_rooms_occupied,
      cash_total_revenue, cash_transaction_count, cash_boarding_revenue, cash_daycare_revenue,
      refund_count, refund_total, discounted_count, discount_total,
      computed_at
    ) VALUES (
      p_location_id, d,
      v_arriving + v_in_house, v_in_house, v_boarding_ih, v_daycare_ih,
      v_going_home, v_checked_out, v_arriving,
      CASE WHEN v_total_rooms > 0 THEN ROUND(v_boarding_occupied::NUMERIC / v_total_rooms * 100)::INT ELSE 0 END,
      v_total_rooms, v_bookings, v_tours, v_evals,
      v_accrual_boarding, v_accrual_daycare, v_accrual_boarding + v_accrual_daycare, v_accrual_rooms,
      v_cash_total, v_cash_count, v_cash_boarding, v_cash_daycare,
      v_refund_count, v_refund_total, 0, 0,
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
      computed_at = EXCLUDED.computed_at;

  END LOOP;
END;
$$;

-- RPC: get_client_stats
-- Returns one row per owner with all reservation stats pre-computed in Postgres.
-- Replaces fetching 147K+ reservation rows to the browser.

CREATE OR REPLACE FUNCTION get_client_stats(p_location_id TEXT)
RETURNS TABLE (
  owner_gingr_id TEXT,
  total_res BIGINT,
  total_spent NUMERIC,
  daycare_count BIGINT,
  boarding_count BIGINT,
  eval_count BIGINT,
  tour_count BIGINT,
  last_res_date TEXT,
  next_res_date TEXT,
  has_real_booking BOOLEAN,
  has_upcoming BOOLEAN,
  post_eval_appts BIGINT,
  post_tour_appts BIGINT
)
LANGUAGE sql STABLE
AS $$
  WITH today AS (
    SELECT CURRENT_DATE AS td
  ),
  -- Classify reservation types using same logic as frontend classifyReservationType
  classified AS (
    SELECT
      r.owner_gingr_id,
      r.start_date,
      r.end_date,
      r.check_in_date,
      r.check_out_date,
      r.cancelled_date,
      COALESCE((r.transaction->>'price')::NUMERIC, (r.deposit->>'amount')::NUMERIC, 0) AS price,
      r.reservation_type_name,
      CASE
        WHEN LOWER(r.reservation_type_name) LIKE '%daycare%' OR LOWER(r.reservation_type_name) LIKE '%day care%' THEN 'daycare'
        WHEN LOWER(r.reservation_type_name) LIKE '%boarding%' OR LOWER(r.reservation_type_name) LIKE '%lodging%'
             OR LOWER(r.reservation_type_name) LIKE '%overnight%' OR LOWER(r.reservation_type_name) LIKE '%suite%' THEN 'boarding'
        WHEN LOWER(r.reservation_type_name) LIKE '%eval%' OR LOWER(r.reservation_type_name) LIKE '%assessment%' THEN 'evaluation'
        WHEN LOWER(r.reservation_type_name) LIKE '%tour%' THEN 'tour'
        WHEN LOWER(r.reservation_type_name) LIKE '%grooming%' OR LOWER(r.reservation_type_name) LIKE '%groom%'
             OR LOWER(r.reservation_type_name) LIKE '%bath%' THEN 'grooming'
        ELSE 'other'
      END AS res_type,
      -- Status classification
      CASE
        WHEN r.cancelled_date IS NOT NULL THEN 'cancelled'
        WHEN r.check_in_date IS NOT NULL AND r.check_out_date IS NOT NULL THEN 'completed'
        WHEN r.check_in_date IS NOT NULL AND r.check_out_date IS NULL THEN 'checked_in'
        WHEN r.start_date IS NOT NULL AND r.start_date::DATE >= CURRENT_DATE THEN 'upcoming'
        ELSE 'completed'
      END AS res_status
    FROM gingr_reservations r
    WHERE r.location_id = p_location_id
      AND r.cancelled_date IS NULL
  ),
  -- First eval and tour dates per owner (for post-eval/tour counting)
  first_eval AS (
    SELECT owner_gingr_id, MIN(start_date::DATE) AS first_eval_date
    FROM classified WHERE res_type = 'evaluation'
    GROUP BY owner_gingr_id
  ),
  first_tour AS (
    SELECT owner_gingr_id, MIN(start_date::DATE) AS first_tour_date
    FROM classified WHERE res_type = 'tour'
    GROUP BY owner_gingr_id
  ),
  stats AS (
    SELECT
      c.owner_gingr_id,
      COUNT(*) AS total_res,
      COALESCE(SUM(c.price), 0) AS total_spent,
      COUNT(*) FILTER (WHERE c.res_type = 'daycare') AS daycare_count,
      COUNT(*) FILTER (WHERE c.res_type = 'boarding') AS boarding_count,
      COUNT(*) FILTER (WHERE c.res_type = 'evaluation') AS eval_count,
      COUNT(*) FILTER (WHERE c.res_type = 'tour') AS tour_count,
      MAX(c.start_date::DATE) FILTER (WHERE c.start_date::DATE <= CURRENT_DATE) AS last_res_raw,
      MIN(c.start_date::DATE) FILTER (WHERE c.start_date::DATE >= CURRENT_DATE AND c.res_status = 'upcoming') AS next_res_raw,
      BOOL_OR(c.res_type NOT IN ('tour', 'evaluation')) AS has_real_booking,
      BOOL_OR(c.start_date::DATE >= CURRENT_DATE AND c.res_status = 'upcoming' AND c.res_type NOT IN ('tour', 'evaluation')) AS has_upcoming,
      COUNT(*) FILTER (WHERE fe.first_eval_date IS NOT NULL AND c.start_date::DATE > fe.first_eval_date) AS post_eval_appts,
      COUNT(*) FILTER (WHERE ft.first_tour_date IS NOT NULL AND c.start_date::DATE > ft.first_tour_date) AS post_tour_appts
    FROM classified c
    LEFT JOIN first_eval fe ON fe.owner_gingr_id = c.owner_gingr_id
    LEFT JOIN first_tour ft ON ft.owner_gingr_id = c.owner_gingr_id
    GROUP BY c.owner_gingr_id
  )
  SELECT
    s.owner_gingr_id,
    s.total_res,
    s.total_spent,
    s.daycare_count,
    s.boarding_count,
    s.eval_count,
    s.tour_count,
    COALESCE(TO_CHAR(s.last_res_raw, 'YYYY-MM-DD'), '') AS last_res_date,
    COALESCE(TO_CHAR(s.next_res_raw, 'YYYY-MM-DD'), '') AS next_res_date,
    COALESCE(s.has_real_booking, FALSE) AS has_real_booking,
    COALESCE(s.has_upcoming, FALSE) AS has_upcoming,
    s.post_eval_appts,
    s.post_tour_appts
  FROM stats s;
$$;

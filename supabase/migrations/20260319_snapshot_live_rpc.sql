-- Lightweight RPC for 10-second live polling — only snapshot counts, no revenue.
-- Returns: expected, in_house, boarding, daycare, going_home, occupancy_pct,
--          new_bookings, tours, evals
-- Expected = pending arrivals (scheduled today, not yet checked in)

CREATE OR REPLACE FUNCTION snapshot_live(p_location_id TEXT)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  d DATE := CURRENT_DATE;
  v_total_rooms INT;
  result JSON;
BEGIN
  -- Room count
  BEGIN
    SELECT COALESCE(
      (SELECT SUM(jsonb_array_length(value))
       FROM lite_settings s, jsonb_each(s.setting_value)
       WHERE s.location_id = p_location_id AND s.setting_key = 'room_names'),
      0
    ) INTO v_total_rooms;
  EXCEPTION WHEN OTHERS THEN
    v_total_rooms := 0;
  END;
  IF v_total_rooms IS NULL OR v_total_rooms = 0 THEN v_total_rooms := 1; END IF;

  SELECT json_build_object(
    'expected', COUNT(*) FILTER (WHERE
      r.start_date::DATE = d AND r.cancelled_date IS NULL
      AND r.check_in_date IS NULL
      AND LOWER(r.reservation_type_name) NOT LIKE '%tour%'
    ),
    'in_house', COUNT(*) FILTER (WHERE
      r.check_in_date IS NOT NULL AND r.check_out_date IS NULL
      AND r.start_date::DATE <= d AND r.end_date::DATE >= d
      AND LOWER(r.reservation_type_name) NOT LIKE '%tour%'
    ),
    'boarding', COUNT(*) FILTER (WHERE
      r.check_in_date IS NOT NULL AND r.check_out_date IS NULL
      AND r.start_date::DATE <= d AND r.end_date::DATE >= d
      AND (LOWER(r.reservation_type_name) LIKE '%boarding%' OR LOWER(r.reservation_type_name) LIKE '%lodging%'
           OR LOWER(r.reservation_type_name) LIKE '%overnight%' OR LOWER(r.reservation_type_name) LIKE '%suite%')
    ),
    'daycare', COUNT(*) FILTER (WHERE
      r.check_in_date IS NOT NULL AND r.check_out_date IS NULL
      AND r.start_date::DATE <= d AND r.end_date::DATE >= d
      AND (LOWER(r.reservation_type_name) LIKE '%daycare%' OR LOWER(r.reservation_type_name) LIKE '%day care%'
           OR LOWER(r.reservation_type_name) LIKE '%day boarding%')
    ),
    'going_home', COUNT(*) FILTER (WHERE
      r.check_in_date IS NOT NULL AND r.check_out_date IS NULL
      AND r.end_date::DATE = d
    ),
    'occupancy_pct', CASE WHEN v_total_rooms > 0 THEN ROUND(
      COUNT(*) FILTER (WHERE
        r.check_in_date IS NOT NULL AND r.check_out_date IS NULL
        AND r.start_date::DATE <= d AND r.end_date::DATE > d
        AND (LOWER(r.reservation_type_name) LIKE '%boarding%' OR LOWER(r.reservation_type_name) LIKE '%lodging%'
             OR LOWER(r.reservation_type_name) LIKE '%overnight%' OR LOWER(r.reservation_type_name) LIKE '%suite%')
      )::NUMERIC / v_total_rooms * 100
    )::INT ELSE 0 END,
    'new_bookings', COUNT(*) FILTER (WHERE
      r.created_date::DATE = d AND r.cancelled_date IS NULL
      AND LOWER(r.reservation_type_name) NOT LIKE '%tour%'
    ),
    'tours', COUNT(*) FILTER (WHERE
      r.start_date::DATE = d
      AND LOWER(r.reservation_type_name) LIKE '%tour%'
    ),
    'evals', COUNT(*) FILTER (WHERE
      r.start_date::DATE = d
      AND (LOWER(r.reservation_type_name) LIKE '%eval%' OR LOWER(r.reservation_type_name) LIKE '%assessment%')
    )
  ) INTO result
  FROM gingr_reservations r
  WHERE r.location_id = p_location_id
    AND r.cancelled_date IS NULL;

  RETURN result;
END;
$$;

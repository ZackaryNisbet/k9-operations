-- Add the live dashboard fields needed for operational card copy:
-- arrival/departure boarding-vs-daycare splits and occupied room numerator.

CREATE OR REPLACE FUNCTION public.snapshot_live(p_location_id TEXT)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  d DATE := CURRENT_DATE;
  v_total_rooms INT;
  v_new_leads INT;
  v_first_time_spenders INT;
  result JSON;
BEGIN
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
  IF v_total_rooms IS NULL THEN v_total_rooms := 0; END IF;

  SELECT COUNT(DISTINCT r.owner_gingr_id) INTO v_new_leads
  FROM gingr_reservations r
  WHERE r.location_id = p_location_id
    AND r.cancelled_date IS NULL
    AND r.source_missing_at IS NULL
    AND r.start_date::DATE = d
    AND NOT EXISTS (
      SELECT 1 FROM gingr_reservations prev
      WHERE prev.location_id = p_location_id
        AND prev.owner_gingr_id = r.owner_gingr_id
        AND prev.cancelled_date IS NULL
        AND prev.source_missing_at IS NULL
        AND prev.start_date::DATE < d
    );

  SELECT COUNT(DISTINCT r.animal_gingr_id) INTO v_first_time_spenders
  FROM gingr_reservations r
  WHERE r.location_id = p_location_id
    AND r.cancelled_date IS NULL
    AND r.source_missing_at IS NULL
    AND r.start_date::DATE = d
    AND LOWER(COALESCE(r.reservation_type_name, '')) NOT LIKE '%tour%'
    AND NOT EXISTS (
      SELECT 1 FROM gingr_reservations prev
      WHERE prev.location_id = p_location_id
        AND prev.animal_gingr_id = r.animal_gingr_id
        AND prev.cancelled_date IS NULL
        AND prev.source_missing_at IS NULL
        AND LOWER(COALESCE(prev.reservation_type_name, '')) NOT LIKE '%tour%'
        AND prev.start_date::DATE < d
    );

  SELECT json_build_object(
    'expected', COUNT(*) FILTER (WHERE
      r.start_date::DATE = d AND r.cancelled_date IS NULL
      AND r.check_in_date IS NULL
      AND LOWER(COALESCE(r.reservation_type_name, '')) NOT LIKE '%tour%'
    ),
    'expected_boarding', COUNT(*) FILTER (WHERE
      r.start_date::DATE = d AND r.cancelled_date IS NULL
      AND r.check_in_date IS NULL
      AND LOWER(COALESCE(r.reservation_type_name, '')) NOT LIKE '%tour%'
      AND (LOWER(COALESCE(r.reservation_type_name, '')) LIKE '%boarding%' OR LOWER(COALESCE(r.reservation_type_name, '')) LIKE '%lodging%'
           OR LOWER(COALESCE(r.reservation_type_name, '')) LIKE '%overnight%' OR LOWER(COALESCE(r.reservation_type_name, '')) LIKE '%suite%')
    ),
    'expected_daycare', COUNT(*) FILTER (WHERE
      r.start_date::DATE = d AND r.cancelled_date IS NULL
      AND r.check_in_date IS NULL
      AND LOWER(COALESCE(r.reservation_type_name, '')) NOT LIKE '%tour%'
      AND (LOWER(COALESCE(r.reservation_type_name, '')) LIKE '%daycare%' OR LOWER(COALESCE(r.reservation_type_name, '')) LIKE '%day care%'
           OR LOWER(COALESCE(r.reservation_type_name, '')) LIKE '%day boarding%')
    ),
    'in_house', COUNT(*) FILTER (WHERE
      r.check_in_date IS NOT NULL AND r.check_out_date IS NULL
      AND r.start_date::DATE <= d AND r.end_date::DATE >= d
      AND LOWER(COALESCE(r.reservation_type_name, '')) NOT LIKE '%tour%'
    ),
    'boarding', COUNT(*) FILTER (WHERE
      r.check_in_date IS NOT NULL AND r.check_out_date IS NULL
      AND r.start_date::DATE <= d AND r.end_date::DATE >= d
      AND (LOWER(COALESCE(r.reservation_type_name, '')) LIKE '%boarding%' OR LOWER(COALESCE(r.reservation_type_name, '')) LIKE '%lodging%'
           OR LOWER(COALESCE(r.reservation_type_name, '')) LIKE '%overnight%' OR LOWER(COALESCE(r.reservation_type_name, '')) LIKE '%suite%')
    ),
    'daycare', COUNT(*) FILTER (WHERE
      r.check_in_date IS NOT NULL AND r.check_out_date IS NULL
      AND r.start_date::DATE <= d AND r.end_date::DATE >= d
      AND (LOWER(COALESCE(r.reservation_type_name, '')) LIKE '%daycare%' OR LOWER(COALESCE(r.reservation_type_name, '')) LIKE '%day care%'
           OR LOWER(COALESCE(r.reservation_type_name, '')) LIKE '%day boarding%')
    ),
    'going_home', COUNT(*) FILTER (WHERE
      r.check_in_date IS NOT NULL AND r.check_out_date IS NULL
      AND r.end_date::DATE = d
    ),
    'going_home_boarding', COUNT(*) FILTER (WHERE
      r.check_in_date IS NOT NULL AND r.check_out_date IS NULL
      AND r.end_date::DATE = d
      AND (LOWER(COALESCE(r.reservation_type_name, '')) LIKE '%boarding%' OR LOWER(COALESCE(r.reservation_type_name, '')) LIKE '%lodging%'
           OR LOWER(COALESCE(r.reservation_type_name, '')) LIKE '%overnight%' OR LOWER(COALESCE(r.reservation_type_name, '')) LIKE '%suite%')
    ),
    'going_home_daycare', COUNT(*) FILTER (WHERE
      r.check_in_date IS NOT NULL AND r.check_out_date IS NULL
      AND r.end_date::DATE = d
      AND (LOWER(COALESCE(r.reservation_type_name, '')) LIKE '%daycare%' OR LOWER(COALESCE(r.reservation_type_name, '')) LIKE '%day care%'
           OR LOWER(COALESCE(r.reservation_type_name, '')) LIKE '%day boarding%')
    ),
    'rooms_occupied', COUNT(*) FILTER (WHERE
      r.check_in_date IS NOT NULL AND r.check_out_date IS NULL
      AND r.start_date::DATE <= d AND r.end_date::DATE > d
      AND (LOWER(COALESCE(r.reservation_type_name, '')) LIKE '%boarding%' OR LOWER(COALESCE(r.reservation_type_name, '')) LIKE '%lodging%'
           OR LOWER(COALESCE(r.reservation_type_name, '')) LIKE '%overnight%' OR LOWER(COALESCE(r.reservation_type_name, '')) LIKE '%suite%')
    ),
    'total_rooms', v_total_rooms,
    'total_room_count', v_total_rooms,
    'occupancy_pct', CASE WHEN v_total_rooms > 0 THEN ROUND(
      COUNT(*) FILTER (WHERE
        r.check_in_date IS NOT NULL AND r.check_out_date IS NULL
        AND r.start_date::DATE <= d AND r.end_date::DATE > d
        AND (LOWER(COALESCE(r.reservation_type_name, '')) LIKE '%boarding%' OR LOWER(COALESCE(r.reservation_type_name, '')) LIKE '%lodging%'
             OR LOWER(COALESCE(r.reservation_type_name, '')) LIKE '%overnight%' OR LOWER(COALESCE(r.reservation_type_name, '')) LIKE '%suite%')
      )::NUMERIC / v_total_rooms * 100
    )::INT ELSE 0 END,
    'new_bookings', COUNT(*) FILTER (WHERE
      r.created_date::DATE = d AND r.cancelled_date IS NULL
      AND LOWER(COALESCE(r.reservation_type_name, '')) NOT LIKE '%tour%'
    ),
    'tours', COUNT(*) FILTER (WHERE
      r.start_date::DATE = d
      AND LOWER(COALESCE(r.reservation_type_name, '')) LIKE '%tour%'
    ),
    'evals', COUNT(*) FILTER (WHERE
      r.start_date::DATE = d
      AND (LOWER(COALESCE(r.reservation_type_name, '')) LIKE '%eval%' OR LOWER(COALESCE(r.reservation_type_name, '')) LIKE '%assessment%')
    ),
    'new_leads', v_new_leads,
    'first_time_spenders', v_first_time_spenders
  ) INTO result
  FROM gingr_reservations r
  WHERE r.location_id = p_location_id
    AND r.cancelled_date IS NULL
    AND r.source_missing_at IS NULL;

  RETURN result;
END;
$$;

-- Backfill scheduled/actual check-in and check-out timestamps into existing
-- room-cleaning task instances. New computes include these fields directly.

WITH target_rows AS (
  SELECT id, location_id, computed_items
  FROM public.lite_daily_ops
  WHERE type_sub = 'room_cleaning'
    AND jsonb_typeof(computed_items->'task_instances') = 'array'
),
rebuilt AS (
  SELECT
    target_rows.id,
    jsonb_set(
      target_rows.computed_items,
      '{task_instances}',
      COALESCE(
        jsonb_agg(
          CASE
            WHEN reservation.gingr_id IS NULL THEN task.value
            ELSE jsonb_set(
              task.value,
              '{supporting_data}',
              COALESCE(task.value->'supporting_data', '{}'::jsonb)
                || jsonb_strip_nulls(
                  jsonb_build_object(
                    'scheduled_check_in_at', reservation.start_date::text,
                    'scheduled_check_out_at', reservation.end_date::text,
                    'check_in_at', COALESCE(reservation.check_in_date::text, reservation.start_date::text),
                    'check_out_at', COALESCE(reservation.check_out_date::text, reservation.end_date::text),
                    'actual_check_in_at', reservation.check_in_date::text,
                    'actual_check_out_at', reservation.check_out_date::text
                  )
                ),
              true
            )
          END
          ORDER BY task.ordinality
        ),
        '[]'::jsonb
      ),
      true
    ) AS computed_items
  FROM target_rows
  CROSS JOIN LATERAL jsonb_array_elements(target_rows.computed_items->'task_instances') WITH ORDINALITY AS task(value, ordinality)
  LEFT JOIN public.gingr_reservations AS reservation
    ON reservation.location_id::text = target_rows.location_id::text
   AND reservation.gingr_id::text = task.value->>'reservation_id'
  GROUP BY target_rows.id, target_rows.computed_items
)
UPDATE public.lite_daily_ops AS daily_ops
SET computed_items = rebuilt.computed_items
FROM rebuilt
WHERE daily_ops.id = rebuilt.id
  AND daily_ops.computed_items IS DISTINCT FROM rebuilt.computed_items;

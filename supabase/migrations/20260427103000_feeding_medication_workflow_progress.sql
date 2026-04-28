DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'lite_daily_ops'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.lite_daily_ops;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'lite_settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.lite_settings;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'role_page_config'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.role_page_config;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.workflow_progress_snapshot(
  p_location_id TEXT,
  p_view_date TEXT DEFAULT NULL
)
RETURNS TABLE (
  workflow_id TEXT,
  title TEXT,
  completed INTEGER,
  total INTEGER,
  status TEXT,
  status_text TEXT,
  sort_order INTEGER,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
AS $$
WITH params AS (
  SELECT
    p_location_id AS location_id,
    COALESCE(NULLIF(p_view_date, ''), CURRENT_DATE::TEXT) AS view_date
),
date_ref AS (
  SELECT
    location_id,
    view_date,
    (view_date::date + INTERVAL '1 day')::date::text AS next_date
  FROM params
),
workflow_meta AS (
  SELECT * FROM (
    VALUES
      ('bathing', 'Bathing Report', 1),
      ('pamper', 'Pamper Package', 2),
      ('enrichment', 'Enrichment', 3),
      ('ice_cream', 'Gourmet Ice Cream', 4),
      ('rooms', 'Room Cleaning & Setups', 5),
      ('play', 'Private Play', 6),
      ('weekly-maintenance', 'Weekly Maintenance', 7),
      ('belongings', 'Belongings', 8),
      ('collars', 'Collar Prep', 9),
      ('lodging-transfer', 'Lodging Transfers', 10),
      ('roll-call-opening', 'Opening Roll Call', 11),
      ('roll-call-closing', 'Closing Roll Call', 12),
      ('feeding-meds-am', 'AM Feeding and Meds', 13),
      ('feeding-meds-midday', 'Midday Feeding and Meds', 14),
      ('feeding-meds-pm', 'PM Feeding and Meds', 15),
      ('feeding-report', 'Feeding Report', 16),
      ('meds', 'Medication Report', 17)
  ) AS meta(id, title, sort_order)
),
ops_bathing AS (
  SELECT computed_items, items, computed_at, updated_at
  FROM public.lite_daily_ops
  WHERE location_id = (SELECT location_id FROM params)
    AND id = 'ops_bathing_' || (SELECT view_date FROM params)
  LIMIT 1
),
ops_pamper AS (
  SELECT computed_items, items, computed_at, updated_at
  FROM public.lite_daily_ops
  WHERE location_id = (SELECT location_id FROM params)
    AND id = 'ops_pamper_' || (SELECT view_date FROM params)
  LIMIT 1
),
ops_enrichment AS (
  SELECT computed_items, items, computed_at, updated_at
  FROM public.lite_daily_ops
  WHERE location_id = (SELECT location_id FROM params)
    AND id = 'ops_svc_' || (SELECT view_date FROM params)
  LIMIT 1
),
ops_rooms AS (
  SELECT computed_items, items, computed_at, updated_at
  FROM public.lite_daily_ops
  WHERE location_id = (SELECT location_id FROM params)
    AND id = 'ops_room_cleaning_' || (SELECT view_date FROM params)
  LIMIT 1
),
ops_play AS (
  SELECT computed_items, items, computed_at, updated_at
  FROM public.lite_daily_ops
  WHERE location_id = (SELECT location_id FROM params)
    AND id = 'ops_pp_' || (SELECT view_date FROM params)
  LIMIT 1
),
ops_weekly_maintenance AS (
  SELECT computed_items, items, computed_at, updated_at
  FROM public.lite_daily_ops
  WHERE location_id = (SELECT location_id FROM params)
    AND id = 'ops_weekly_maintenance_' || (SELECT view_date FROM params)
  LIMIT 1
),
ops_belongings AS (
  SELECT computed_items, items, computed_at, updated_at
  FROM public.lite_daily_ops
  WHERE location_id = (SELECT location_id FROM params)
    AND id = 'ops_belongings_' || (SELECT next_date FROM date_ref)
  LIMIT 1
),
ops_collars AS (
  SELECT computed_items, items, computed_at, updated_at
  FROM public.lite_daily_ops
  WHERE location_id = (SELECT location_id FROM params)
    AND id = 'ops_collars_' || (SELECT next_date FROM date_ref)
  LIMIT 1
),
ops_lodging_transfer AS (
  SELECT computed_items, items, computed_at, updated_at
  FROM public.lite_daily_ops
  WHERE location_id = (SELECT location_id FROM params)
    AND id = 'ops_lodging_transfer_' || (SELECT view_date FROM params)
  LIMIT 1
),
ops_roll_call_opening AS (
  SELECT computed_items, items, computed_at, updated_at
  FROM public.lite_daily_ops
  WHERE location_id = (SELECT location_id FROM params)
    AND id = 'ops_roll_call_opening_' || (SELECT view_date FROM params)
  LIMIT 1
),
ops_roll_call_closing AS (
  SELECT computed_items, items, computed_at, updated_at
  FROM public.lite_daily_ops
  WHERE location_id = (SELECT location_id FROM params)
    AND id = 'ops_roll_call_closing_' || (SELECT view_date FROM params)
  LIMIT 1
),
setting_rows AS (
  SELECT setting_key, setting_value, updated_at
  FROM public.lite_settings
  WHERE location_id = (SELECT location_id FROM params)
    AND setting_key IN (
      'ops_bathing_' || (SELECT view_date FROM params),
      'ops_pamper_' || (SELECT view_date FROM params),
      'ops_svc_Enrichment_' || (SELECT view_date FROM params),
      'ops_svc_Ice_Cream_' || (SELECT view_date FROM params),
      'ops_belongings_completions_' || (SELECT next_date FROM date_ref),
      'ops_collars_completions_' || (SELECT next_date FROM date_ref),
      'ops_lodging_transfer_completions_' || (SELECT view_date FROM params)
    )
),
bathing_progress AS (
  SELECT
    'bathing'::TEXT AS id,
    COALESCE((SELECT JSONB_ARRAY_LENGTH(COALESCE(ob.computed_items->'dogs', '[]'::JSONB))), 0) AS total,
    COALESCE((
      SELECT COUNT(*)
      FROM JSONB_ARRAY_ELEMENTS(COALESCE(ob.computed_items->'dogs', '[]'::JSONB)) dog
      LEFT JOIN setting_rows sr
        ON sr.setting_key = 'ops_bathing_' || (SELECT view_date FROM params)
      WHERE COALESCE(sr.setting_value, '{}'::JSONB) ? ('g' || COALESCE(dog->>'gingrReservationId', ''))
    ), 0) AS completed,
    COALESCE(
      GREATEST(ob.computed_at, ob.updated_at, sr.updated_at),
      ob.updated_at,
      ob.computed_at,
      sr.updated_at
    ) AS updated_at
  FROM (SELECT 1) base
  LEFT JOIN ops_bathing ob ON TRUE
  LEFT JOIN setting_rows sr
    ON sr.setting_key = 'ops_bathing_' || (SELECT view_date FROM params)
),
pamper_progress AS (
  SELECT
    'pamper'::TEXT AS id,
    COALESCE((SELECT JSONB_ARRAY_LENGTH(COALESCE(op.computed_items->'dogs', '[]'::JSONB))), 0) AS total,
    COALESCE((
      SELECT COUNT(*)
      FROM JSONB_OBJECT_KEYS(COALESCE(sr.setting_value, '{}'::JSONB))
    ), 0) AS completed,
    COALESCE(
      GREATEST(op.computed_at, op.updated_at, sr.updated_at),
      op.updated_at,
      op.computed_at,
      sr.updated_at
    ) AS updated_at
  FROM (SELECT 1) base
  LEFT JOIN ops_pamper op ON TRUE
  LEFT JOIN setting_rows sr
    ON sr.setting_key = 'ops_pamper_' || (SELECT view_date FROM params)
),
enrichment_progress AS (
  SELECT
    'enrichment'::TEXT AS id,
    COALESCE(
      (SELECT JSONB_ARRAY_LENGTH(COALESCE(oe.computed_items->'dogs', '[]'::JSONB))),
      (COALESCE((oe.computed_items->>'scheduledCount')::INT, 0) + COALESCE((oe.computed_items->>'suggestedCount')::INT, 0)),
      0
    ) AS total,
    COALESCE((
      SELECT COUNT(*)
      FROM JSONB_OBJECT_KEYS(COALESCE(sr.setting_value, '{}'::JSONB))
    ), 0) AS completed,
    COALESCE(
      GREATEST(oe.computed_at, oe.updated_at, sr.updated_at),
      oe.updated_at,
      oe.computed_at,
      sr.updated_at
    ) AS updated_at
  FROM (SELECT 1) base
  LEFT JOIN ops_enrichment oe ON TRUE
  LEFT JOIN setting_rows sr
    ON sr.setting_key = 'ops_svc_Enrichment_' || (SELECT view_date FROM params)
),
ice_cream_progress AS (
  SELECT
    'ice_cream'::TEXT AS id,
    COALESCE((
      SELECT COUNT(*)
      FROM (
        SELECT DISTINCT COALESCE(NULLIF(r.animal_gingr_id::TEXT, ''), NULLIF(r.gingr_id::TEXT, ''), r.id::TEXT) AS dog_id
        FROM public.gingr_reservations r
        JOIN params p ON p.location_id = r.location_id
        JOIN date_ref dr ON TRUE
        WHERE r.cancelled_date IS NULL
          AND r.check_out_date IS NULL
          AND r.start_date <= (dr.view_date || 'T23:59:59')::TIMESTAMPTZ
          AND r.end_date >= (dr.view_date || 'T00:00:00')::TIMESTAMPTZ
          AND EXISTS (
            SELECT 1
            FROM JSONB_ARRAY_ELEMENTS(
              CASE
                WHEN JSONB_TYPEOF(r.raw_data->'services') = 'array'
                  AND JSONB_ARRAY_LENGTH(COALESCE(r.raw_data->'services', '[]'::JSONB)) > 0
                THEN r.raw_data->'services'
                WHEN JSONB_TYPEOF(r.services) = 'array'
                THEN r.services
                ELSE '[]'::JSONB
              END
            ) svc
            WHERE (
              LOWER(COALESCE(svc->>'name', svc->>'service_name', TRIM(BOTH '"' FROM svc::TEXT))) LIKE '%ice cream%'
              OR LOWER(COALESCE(svc->>'name', svc->>'service_name', TRIM(BOTH '"' FROM svc::TEXT))) LIKE '%gourmet%'
            )
              AND COALESCE(svc->>'scheduled_at', '') LIKE dr.view_date || '%'
          )
      ) dogs
    ), 0) AS total,
    COALESCE((
      SELECT COUNT(*)
      FROM JSONB_OBJECT_KEYS(COALESCE(sr.setting_value, '{}'::JSONB))
    ), 0) AS completed,
    sr.updated_at AS updated_at
  FROM (SELECT 1) base
  LEFT JOIN setting_rows sr
    ON sr.setting_key = 'ops_svc_Ice_Cream_' || (SELECT view_date FROM params)
),
room_task_instances AS (
  SELECT
    task_item AS task_payload,
    task_item->>'task_id' AS task_id,
    task_item->>'task_type' AS task_type,
    task_item->>'room_key' AS room_key,
    task_item->>'room' AS room_label
  FROM ops_rooms orc,
       JSONB_ARRAY_ELEMENTS(COALESCE(orc.computed_items->'task_instances', '[]'::JSONB)) task_item
),
room_task_instance_progress AS (
  SELECT
    COALESCE(COUNT(rti.task_id), 0) AS total,
    COALESCE(COUNT(rti.task_id) FILTER (
      WHERE
        LOWER(COALESCE(task_state.state->>'completed', '')) IN ('true', 't', '1', 'yes')
        OR LOWER(COALESCE(task_state.state->>'checked', '')) IN ('true', 't', '1', 'yes')
        OR LOWER(COALESCE(task_state.state->>'done', '')) IN ('true', 't', '1', 'yes')
        OR LOWER(COALESCE(rti.task_payload->>'completed', '')) IN ('true', 't', '1', 'yes')
        OR (
          rti.task_type = 'room_refresh'
          AND LOWER(COALESCE(task_state.state->>'refresh', '')) IN ('true', 't', '1', 'yes')
        )
        OR (
          rti.task_type = 'full_disinfect'
          AND LOWER(COALESCE(task_state.state->>'disinfect', '')) IN ('true', 't', '1', 'yes')
        )
        OR (
          rti.task_type = 'setup'
          AND LOWER(COALESCE(task_state.state->>'setupDone', '')) IN ('true', 't', '1', 'yes')
        )
        OR (
          rti.task_type = 'sanitize'
          AND (
            LOWER(COALESCE(task_state.state->>'sanitizeDone', '')) IN ('true', 't', '1', 'yes')
            OR LOWER(COALESCE(task_state.state->>'asNeededDone', '')) IN ('true', 't', '1', 'yes')
          )
        )
    ), 0) AS completed,
    GREATEST(MAX(orc.computed_at), MAX(orc.updated_at)) AS updated_at
  FROM (SELECT 1) base
  LEFT JOIN ops_rooms orc ON TRUE
  LEFT JOIN room_task_instances rti ON TRUE
  LEFT JOIN LATERAL (
    SELECT COALESCE(
      orc.items->NULLIF(rti.task_id, ''),
      orc.items->NULLIF(rti.room_key, ''),
      orc.items->NULLIF(rti.room_label, ''),
      '{}'::JSONB
    ) AS state
  ) task_state ON TRUE
),
room_task_summary_progress AS (
  SELECT
    COALESCE(
      NULLIF(orc.computed_items->'task_summary'->>'total_tasks', '')::INT,
      (
        COALESCE(NULLIF(orc.computed_items->'task_summary'->>'room_refresh', '')::INT, 0) +
        COALESCE(NULLIF(orc.computed_items->'task_summary'->>'full_disinfect', '')::INT, 0) +
        COALESCE(NULLIF(orc.computed_items->'task_summary'->>'setup', '')::INT, 0) +
        COALESCE(NULLIF(orc.computed_items->'task_summary'->>'sanitize', '')::INT, 0)
      ),
      0
    ) AS total,
    GREATEST(orc.computed_at, orc.updated_at) AS updated_at
  FROM ops_rooms orc
),
legacy_room_actions AS (
  SELECT
    LOWER(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(room_item->>'room', ''), '\s+', '_', 'g'), '[^a-zA-Z0-9_-]', '', 'g')) AS room_key,
    BOOL_OR(COALESCE((room_item->>'needsRefresh')::BOOLEAN, FALSE)) AS needs_refresh,
    BOOL_OR(COALESCE((room_item->>'needsDisinfect')::BOOLEAN, FALSE)) AS needs_disinfect,
    BOOL_OR(COALESCE((room_item->>'needsSetup')::BOOLEAN, FALSE)) AS needs_setup
  FROM ops_rooms orc,
       JSONB_ARRAY_ELEMENTS(COALESCE(orc.computed_items->'rooms', '[]'::JSONB)) room_item
  GROUP BY 1
),
legacy_rooms_progress AS (
  SELECT
    COALESCE(SUM(
      CASE WHEN ra.needs_refresh THEN 1 ELSE 0 END +
      CASE WHEN ra.needs_disinfect THEN 1 ELSE 0 END +
      CASE WHEN ra.needs_setup THEN 1 ELSE 0 END
    ), 0) AS total,
    COALESCE(SUM(
      CASE WHEN ra.needs_refresh AND COALESCE((orc.items->ra.room_key->>'refresh')::BOOLEAN, FALSE) THEN 1 ELSE 0 END +
      CASE WHEN ra.needs_disinfect AND COALESCE((orc.items->ra.room_key->>'disinfect')::BOOLEAN, FALSE) THEN 1 ELSE 0 END +
      CASE WHEN ra.needs_setup AND COALESCE((orc.items->ra.room_key->>'setupDone')::BOOLEAN, FALSE) THEN 1 ELSE 0 END
    ), 0) AS completed,
    GREATEST(MAX(orc.computed_at), MAX(orc.updated_at)) AS updated_at
  FROM (SELECT 1) base
  LEFT JOIN ops_rooms orc ON TRUE
  LEFT JOIN legacy_room_actions ra ON TRUE
),
rooms_progress AS (
  SELECT
    'rooms'::TEXT AS id,
    CASE
      WHEN COALESCE(rtip.total, 0) > 0 THEN rtip.total
      WHEN COALESCE(rtsp.total, 0) > 0 THEN rtsp.total
      ELSE COALESCE(lrp.total, 0)
    END AS total,
    CASE
      WHEN COALESCE(rtip.total, 0) > 0 THEN rtip.completed
      ELSE COALESCE(lrp.completed, 0)
    END AS completed,
    GREATEST(rtip.updated_at, rtsp.updated_at, lrp.updated_at) AS updated_at
  FROM (SELECT 1) base
  LEFT JOIN room_task_instance_progress rtip ON TRUE
  LEFT JOIN room_task_summary_progress rtsp ON TRUE
  LEFT JOIN legacy_rooms_progress lrp ON TRUE
),
play_progress AS (
  SELECT
    'play'::TEXT AS id,
    COALESCE(
      (op.computed_items->'summary'->>'requiredSessions')::INT,
      (
        SELECT COALESCE(SUM(COALESCE((dog->>'requiredSessions')::INT, 3)), 0)
        FROM JSONB_ARRAY_ELEMENTS(COALESCE(op.computed_items->'dogs', '[]'::JSONB)) dog
      ),
      0
    ) AS total,
    COALESCE((
      SELECT COALESCE(SUM(
        CASE
          WHEN JSONB_TYPEOF(value) = 'array' THEN (
            SELECT COUNT(*)
            FROM JSONB_ARRAY_ELEMENTS(value) session_value
            WHERE COALESCE((session_value #>> '{}')::BOOLEAN, FALSE)
          )
          WHEN JSONB_TYPEOF(value) = 'object' AND JSONB_TYPEOF(value->'sessions') = 'array' THEN (
            SELECT COUNT(*)
            FROM JSONB_ARRAY_ELEMENTS(value->'sessions') session_value
            WHERE COALESCE((session_value #>> '{}')::BOOLEAN, FALSE)
          )
          ELSE 0
        END
      ), 0)
      FROM JSONB_EACH(COALESCE(op.items, '{}'::JSONB))
    ), 0) AS completed,
    COALESCE(
      GREATEST(op.computed_at, op.updated_at),
      op.updated_at,
      op.computed_at
    ) AS updated_at
  FROM (SELECT 1) base
  LEFT JOIN ops_play op ON TRUE
),
weekly_maintenance_template_progress AS (
  SELECT
    COALESCE(COUNT(task_item), 0) AS total,
    MAX(lct.updated_at) AS updated_at
  FROM public.lite_checklist_templates lct
  JOIN params p
    ON p.location_id = lct.location_id
  JOIN date_ref dr
    ON TRUE
  LEFT JOIN LATERAL JSONB_ARRAY_ELEMENTS(COALESCE(lct.items, '[]'::JSONB)) task_item
    ON TRUE
  WHERE lct.template_type = 'weekly_maintenance'
    AND LOWER(COALESCE(task_item->>'active', 'true')) <> 'false'
    AND EXISTS (
      SELECT 1
      FROM JSONB_ARRAY_ELEMENTS(COALESCE(task_item->'scheduledDays', '[]'::JSONB)) day_value
      WHERE NULLIF(day_value #>> '{}', '')::INT = EXTRACT(DOW FROM dr.view_date::DATE)::INT
    )
),
weekly_maintenance_progress AS (
  SELECT
    'weekly-maintenance'::TEXT AS id,
    COALESCE(
      NULLIF((SELECT JSONB_ARRAY_LENGTH(COALESCE(owm.computed_items->'tasks', '[]'::JSONB))), 0),
      NULLIF(CASE
        WHEN JSONB_TYPEOF(owm.computed_items) = 'array' THEN JSONB_ARRAY_LENGTH(owm.computed_items)
        ELSE 0
      END, 0),
      wmtp.total,
      0
    ) AS total,
    COALESCE((
      SELECT COUNT(*)
      FROM JSONB_EACH(COALESCE(owm.items, '{}'::JSONB))
      WHERE COALESCE((value->>'checked')::BOOLEAN, FALSE)
    ), 0) AS completed,
    COALESCE(
      GREATEST(owm.computed_at, owm.updated_at, wmtp.updated_at),
      owm.updated_at,
      owm.computed_at,
      wmtp.updated_at
    ) AS updated_at
  FROM (SELECT 1) base
  LEFT JOIN ops_weekly_maintenance owm ON TRUE
  LEFT JOIN weekly_maintenance_template_progress wmtp ON TRUE
),
belongings_progress AS (
  SELECT
    'belongings'::TEXT AS id,
    COALESCE((SELECT JSONB_ARRAY_LENGTH(COALESCE(ob.computed_items->'dogs', '[]'::JSONB))), 0) AS total,
    COALESCE((
      SELECT COUNT(*)
      FROM JSONB_OBJECT_KEYS(COALESCE(sr.setting_value, '{}'::JSONB))
    ), 0) AS completed,
    COALESCE(
      GREATEST(ob.computed_at, ob.updated_at, sr.updated_at),
      ob.updated_at,
      ob.computed_at,
      sr.updated_at
    ) AS updated_at
  FROM (SELECT 1) base
  LEFT JOIN ops_belongings ob ON TRUE
  LEFT JOIN setting_rows sr
    ON sr.setting_key = 'ops_belongings_completions_' || (SELECT next_date FROM date_ref)
),
collars_progress AS (
  SELECT
    'collars'::TEXT AS id,
    COALESCE((SELECT JSONB_ARRAY_LENGTH(COALESCE(oc.computed_items->'dogs', '[]'::JSONB))), 0) AS total,
    COALESCE((
      SELECT COUNT(*)
      FROM JSONB_OBJECT_KEYS(COALESCE(sr.setting_value, '{}'::JSONB))
    ), 0) AS completed,
    COALESCE(
      GREATEST(oc.computed_at, oc.updated_at, sr.updated_at),
      oc.updated_at,
      oc.computed_at,
      sr.updated_at
    ) AS updated_at
  FROM (SELECT 1) base
  LEFT JOIN ops_collars oc ON TRUE
  LEFT JOIN setting_rows sr
    ON sr.setting_key = 'ops_collars_completions_' || (SELECT next_date FROM date_ref)
),
lodging_transfer_progress AS (
  SELECT
    'lodging-transfer'::TEXT AS id,
    COALESCE((SELECT JSONB_ARRAY_LENGTH(COALESCE(olt.computed_items->'transfers', '[]'::JSONB))), 0) AS total,
    COALESCE((
      SELECT COUNT(*)
      FROM JSONB_EACH(COALESCE(sr.setting_value, '{}'::JSONB))
      WHERE COALESCE((value->>'allDone')::BOOLEAN, FALSE)
    ), 0) AS completed,
    COALESCE(
      GREATEST(olt.computed_at, olt.updated_at, sr.updated_at),
      olt.updated_at,
      olt.computed_at,
      sr.updated_at
    ) AS updated_at
  FROM (SELECT 1) base
  LEFT JOIN ops_lodging_transfer olt ON TRUE
  LEFT JOIN setting_rows sr
    ON sr.setting_key = 'ops_lodging_transfer_completions_' || (SELECT view_date FROM params)
),
roll_call_opening_progress AS (
  SELECT
    'roll-call-opening'::TEXT AS id,
    COALESCE(
      (oro.computed_items->'summary'->>'totalRooms')::INT,
      (SELECT JSONB_ARRAY_LENGTH(COALESCE(oro.computed_items->'rooms', '[]'::JSONB))),
      0
    ) AS total,
    COALESCE((
      SELECT COUNT(*)
      FROM JSONB_EACH(COALESCE(oro.items, '{}'::JSONB))
      WHERE COALESCE((value->>'verified')::BOOLEAN, FALSE)
    ), 0) AS completed,
    COALESCE(
      GREATEST(oro.computed_at, oro.updated_at),
      oro.updated_at,
      oro.computed_at
    ) AS updated_at
  FROM (SELECT 1) base
  LEFT JOIN ops_roll_call_opening oro ON TRUE
),
roll_call_closing_progress AS (
  SELECT
    'roll-call-closing'::TEXT AS id,
    COALESCE(
      (orc.computed_items->'summary'->>'totalRooms')::INT,
      (SELECT JSONB_ARRAY_LENGTH(COALESCE(orc.computed_items->'rooms', '[]'::JSONB))),
      0
    ) AS total,
    COALESCE((
      SELECT COUNT(*)
      FROM JSONB_EACH(COALESCE(orc.items, '{}'::JSONB))
      WHERE COALESCE((value->>'verified')::BOOLEAN, FALSE)
    ), 0) AS completed,
    COALESCE(
      GREATEST(orc.computed_at, orc.updated_at),
      orc.updated_at,
      orc.computed_at
    ) AS updated_at
  FROM (SELECT 1) base
  LEFT JOIN ops_roll_call_closing orc ON TRUE
),
care_workflow_progress AS (
  SELECT
    workflow_entry.id,
    COALESCE(
      JSONB_ARRAY_LENGTH(COALESCE(ops_row.computed_items->'rows', '[]'::JSONB)),
      JSONB_ARRAY_LENGTH(COALESCE(ops_row.computed_items->'dogs', '[]'::JSONB)),
      0
    ) AS total,
    COALESCE((
      SELECT COUNT(*)
      FROM JSONB_EACH(COALESCE(ops_row.items, '{}'::JSONB)) state
      WHERE
        state.value ? 'completedAt'
        OR state.value ? 'outcome'
        OR state.value ? 'decision'
        OR state.value ? 'checkOutAt'
        OR LOWER(COALESCE(state.value->>'completed', '')) IN ('true', 't', '1', 'yes')
    ), 0) AS completed,
    COALESCE(
      GREATEST(ops_row.computed_at, ops_row.updated_at),
      ops_row.updated_at,
      ops_row.computed_at
    ) AS updated_at
  FROM (
    VALUES
      ('feeding-meds-am'::TEXT, 'ops_feeding_meds_am_' || (SELECT view_date FROM params)),
      ('feeding-meds-midday'::TEXT, 'ops_feeding_meds_midday_' || (SELECT view_date FROM params)),
      ('feeding-meds-pm'::TEXT, 'ops_feeding_meds_pm_' || (SELECT view_date FROM params)),
      ('feeding-report'::TEXT, 'ops_feeding_report_' || (SELECT view_date FROM params)),
      ('meds'::TEXT, 'ops_medication_report_' || (SELECT view_date FROM params))
  ) AS workflow_entry(id, entry_id)
  LEFT JOIN public.lite_daily_ops ops_row
    ON ops_row.location_id = (SELECT location_id FROM params)
   AND ops_row.id = workflow_entry.entry_id
),
workflow_progress_raw AS (
  SELECT * FROM bathing_progress
  UNION ALL
  SELECT * FROM pamper_progress
  UNION ALL
  SELECT * FROM enrichment_progress
  UNION ALL
  SELECT * FROM ice_cream_progress
  UNION ALL
  SELECT * FROM rooms_progress
  UNION ALL
  SELECT * FROM play_progress
  UNION ALL
  SELECT * FROM weekly_maintenance_progress
  UNION ALL
  SELECT * FROM belongings_progress
  UNION ALL
  SELECT * FROM collars_progress
  UNION ALL
  SELECT * FROM lodging_transfer_progress
  UNION ALL
  SELECT * FROM roll_call_opening_progress
  UNION ALL
  SELECT * FROM roll_call_closing_progress
  UNION ALL
  SELECT * FROM care_workflow_progress
),
workflow_progress AS (
  SELECT
    id,
    MAX(total) AS total,
    MAX(completed) AS completed,
    MAX(updated_at) AS updated_at
  FROM workflow_progress_raw
  GROUP BY id
)
SELECT
  wm.id AS workflow_id,
  wm.title,
  COALESCE(wp.completed, 0)::INT AS completed,
  COALESCE(wp.total, 0)::INT AS total,
  CASE
    WHEN COALESCE(wp.total, 0) = 0 THEN 'empty'
    WHEN COALESCE(wp.completed, 0) <= 0 THEN 'not_started'
    WHEN COALESCE(wp.completed, 0) >= COALESCE(wp.total, 0) THEN 'complete'
    ELSE 'in_progress'
  END AS status,
  CASE
    WHEN COALESCE(wp.total, 0) = 0 THEN 'No work'
    WHEN COALESCE(wp.completed, 0) <= 0 THEN 'Not started'
    WHEN COALESCE(wp.completed, 0) >= COALESCE(wp.total, 0) THEN 'Complete'
    ELSE 'In progress'
  END AS status_text,
  wm.sort_order,
  wp.updated_at
FROM workflow_meta wm
LEFT JOIN workflow_progress wp
  ON wp.id = wm.id
ORDER BY wm.sort_order;
$$;

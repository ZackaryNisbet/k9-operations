CREATE OR REPLACE FUNCTION dashboard_mobile_snapshot(
  p_location_id TEXT,
  p_view_date TEXT DEFAULT NULL,
  p_user_role TEXT DEFAULT 'employee'
)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
WITH params AS (
  SELECT
    p_location_id AS location_id,
    COALESCE(NULLIF(p_view_date, ''), CURRENT_DATE::TEXT) AS view_date,
    COALESCE(NULLIF(LOWER(p_user_role), ''), 'employee') AS user_role
),
date_ref AS (
  SELECT
    location_id,
    view_date,
    (view_date::date + INTERVAL '1 day')::date::text AS next_date,
    (view_date::date = CURRENT_DATE) AS is_today
  FROM params
),
role_levels AS (
  SELECT * FROM (
    VALUES
      ('pct', 0),
      ('csr', 1),
      ('employee', 1),
      ('supervisor', 2),
      ('manager', 3),
      ('location_admin', 4),
      ('multi_location_admin', 5),
      ('enterprise_admin', 6),
      ('owner', 6)
  ) AS levels(role_name, role_level)
),
current_role_level AS (
  SELECT COALESCE(
    (SELECT role_level FROM role_levels WHERE role_name = (SELECT user_role FROM params)),
    0
  ) AS role_level
),
workflow_meta AS (
  SELECT * FROM (
    VALUES
      ('bathing', 'Bathing Report', NULL::TEXT, 1),
      ('pamper', 'Pamper Package', NULL::TEXT, 2),
      ('enrichment', 'Enrichment', NULL::TEXT, 3),
      ('ice_cream', 'Gourmet Ice Cream', NULL::TEXT, 4),
      ('rooms', 'Room Cleaning & Setups', NULL::TEXT, 5),
      ('play', 'Private Play', NULL::TEXT, 6),
      ('belongings', 'Belongings', NULL::TEXT, 7),
      ('collars', 'Collar Prep', NULL::TEXT, 8)
  ) AS meta(id, title, min_role, sort_order)
),
role_candidates AS (
  SELECT * FROM (
    VALUES
      ('pct', 1, 'pct'),
      ('pct', 2, 'employee'),
      ('csr', 1, 'csr'),
      ('csr', 2, 'employee'),
      ('mod', 1, 'mod'),
      ('mod', 2, 'supervisor'),
      ('mod', 3, 'manager'),
      ('mod', 4, 'location_admin')
  ) AS candidates(tab_name, priority, role_name)
),
selected_config_roles AS (
  SELECT tab_name, role_name
  FROM (
    SELECT
      rc.tab_name,
      rc.role_name,
      ROW_NUMBER() OVER (PARTITION BY rc.tab_name ORDER BY rc.priority) AS rn
    FROM role_candidates rc
    JOIN params p ON TRUE
    WHERE EXISTS (
      SELECT 1
      FROM role_page_config rpc
      WHERE rpc.location_id = p.location_id
        AND rpc.is_active = TRUE
        AND LOWER(rpc.role) = LOWER(rc.role_name)
    )
  ) ranked
  WHERE rn = 1
),
config_workflows AS (
  SELECT DISTINCT
    scr.tab_name,
    CASE LOWER(REGEXP_REPLACE(rpc.task_id, '^wf_', ''))
      WHEN 'room_cleaning' THEN 'rooms'
      WHEN 'room-cleaning' THEN 'rooms'
      WHEN 'pp' THEN 'play'
      WHEN 'weekly_inventory' THEN 'inventory'
      WHEN 'weekly-inventory' THEN 'inventory'
      WHEN 'weekly_maintenance' THEN 'weekly-maintenance'
      WHEN 'lodging_transfer' THEN 'lodging-transfer'
      WHEN 'emergency_contacts' THEN 'emergency-contacts'
      WHEN 'roll_call' THEN 'roll-call'
      ELSE LOWER(REGEXP_REPLACE(rpc.task_id, '^wf_', ''))
    END AS workflow_id
  FROM selected_config_roles scr
  JOIN params p ON TRUE
  JOIN role_page_config rpc
    ON rpc.location_id = p.location_id
   AND rpc.is_active = TRUE
   AND LOWER(rpc.role) = LOWER(scr.role_name)
  WHERE rpc.source = 'workflow' OR rpc.task_id LIKE 'wf_%'
),
fallback_workflows AS (
  SELECT * FROM (
    VALUES
      ('pct', 'bathing'),
      ('pct', 'rooms'),
      ('pct', 'play'),
      ('pct', 'weekly-maintenance'),
      ('csr', 'collars'),
      ('csr', 'enrichment'),
      ('csr', 'lodging-transfer'),
      ('csr', 'pamper'),
      ('csr', 'emergency-contacts'),
      ('mod', 'belongings'),
      ('mod', 'inventory'),
      ('mod', 'roll-call'),
      ('mod', 'departing'),
      ('mod', 'ice_cream'),
      ('mod', 'training')
  ) AS fallback(tab_name, workflow_id)
),
enabled_workflows AS (
  SELECT DISTINCT workflow_id
  FROM config_workflows
  UNION
  SELECT fw.workflow_id
  FROM fallback_workflows fw
  WHERE NOT EXISTS (
    SELECT 1
    FROM selected_config_roles scr
    WHERE scr.tab_name = fw.tab_name
  )
),
eligible_workflows AS (
  SELECT wm.*
  FROM workflow_meta wm
  JOIN enabled_workflows ew
    ON ew.workflow_id = wm.id
  CROSS JOIN current_role_level cr
  LEFT JOIN role_levels rl
    ON rl.role_name = wm.min_role
  WHERE cr.role_level >= COALESCE(rl.role_level, 0)
),
metrics_row AS (
  SELECT to_jsonb(m) AS payload, m.computed_at
  FROM params p
  JOIN LATERAL (
    SELECT *
    FROM dashboard_metrics_daily d
    WHERE d.location_id = p.location_id
    ORDER BY
      CASE WHEN d.metric_date::text = (SELECT view_date FROM params) THEN 0 ELSE 1 END,
      d.metric_date DESC
    LIMIT 1
  ) m ON TRUE
),
live_snapshot AS (
  SELECT CASE
    WHEN dr.is_today THEN snapshot_live(dr.location_id)::JSONB
    ELSE NULL::JSONB
  END AS payload
  FROM date_ref dr
),
ops_bathing AS (
  SELECT computed_items, items, computed_at
  FROM lite_daily_ops
  WHERE location_id = (SELECT location_id FROM params)
    AND id = 'ops_bathing_' || (SELECT view_date FROM params)
  LIMIT 1
),
ops_pamper AS (
  SELECT computed_items, items, computed_at
  FROM lite_daily_ops
  WHERE location_id = (SELECT location_id FROM params)
    AND id = 'ops_pamper_' || (SELECT view_date FROM params)
  LIMIT 1
),
ops_enrichment AS (
  SELECT computed_items, items, computed_at
  FROM lite_daily_ops
  WHERE location_id = (SELECT location_id FROM params)
    AND id = 'ops_svc_' || (SELECT view_date FROM params)
  LIMIT 1
),
ops_rooms AS (
  SELECT computed_items, items, computed_at
  FROM lite_daily_ops
  WHERE location_id = (SELECT location_id FROM params)
    AND id = 'ops_room_cleaning_' || (SELECT view_date FROM params)
  LIMIT 1
),
ops_play AS (
  SELECT computed_items, items, computed_at
  FROM lite_daily_ops
  WHERE location_id = (SELECT location_id FROM params)
    AND id = 'ops_pp_' || (SELECT view_date FROM params)
  LIMIT 1
),
ops_belongings AS (
  SELECT computed_items, items, computed_at
  FROM lite_daily_ops
  WHERE location_id = (SELECT location_id FROM params)
    AND id = 'ops_belongings_' || (SELECT next_date FROM date_ref)
  LIMIT 1
),
ops_collars AS (
  SELECT computed_items, items, computed_at
  FROM lite_daily_ops
  WHERE location_id = (SELECT location_id FROM params)
    AND id = 'ops_collars_' || (SELECT next_date FROM date_ref)
  LIMIT 1
),
setting_rows AS (
  SELECT setting_key, setting_value, updated_at
  FROM lite_settings
  WHERE location_id = (SELECT location_id FROM params)
    AND setting_key IN (
      'ops_bathing_' || (SELECT view_date FROM params),
      'ops_pamper_' || (SELECT view_date FROM params),
      'ops_svc_Enrichment_' || (SELECT view_date FROM params),
      'ops_svc_Ice_Cream_' || (SELECT view_date FROM params),
      'ops_belongings_completions_' || (SELECT next_date FROM date_ref),
      'ops_collars_completions_' || (SELECT next_date FROM date_ref)
    )
),
bathing_progress AS (
  SELECT
    'bathing'::TEXT AS id,
    'Bathing Report'::TEXT AS title,
    COALESCE(JSONB_ARRAY_LENGTH(COALESCE(ob.computed_items->'dogs', '[]'::JSONB)), 0) AS total,
    COALESCE((
      SELECT COUNT(*)
      FROM JSONB_ARRAY_ELEMENTS(COALESCE(ob.computed_items->'dogs', '[]'::JSONB)) dog
      LEFT JOIN setting_rows sr
        ON sr.setting_key = 'ops_bathing_' || (SELECT view_date FROM params)
      WHERE COALESCE(sr.setting_value, '{}'::JSONB) ? ('g' || COALESCE(dog->>'gingrReservationId', ''))
    ), 0) AS completed,
    ob.computed_at
  FROM ops_bathing ob
),
pamper_progress AS (
  SELECT
    'pamper'::TEXT AS id,
    'Pamper Package'::TEXT AS title,
    COALESCE(JSONB_ARRAY_LENGTH(COALESCE(op.computed_items->'dogs', '[]'::JSONB)), 0) AS total,
    COALESCE((
      SELECT COUNT(*)
      FROM JSONB_OBJECT_KEYS(COALESCE(sr.setting_value, '{}'::JSONB))
    ), 0) AS completed,
    op.computed_at
  FROM ops_pamper op
  LEFT JOIN setting_rows sr
    ON sr.setting_key = 'ops_pamper_' || (SELECT view_date FROM params)
),
enrichment_progress AS (
  SELECT
    'enrichment'::TEXT AS id,
    'Enrichment'::TEXT AS title,
    COALESCE(
      JSONB_ARRAY_LENGTH(COALESCE(oe.computed_items->'dogs', '[]'::JSONB)),
      ((COALESCE((oe.computed_items->>'scheduledCount')::INT, 0)) + COALESCE((oe.computed_items->>'suggestedCount')::INT, 0)),
      0
    ) AS total,
    COALESCE((
      SELECT COUNT(*)
      FROM JSONB_OBJECT_KEYS(COALESCE(sr.setting_value, '{}'::JSONB))
    ), 0) AS completed,
    oe.computed_at
  FROM ops_enrichment oe
  LEFT JOIN setting_rows sr
    ON sr.setting_key = 'ops_svc_Enrichment_' || (SELECT view_date FROM params)
),
ice_cream_progress AS (
  SELECT
    'ice_cream'::TEXT AS id,
    'Gourmet Ice Cream'::TEXT AS title,
    COALESCE((
      SELECT COUNT(*)
      FROM (
        SELECT DISTINCT COALESCE(NULLIF(r.animal_gingr_id::TEXT, ''), NULLIF(r.gingr_id::TEXT, ''), r.id::TEXT) AS dog_id
        FROM gingr_reservations r
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
    NULL::TIMESTAMPTZ AS computed_at
  FROM setting_rows sr
  WHERE sr.setting_key = 'ops_svc_Ice_Cream_' || (SELECT view_date FROM params)
  UNION ALL
  SELECT
    'ice_cream'::TEXT AS id,
    'Gourmet Ice Cream'::TEXT AS title,
    COALESCE((
      SELECT COUNT(*)
      FROM (
        SELECT DISTINCT COALESCE(NULLIF(r.animal_gingr_id::TEXT, ''), NULLIF(r.gingr_id::TEXT, ''), r.id::TEXT) AS dog_id
        FROM gingr_reservations r
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
    0 AS completed,
    NULL::TIMESTAMPTZ AS computed_at
  WHERE NOT EXISTS (
    SELECT 1
    FROM setting_rows sr
    WHERE sr.setting_key = 'ops_svc_Ice_Cream_' || (SELECT view_date FROM params)
  )
),
room_actions AS (
  SELECT
    LOWER(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(room_item->>'room', ''), '\s+', '_', 'g'), '[^a-zA-Z0-9_-]', '', 'g')) AS room_key,
    BOOL_OR(COALESCE((room_item->>'needsRefresh')::BOOLEAN, FALSE)) AS needs_refresh,
    BOOL_OR(COALESCE((room_item->>'needsDisinfect')::BOOLEAN, FALSE)) AS needs_disinfect,
    BOOL_OR(COALESCE((room_item->>'needsSetup')::BOOLEAN, FALSE)) AS needs_setup
  FROM ops_rooms orc,
       JSONB_ARRAY_ELEMENTS(COALESCE(orc.computed_items->'rooms', '[]'::JSONB)) room_item
  GROUP BY 1
),
rooms_progress AS (
  SELECT
    'rooms'::TEXT AS id,
    'Room Cleaning & Setups'::TEXT AS title,
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
    MAX(orc.computed_at) AS computed_at
  FROM room_actions ra
  CROSS JOIN ops_rooms orc
),
play_progress AS (
  SELECT
    'play'::TEXT AS id,
    'Private Play'::TEXT AS title,
    COALESCE(
      (op.computed_items->'summary'->>'requiredSessions')::INT,
      (
        SELECT COALESCE(SUM(COALESCE((dog->>'requiredSessions')::INT, 3)), 0)
        FROM JSONB_ARRAY_ELEMENTS(COALESCE(op.computed_items->'dogs', '[]'::JSONB)) dog
      ),
      0
    ) AS total,
    COALESCE((
      SELECT SUM(
        CASE
          WHEN JSONB_TYPEOF(value) = 'array' THEN JSONB_ARRAY_LENGTH(value)
          WHEN JSONB_TYPEOF(value) = 'object' AND JSONB_TYPEOF(value->'sessions') = 'array' THEN JSONB_ARRAY_LENGTH(value->'sessions')
          ELSE 0
        END
      )
      FROM JSONB_EACH(COALESCE(op.items, '{}'::JSONB))
    ), 0) AS completed,
    op.computed_at
  FROM ops_play op
),
belongings_progress AS (
  SELECT
    'belongings'::TEXT AS id,
    'Belongings'::TEXT AS title,
    COALESCE(JSONB_ARRAY_LENGTH(COALESCE(ob.computed_items->'dogs', '[]'::JSONB)), 0) AS total,
    COALESCE((
      SELECT COUNT(*)
      FROM JSONB_OBJECT_KEYS(COALESCE(sr.setting_value, '{}'::JSONB))
    ), 0) AS completed,
    ob.computed_at
  FROM ops_belongings ob
  LEFT JOIN setting_rows sr
    ON sr.setting_key = 'ops_belongings_completions_' || (SELECT next_date FROM date_ref)
),
collars_progress AS (
  SELECT
    'collars'::TEXT AS id,
    'Collar Prep'::TEXT AS title,
    COALESCE(JSONB_ARRAY_LENGTH(COALESCE(oc.computed_items->'dogs', '[]'::JSONB)), 0) AS total,
    COALESCE((
      SELECT COUNT(*)
      FROM JSONB_OBJECT_KEYS(COALESCE(sr.setting_value, '{}'::JSONB))
    ), 0) AS completed,
    oc.computed_at
  FROM ops_collars oc
  LEFT JOIN setting_rows sr
    ON sr.setting_key = 'ops_collars_completions_' || (SELECT next_date FROM date_ref)
),
workflow_progress AS (
  SELECT * FROM bathing_progress
  UNION ALL
  SELECT * FROM pamper_progress
  UNION ALL
  SELECT * FROM enrichment_progress
  UNION ALL
  SELECT id, title, total, completed, MAX(computed_at) AS computed_at
  FROM ice_cream_progress
  GROUP BY id, title, total, completed
  UNION ALL
  SELECT * FROM rooms_progress
  UNION ALL
  SELECT * FROM play_progress
  UNION ALL
  SELECT * FROM belongings_progress
  UNION ALL
  SELECT * FROM collars_progress
),
visible_workflow_progress AS (
  SELECT
    ew.id,
    ew.title,
    COALESCE(wp.completed, 0) AS completed,
    COALESCE(wp.total, 0) AS total,
    COALESCE(wp.computed_at, mr.computed_at) AS computed_at,
    ew.sort_order
  FROM eligible_workflows ew
  LEFT JOIN workflow_progress wp
    ON wp.id = ew.id
  LEFT JOIN metrics_row mr ON TRUE
  WHERE COALESCE(wp.total, 0) > 0
),
computed_timestamps AS (
  SELECT computed_at FROM metrics_row
  UNION ALL
  SELECT computed_at FROM visible_workflow_progress
  UNION ALL
  SELECT updated_at FROM setting_rows
),
final_payload AS (
  SELECT JSONB_BUILD_OBJECT(
    'metrics', COALESCE((SELECT payload FROM metrics_row), '{}'::JSONB),
    'liveSnapshot', (SELECT payload FROM live_snapshot),
    'workflowProgress', COALESCE((
      SELECT JSONB_AGG(
        JSONB_BUILD_OBJECT(
          'id', id,
          'title', title,
          'completed', completed,
          'total', total
        )
        ORDER BY sort_order
      )
      FROM visible_workflow_progress
    ), '[]'::JSONB),
    'computedAt', (
      SELECT MAX(computed_at)
      FROM computed_timestamps
    )
  ) AS payload
)
SELECT payload
FROM final_payload;
$$;

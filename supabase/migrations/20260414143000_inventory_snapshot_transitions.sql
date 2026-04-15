-- Inventory snapshot workflow hardening:
-- - adds snapshot history for audited status changes
-- - aligns ad-hoc items with the web UI's ordered/skipped fields
-- - routes completion/reopen through audited RPCs instead of direct updates

ALTER TABLE inventory_snapshots
  ADD COLUMN IF NOT EXISTS history jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE inventory_adhoc_items
  ADD COLUMN IF NOT EXISTS ordered boolean NOT NULL DEFAULT false;

ALTER TABLE inventory_adhoc_items
  ADD COLUMN IF NOT EXISTS skipped boolean NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "Authenticated users can update inventory_snapshots" ON inventory_snapshots;
DROP POLICY IF EXISTS inventory_snapshots_no_direct_update ON inventory_snapshots;

CREATE POLICY inventory_snapshots_no_direct_update ON inventory_snapshots
  FOR UPDATE TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE OR REPLACE FUNCTION complete_inventory_snapshot(p_snapshot_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snapshot inventory_snapshots%ROWTYPE;
  v_actor_role text;
  v_actor_name text;
  v_now timestamptz := now();
  v_history_entry jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT *
  INTO v_snapshot
  FROM inventory_snapshots
  WHERE id = p_snapshot_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory snapshot not found';
  END IF;

  SELECT
    lp.role::text,
    COALESCE(NULLIF(lp.full_name, ''), NULLIF(lp.email, ''), 'Unknown')
  INTO v_actor_role, v_actor_name
  FROM lite_profiles lp
  WHERE lp.user_id = auth.uid()
    AND lp.is_active = true
    AND (lp.location_id = v_snapshot.location_id OR lp.role = 'enterprise_admin')
  ORDER BY CASE lp.role
    WHEN 'enterprise_admin' THEN 1
    WHEN 'location_admin' THEN 2
    WHEN 'manager' THEN 3
    WHEN 'supervisor' THEN 4
    WHEN 'csr' THEN 5
    WHEN 'pct' THEN 6
    ELSE 7
  END
  LIMIT 1;

  IF v_actor_role IS NULL THEN
    SELECT
      p.role,
      COALESCE(NULLIF(p.full_name, ''), NULLIF(p.email, ''), 'Unknown')
    INTO v_actor_role, v_actor_name
    FROM profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('owner', 'role_owner')
    LIMIT 1;
  END IF;

  IF v_actor_role IS NULL THEN
    RAISE EXCEPTION 'Insufficient permissions for this inventory snapshot';
  END IF;

  IF v_snapshot.status = 'completed' THEN
    RETURN to_jsonb(v_snapshot);
  END IF;

  v_history_entry := jsonb_build_object(
    'ts', v_now,
    'type', 'status_change',
    'action', 'completed',
    'user_id', auth.uid(),
    'user_name', v_actor_name,
    'reason', NULL,
    'from_status', COALESCE(v_snapshot.status, 'in_progress'),
    'to_status', 'completed'
  );

  UPDATE inventory_snapshots
  SET
    status = 'completed',
    completed_at = v_now,
    completed_by = v_actor_name,
    history = COALESCE(history, '[]'::jsonb) || jsonb_build_array(v_history_entry)
  WHERE id = p_snapshot_id
  RETURNING *
  INTO v_snapshot;

  INSERT INTO lite_audit_log (
    location_id,
    timestamp,
    user_id,
    user_name,
    action,
    resource_type,
    resource_id,
    details
  )
  VALUES (
    v_snapshot.location_id,
    v_now,
    auth.uid(),
    v_actor_name,
    'Inventory Completed',
    'inventory_snapshot',
    v_snapshot.id::text,
    jsonb_build_object(
      'week_start', v_snapshot.week_start,
      'from_status', v_history_entry->>'from_status',
      'to_status', v_history_entry->>'to_status'
    )
  );

  RETURN to_jsonb(v_snapshot);
END;
$$;

CREATE OR REPLACE FUNCTION reopen_inventory_snapshot(p_snapshot_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snapshot inventory_snapshots%ROWTYPE;
  v_actor_role text;
  v_actor_name text;
  v_reason text := NULLIF(btrim(p_reason), '');
  v_now timestamptz := now();
  v_history_entry jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'A reopen reason is required';
  END IF;

  SELECT *
  INTO v_snapshot
  FROM inventory_snapshots
  WHERE id = p_snapshot_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory snapshot not found';
  END IF;

  SELECT
    lp.role::text,
    COALESCE(NULLIF(lp.full_name, ''), NULLIF(lp.email, ''), 'Unknown')
  INTO v_actor_role, v_actor_name
  FROM lite_profiles lp
  WHERE lp.user_id = auth.uid()
    AND lp.is_active = true
    AND (lp.location_id = v_snapshot.location_id OR lp.role = 'enterprise_admin')
  ORDER BY CASE lp.role
    WHEN 'enterprise_admin' THEN 1
    WHEN 'location_admin' THEN 2
    WHEN 'manager' THEN 3
    WHEN 'supervisor' THEN 4
    WHEN 'csr' THEN 5
    WHEN 'pct' THEN 6
    ELSE 7
  END
  LIMIT 1;

  IF v_actor_role IS NULL THEN
    SELECT
      p.role,
      COALESCE(NULLIF(p.full_name, ''), NULLIF(p.email, ''), 'Unknown')
    INTO v_actor_role, v_actor_name
    FROM profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('owner', 'role_owner')
    LIMIT 1;
  END IF;

  IF v_actor_role NOT IN ('supervisor', 'manager', 'location_admin', 'enterprise_admin', 'owner', 'role_owner') THEN
    RAISE EXCEPTION 'Insufficient permissions. Must be Supervisor or above.';
  END IF;

  IF v_snapshot.status <> 'completed' THEN
    RETURN to_jsonb(v_snapshot);
  END IF;

  v_history_entry := jsonb_build_object(
    'ts', v_now,
    'type', 'status_change',
    'action', 'reopened',
    'user_id', auth.uid(),
    'user_name', v_actor_name,
    'reason', v_reason,
    'from_status', v_snapshot.status,
    'to_status', 'in_progress'
  );

  UPDATE inventory_snapshots
  SET
    status = 'in_progress',
    completed_at = NULL,
    completed_by = NULL,
    history = COALESCE(history, '[]'::jsonb) || jsonb_build_array(v_history_entry)
  WHERE id = p_snapshot_id
  RETURNING *
  INTO v_snapshot;

  INSERT INTO lite_audit_log (
    location_id,
    timestamp,
    user_id,
    user_name,
    action,
    resource_type,
    resource_id,
    details
  )
  VALUES (
    v_snapshot.location_id,
    v_now,
    auth.uid(),
    v_actor_name,
    'Inventory Reopened',
    'inventory_snapshot',
    v_snapshot.id::text,
    jsonb_build_object(
      'week_start', v_snapshot.week_start,
      'from_status', v_history_entry->>'from_status',
      'to_status', v_history_entry->>'to_status',
      'reason', v_reason
    )
  );

  RETURN to_jsonb(v_snapshot);
END;
$$;

GRANT EXECUTE ON FUNCTION complete_inventory_snapshot(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION reopen_inventory_snapshot(uuid, text) TO authenticated;

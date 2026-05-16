CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.labor_normalize_lite_role_key(p_role text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE lower(coalesce(p_role, ''))
    WHEN 'owner' THEN 'enterprise_admin'
    WHEN 'developer' THEN 'enterprise_admin'
    WHEN 'role_owner' THEN 'enterprise_admin'
    WHEN 'role_enterprise_admin' THEN 'enterprise_admin'
    WHEN 'regional' THEN 'multi_location_admin'
    WHEN 'multi_loc_admin' THEN 'multi_location_admin'
    WHEN 'admin' THEN 'location_admin'
    WHEN 'staff' THEN 'csr'
    WHEN 'role_staff' THEN 'csr'
    WHEN 'role_manager' THEN 'manager'
    ELSE lower(coalesce(p_role, ''))
  END;
$$;

CREATE OR REPLACE FUNCTION public.labor_lite_role_has_default_permission(
  p_role text,
  p_permission_key text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN lower(coalesce(p_role, '')) IN ('enterprise_admin', 'owner', 'developer', 'role_enterprise_admin', 'role_owner') THEN true
    WHEN p_permission_key IN ('Resort Upkeep Access', 'Resort Upkeep Complete') THEN
      lower(coalesce(p_role, '')) IN (
        'supervisor',
        'manager',
        'location_admin',
        'admin',
        'multi_location_admin',
        'multi_loc_admin',
        'regional',
        'enterprise_admin',
        'owner',
        'developer',
        'role_enterprise_admin',
        'role_owner'
      )
    WHEN p_permission_key = 'Resort Upkeep Manage' THEN
      lower(coalesce(p_role, '')) IN (
        'manager',
        'location_admin',
        'admin',
        'multi_location_admin',
        'multi_loc_admin',
        'regional',
        'enterprise_admin',
        'owner',
        'developer',
        'role_enterprise_admin',
        'role_owner'
      )
    WHEN p_permission_key IN ('Labor Interviews', 'Labor Manage Interviews', 'Labor Management') THEN
      lower(coalesce(p_role, '')) IN (
        'supervisor',
        'manager',
        'location_admin',
        'admin',
        'multi_location_admin',
        'multi_loc_admin',
        'regional',
        'enterprise_admin',
        'owner',
        'developer',
        'role_enterprise_admin',
        'role_owner'
      )
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.labor_has_lite_permission(
  p_location_id uuid,
  p_permission_key text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH caller_profiles AS (
    SELECT
      lp.role::text AS raw_role,
      public.labor_normalize_lite_role_key(lp.role::text) AS role_key
    FROM public.lite_profiles lp
    LEFT JOIN public.locations l
      ON l.slug = lp.location_id
      OR l.id::text = lp.location_id
    WHERE lp.user_id = auth.uid()
      AND lp.is_active = true
      AND (
        public.labor_normalize_lite_role_key(lp.role::text) IN (
          'enterprise_admin',
          'role_enterprise_admin',
          'role_owner',
          'owner',
          'developer',
          'multi_location_admin',
          'regional'
        )
        OR l.id = p_location_id
      )
  )
  SELECT EXISTS (
    SELECT 1
    FROM caller_profiles caller
    WHERE COALESCE(
      (
        SELECT perm.granted
        FROM public.lite_permissions perm
        WHERE public.labor_normalize_lite_role_key(perm.role_id::text) = caller.role_key
          AND perm.permission_key = p_permission_key
        ORDER BY perm.updated_at DESC NULLS LAST
        LIMIT 1
      ),
      public.labor_lite_role_has_default_permission(caller.raw_role, p_permission_key)
    ) = true
  );
$$;

CREATE OR REPLACE FUNCTION public.resort_upkeep_can_access(p_location_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT
    public.labor_has_lite_permission(p_location_id, 'Resort Upkeep Access')
    OR public.labor_has_lite_permission(p_location_id, 'Resort Upkeep Complete')
    OR public.labor_has_lite_permission(p_location_id, 'Resort Upkeep Manage');
$$;

CREATE OR REPLACE FUNCTION public.resort_upkeep_can_complete(p_location_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT
    public.labor_has_lite_permission(p_location_id, 'Resort Upkeep Complete')
    OR public.labor_has_lite_permission(p_location_id, 'Resort Upkeep Manage');
$$;

CREATE OR REPLACE FUNCTION public.resort_upkeep_can_manage(p_location_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT public.labor_has_lite_permission(p_location_id, 'Resort Upkeep Manage');
$$;

CREATE OR REPLACE FUNCTION public.resort_upkeep_has_any_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.locations l
    WHERE public.resort_upkeep_can_access(l.id)
  );
$$;

CREATE OR REPLACE FUNCTION app_private.resort_upkeep_audit_row_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row jsonb := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  v_location_id uuid := NULLIF(v_row->>'location_id', '')::uuid;
  v_actor_name text := COALESCE(NULLIF(v_row->>'updated_by_name', ''), NULLIF(v_row->>'created_by_name', ''), auth.jwt() ->> 'email');
  v_event_type text := lower(TG_OP);
BEGIN
  IF v_location_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_TABLE_NAME = 'resort_upkeep_item_states' AND TG_OP = 'UPDATE' THEN
    IF COALESCE(to_jsonb(OLD), '{}'::jsonb) - 'updated_at' IS NOT DISTINCT FROM COALESCE(to_jsonb(NEW), '{}'::jsonb) - 'updated_at' THEN
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO public.resort_upkeep_audit_events (
    location_id,
    entity_type,
    entity_id,
    event_type,
    summary,
    actor_user_id,
    actor_name,
    before_snapshot,
    after_snapshot
  )
  VALUES (
    v_location_id,
    TG_TABLE_NAME,
    NULLIF(v_row->>'id', '')::uuid,
    v_event_type,
    initcap(replace(TG_TABLE_NAME, 'resort_upkeep_', '')) || ' ' || lower(TG_OP),
    auth.uid(),
    v_actor_name,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION app_private.resort_upkeep_audit_row_change() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_resort_upkeep_periods_audit ON public.resort_upkeep_periods;
CREATE TRIGGER trg_resort_upkeep_periods_audit
  AFTER INSERT OR UPDATE ON public.resort_upkeep_periods
  FOR EACH ROW EXECUTE FUNCTION app_private.resort_upkeep_audit_row_change();

DROP TRIGGER IF EXISTS trg_resort_upkeep_item_states_audit ON public.resort_upkeep_item_states;
CREATE TRIGGER trg_resort_upkeep_item_states_audit
  AFTER INSERT OR UPDATE ON public.resort_upkeep_item_states
  FOR EACH ROW EXECUTE FUNCTION app_private.resort_upkeep_audit_row_change();

DROP TRIGGER IF EXISTS trg_resort_upkeep_vendors_audit ON public.resort_upkeep_vendors;
CREATE TRIGGER trg_resort_upkeep_vendors_audit
  AFTER INSERT OR UPDATE ON public.resort_upkeep_vendors
  FOR EACH ROW EXECUTE FUNCTION app_private.resort_upkeep_audit_row_change();

DROP TRIGGER IF EXISTS trg_resort_upkeep_vendor_logs_audit ON public.resort_upkeep_vendor_logs;
CREATE TRIGGER trg_resort_upkeep_vendor_logs_audit
  AFTER INSERT OR UPDATE ON public.resort_upkeep_vendor_logs
  FOR EACH ROW EXECUTE FUNCTION app_private.resort_upkeep_audit_row_change();

DROP TRIGGER IF EXISTS trg_resort_upkeep_licenses_audit ON public.resort_upkeep_licenses;
CREATE TRIGGER trg_resort_upkeep_licenses_audit
  AFTER INSERT OR UPDATE ON public.resort_upkeep_licenses
  FOR EACH ROW EXECUTE FUNCTION app_private.resort_upkeep_audit_row_change();

DROP TRIGGER IF EXISTS trg_resort_upkeep_license_logs_audit ON public.resort_upkeep_license_logs;
CREATE TRIGGER trg_resort_upkeep_license_logs_audit
  AFTER INSERT OR UPDATE ON public.resort_upkeep_license_logs
  FOR EACH ROW EXECUTE FUNCTION app_private.resort_upkeep_audit_row_change();

DROP TRIGGER IF EXISTS trg_resort_upkeep_attachments_audit ON public.resort_upkeep_attachments;
CREATE TRIGGER trg_resort_upkeep_attachments_audit
  AFTER INSERT OR UPDATE ON public.resort_upkeep_attachments
  FOR EACH ROW EXECUTE FUNCTION app_private.resort_upkeep_audit_row_change();

DROP FUNCTION IF EXISTS public.resort_upkeep_audit_row_change();

DROP POLICY IF EXISTS resort_upkeep_templates_read ON public.resort_upkeep_templates;
CREATE POLICY resort_upkeep_templates_read ON public.resort_upkeep_templates
  FOR SELECT
  USING (
    (location_id IS NOT NULL AND public.resort_upkeep_can_access(location_id))
    OR (location_id IS NULL AND public.resort_upkeep_has_any_access())
  );

DROP POLICY IF EXISTS resort_upkeep_template_versions_read ON public.resort_upkeep_template_versions;
CREATE POLICY resort_upkeep_template_versions_read ON public.resort_upkeep_template_versions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.resort_upkeep_templates t
      WHERE t.id = template_id
        AND (
          (t.location_id IS NOT NULL AND public.resort_upkeep_can_access(t.location_id))
          OR (t.location_id IS NULL AND public.resort_upkeep_has_any_access())
        )
    )
  );

DROP POLICY IF EXISTS resort_upkeep_templates_write ON public.resort_upkeep_templates;
CREATE POLICY resort_upkeep_templates_write ON public.resort_upkeep_templates
  FOR ALL
  USING (
    current_setting('app.resort_upkeep_rpc_write', true) = 'on'
    AND location_id IS NOT NULL
    AND public.resort_upkeep_can_manage(location_id)
  )
  WITH CHECK (
    current_setting('app.resort_upkeep_rpc_write', true) = 'on'
    AND location_id IS NOT NULL
    AND public.resort_upkeep_can_manage(location_id)
  );

DROP POLICY IF EXISTS resort_upkeep_template_versions_write ON public.resort_upkeep_template_versions;
CREATE POLICY resort_upkeep_template_versions_write ON public.resort_upkeep_template_versions
  FOR ALL
  USING (
    current_setting('app.resort_upkeep_rpc_write', true) = 'on'
    AND EXISTS (
      SELECT 1
      FROM public.resort_upkeep_templates t
      WHERE t.id = template_id
        AND t.location_id IS NOT NULL
        AND public.resort_upkeep_can_manage(t.location_id)
    )
  )
  WITH CHECK (
    current_setting('app.resort_upkeep_rpc_write', true) = 'on'
    AND EXISTS (
      SELECT 1
      FROM public.resort_upkeep_templates t
      WHERE t.id = template_id
        AND t.location_id IS NOT NULL
        AND public.resort_upkeep_can_manage(t.location_id)
    )
  );

DROP POLICY IF EXISTS resort_upkeep_articles_read ON public.resort_upkeep_troubleshooting_articles;
CREATE POLICY resort_upkeep_articles_read ON public.resort_upkeep_troubleshooting_articles
  FOR SELECT
  USING (is_active = true AND public.resort_upkeep_has_any_access());

DROP POLICY IF EXISTS resort_upkeep_audit_events_read ON public.resort_upkeep_audit_events;
CREATE POLICY resort_upkeep_audit_events_read ON public.resort_upkeep_audit_events
  FOR SELECT
  USING (
    (location_id IS NOT NULL AND public.resort_upkeep_can_access(location_id))
    OR (location_id IS NULL AND public.resort_upkeep_has_any_access())
  );

REVOKE ALL ON FUNCTION public.resort_upkeep_can_access(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resort_upkeep_can_complete(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resort_upkeep_can_manage(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resort_upkeep_has_any_access() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.labor_normalize_lite_role_key(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.labor_has_lite_permission(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.labor_normalize_lite_role_key(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resort_upkeep_can_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resort_upkeep_can_complete(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resort_upkeep_can_manage(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resort_upkeep_has_any_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.labor_has_lite_permission(uuid, text) TO authenticated;

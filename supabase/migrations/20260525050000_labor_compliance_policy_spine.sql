-- Labor compliance policy spine
-- Moves the labor compliance board from frontend constants to scoped,
-- configurable database policy with enterprise defaults and location overrides.

BEGIN;

-- ─── Configurable policy tables ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.labor_compliance_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_kind text NOT NULL CHECK (requirement_kind IN ('training', 'review_checkpoint')),
  scope_type text NOT NULL CHECK (scope_type IN ('enterprise', 'location')),
  scope_location_id uuid REFERENCES public.locations(id) ON DELETE CASCADE,
  parent_requirement_id uuid REFERENCES public.labor_compliance_requirements(id) ON DELETE RESTRICT,
  slug text NOT NULL,
  title text NOT NULL,
  description text,
  evidence_policy text NOT NULL DEFAULT 'checkbox_only' CHECK (evidence_policy IN ('checkbox_only', 'file_required', 'url_or_reference', 'internal_module')),
  renewal_due_date_required boolean NOT NULL DEFAULT false,
  due_rule jsonb NOT NULL DEFAULT '{}'::jsonb,
  display_group text NOT NULL DEFAULT 'training',
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid,
  updated_by_user_id uuid,
  CONSTRAINT labor_compliance_requirements_scope_shape_chk CHECK (
    (scope_type = 'enterprise' AND scope_location_id IS NULL)
    OR (scope_type = 'location' AND scope_location_id IS NOT NULL)
  ),
  CONSTRAINT labor_compliance_requirements_parent_scope_chk CHECK (
    (scope_type = 'enterprise' AND parent_requirement_id IS NULL)
    OR scope_type = 'location'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS labor_compliance_requirements_scope_slug_idx
  ON public.labor_compliance_requirements (scope_type, scope_location_id, slug) NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS labor_compliance_requirements_parent_idx
  ON public.labor_compliance_requirements (parent_requirement_id)
  WHERE parent_requirement_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS labor_compliance_requirements_location_active_idx
  ON public.labor_compliance_requirements (scope_location_id, is_active, display_group, display_order)
  WHERE scope_type = 'location';

CREATE TABLE IF NOT EXISTS public.labor_compliance_role_applicability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_id uuid NOT NULL REFERENCES public.labor_compliance_requirements(id) ON DELETE CASCADE,
  role_name text NOT NULL,
  is_required boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid,
  updated_by_user_id uuid,
  CONSTRAINT labor_compliance_role_applicability_role_name_chk CHECK (btrim(role_name) <> ''),
  CONSTRAINT labor_compliance_role_applicability_unique UNIQUE (requirement_id, role_name)
);

CREATE INDEX IF NOT EXISTS labor_compliance_role_applicability_role_idx
  ON public.labor_compliance_role_applicability (lower(role_name));

CREATE TABLE IF NOT EXISTS public.labor_compliance_evidence_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  labor_employee_id uuid NOT NULL REFERENCES public.labor_employees(id) ON DELETE CASCADE,
  requirement_id uuid NOT NULL REFERENCES public.labor_compliance_requirements(id) ON DELETE RESTRICT,
  completed_on date,
  renewal_due_date date,
  evidence_label text,
  labor_employee_document_id uuid REFERENCES public.labor_employee_documents(id) ON DELETE SET NULL,
  external_evidence_url text,
  internal_module_ref text,
  source_table text,
  source_id uuid,
  source_note text,
  is_current boolean NOT NULL DEFAULT true,
  superseded_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid,
  updated_by_user_id uuid,
  CONSTRAINT labor_compliance_evidence_completion_or_reference_chk CHECK (
    completed_on IS NOT NULL
    OR labor_employee_document_id IS NOT NULL
    OR NULLIF(btrim(COALESCE(external_evidence_url, '')), '') IS NOT NULL
    OR NULLIF(btrim(COALESCE(internal_module_ref, '')), '') IS NOT NULL
    OR NULLIF(btrim(COALESCE(source_note, '')), '') IS NOT NULL
  ),
  CONSTRAINT labor_compliance_evidence_renewal_after_completion_chk CHECK (completed_on IS NULL OR renewal_due_date IS NULL OR renewal_due_date >= completed_on)
);

CREATE INDEX IF NOT EXISTS labor_compliance_evidence_links_employee_requirement_idx
  ON public.labor_compliance_evidence_links (labor_employee_id, requirement_id, is_current, completed_on DESC, updated_at DESC);

CREATE INDEX IF NOT EXISTS labor_compliance_evidence_links_requirement_idx
  ON public.labor_compliance_evidence_links (requirement_id, renewal_due_date)
  WHERE is_current = true;

CREATE TABLE IF NOT EXISTS public.labor_compliance_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  labor_employee_id uuid NOT NULL REFERENCES public.labor_employees(id) ON DELETE CASCADE,
  requirement_id uuid NOT NULL REFERENCES public.labor_compliance_requirements(id) ON DELETE RESTRICT,
  exception_kind text NOT NULL CHECK (exception_kind IN ('historical_cleanup', 'waived', 'not_applicable_override')),
  original_due_date date,
  adjusted_due_date date,
  effective_on date NOT NULL DEFAULT CURRENT_DATE,
  expires_on date,
  superseded_at timestamptz,
  reason text NOT NULL,
  approved_by_user_id uuid,
  approved_by_name text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid,
  updated_by_user_id uuid,
  CONSTRAINT labor_compliance_exceptions_effective_window_chk CHECK (expires_on IS NULL OR expires_on >= effective_on),
  CONSTRAINT labor_compliance_exceptions_historical_cleanup_original_due_chk CHECK (exception_kind <> 'historical_cleanup' OR original_due_date IS NOT NULL),
  CONSTRAINT labor_compliance_exceptions_reason_chk CHECK (btrim(reason) <> '')
);

CREATE TABLE IF NOT EXISTS public.labor_compliance_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  operation text NOT NULL,
  row_id uuid,
  labor_employee_id uuid,
  requirement_id uuid,
  location_id uuid,
  actor_user_id uuid NOT NULL DEFAULT auth.uid(),
  before_snapshot jsonb,
  after_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS labor_compliance_audit_events_location_idx
  ON public.labor_compliance_audit_events (location_id, created_at DESC);

CREATE INDEX IF NOT EXISTS labor_compliance_audit_events_requirement_idx
  ON public.labor_compliance_audit_events (requirement_id, created_at DESC);

CREATE INDEX IF NOT EXISTS labor_compliance_exceptions_employee_requirement_idx
  ON public.labor_compliance_exceptions (labor_employee_id, requirement_id, effective_on DESC, expires_on DESC);

CREATE INDEX IF NOT EXISTS labor_compliance_exceptions_kind_idx
  ON public.labor_compliance_exceptions (exception_kind, effective_on DESC);

DROP TRIGGER IF EXISTS trg_labor_compliance_requirements_updated ON public.labor_compliance_requirements;
CREATE TRIGGER trg_labor_compliance_requirements_updated
  BEFORE UPDATE ON public.labor_compliance_requirements
  FOR EACH ROW EXECUTE FUNCTION public.training_updated_at_trigger();

DROP TRIGGER IF EXISTS trg_labor_compliance_role_applicability_updated ON public.labor_compliance_role_applicability;
CREATE TRIGGER trg_labor_compliance_role_applicability_updated
  BEFORE UPDATE ON public.labor_compliance_role_applicability
  FOR EACH ROW EXECUTE FUNCTION public.training_updated_at_trigger();

DROP TRIGGER IF EXISTS trg_labor_compliance_evidence_links_updated ON public.labor_compliance_evidence_links;
CREATE TRIGGER trg_labor_compliance_evidence_links_updated
  BEFORE UPDATE ON public.labor_compliance_evidence_links
  FOR EACH ROW EXECUTE FUNCTION public.training_updated_at_trigger();

DROP TRIGGER IF EXISTS trg_labor_compliance_exceptions_updated ON public.labor_compliance_exceptions;
CREATE TRIGGER trg_labor_compliance_exceptions_updated
  BEFORE UPDATE ON public.labor_compliance_exceptions
  FOR EACH ROW EXECUTE FUNCTION public.training_updated_at_trigger();

-- ─── Server-side permission helpers ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.labor_compliance_can_view(p_location_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_location_id IS NOT NULL AND (
    public.labor_has_lite_permission(p_location_id, 'Labor Compliance View')
    OR public.labor_has_lite_permission(p_location_id, 'Labor Compliance Update Evidence')
    OR public.labor_has_lite_permission(p_location_id, 'Labor Compliance Manage Policy')
    OR public.labor_has_lite_permission(p_location_id, 'Labor Compliance Historical Cleanup')
  );
$$;

CREATE OR REPLACE FUNCTION public.labor_compliance_can_update_evidence(p_location_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_location_id IS NOT NULL AND (
    public.labor_has_lite_permission(p_location_id, 'Labor Compliance Update Evidence')
    OR public.labor_has_lite_permission(p_location_id, 'Labor Compliance Manage Policy')
  );
$$;

CREATE OR REPLACE FUNCTION public.labor_compliance_can_manage_policy(p_location_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_location_id IS NOT NULL AND public.labor_has_lite_permission(p_location_id, 'Labor Compliance Manage Policy');
$$;

CREATE OR REPLACE FUNCTION public.labor_compliance_can_historical_cleanup(p_location_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_location_id IS NOT NULL AND (
    public.labor_has_lite_permission(p_location_id, 'Labor Compliance Historical Cleanup')
    OR public.labor_has_lite_permission(p_location_id, 'Labor Compliance Manage Policy')
  );
$$;

CREATE OR REPLACE FUNCTION public.labor_compliance_has_enterprise_policy_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.lite_profiles lp
    WHERE lp.user_id = auth.uid()
      AND lp.is_active = true
      AND public.labor_normalize_lite_role_key(lp.role::text) IN ('owner', 'enterprise_admin', 'developer', 'multi_location_admin')
  );
$$;

REVOKE ALL ON FUNCTION public.labor_compliance_can_view(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.labor_compliance_can_update_evidence(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.labor_compliance_can_manage_policy(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.labor_compliance_can_historical_cleanup(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.labor_compliance_has_enterprise_policy_access() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.labor_compliance_can_view(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.labor_compliance_can_update_evidence(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.labor_compliance_can_manage_policy(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.labor_compliance_can_historical_cleanup(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.labor_compliance_has_enterprise_policy_access() TO authenticated;

-- ─── Policy integrity and audit helpers ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.validate_labor_compliance_requirement_parent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_parent public.labor_compliance_requirements%ROWTYPE;
BEGIN
  IF NEW.scope_type = 'enterprise' THEN
    IF NEW.parent_requirement_id IS NOT NULL THEN
      RAISE EXCEPTION 'enterprise requirement cannot have parent_requirement_id' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.scope_type = 'location' AND NEW.parent_requirement_id IS NOT NULL THEN
    SELECT * INTO v_parent
    FROM public.labor_compliance_requirements
    WHERE id = NEW.parent_requirement_id;

    IF NOT FOUND OR v_parent.scope_type <> 'enterprise' OR v_parent.scope_location_id IS NOT NULL THEN
      RAISE EXCEPTION 'location override parent must be an enterprise requirement' USING ERRCODE = '23514';
    END IF;

    IF v_parent.requirement_kind <> NEW.requirement_kind THEN
      RAISE EXCEPTION 'location override requirement_kind must match parent requirement_kind' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_labor_compliance_requirements_validate_parent ON public.labor_compliance_requirements;
CREATE TRIGGER trg_labor_compliance_requirements_validate_parent
  BEFORE INSERT OR UPDATE OF scope_type, scope_location_id, parent_requirement_id, requirement_kind
  ON public.labor_compliance_requirements
  FOR EACH ROW EXECUTE FUNCTION public.validate_labor_compliance_requirement_parent();

CREATE UNIQUE INDEX IF NOT EXISTS labor_compliance_requirements_location_parent_unique_idx
  ON public.labor_compliance_requirements (scope_location_id, parent_requirement_id)
  WHERE scope_type = 'location' AND parent_requirement_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.labor_compliance_requirement_matches_employee_location(
  p_labor_employee_id uuid,
  p_requirement_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.labor_employees e
    JOIN public.labor_compliance_requirements r
      ON r.id = p_requirement_id
    WHERE e.id = p_labor_employee_id
      AND (
        (r.scope_type = 'enterprise' AND r.scope_location_id IS NULL)
        OR (r.scope_type = 'location' AND r.scope_location_id = e.location_id)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.audit_labor_compliance_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old jsonb := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END;
  v_new jsonb := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END;
  v_row jsonb := COALESCE(v_new, v_old);
  v_row_id uuid := NULLIF(v_row->>'id', '')::uuid;
  v_labor_employee_id uuid := NULLIF(v_row->>'labor_employee_id', '')::uuid;
  v_requirement_id uuid := NULLIF(
    COALESCE(
      v_row->>'requirement_id',
      CASE WHEN TG_TABLE_NAME = 'labor_compliance_requirements' THEN v_row->>'id' END
    ),
    ''
  )::uuid;
  v_location_id uuid := NULLIF(COALESCE(v_row->>'scope_location_id', v_row->>'location_id'), '')::uuid;
  v_actor_user_id uuid := COALESCE(
    auth.uid(),
    NULLIF(v_row->>'updated_by_user_id', '')::uuid,
    NULLIF(v_row->>'created_by_user_id', '')::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid
  );
BEGIN
  IF v_location_id IS NULL AND v_labor_employee_id IS NOT NULL THEN
    SELECT e.location_id INTO v_location_id
    FROM public.labor_employees e
    WHERE e.id = v_labor_employee_id;
  END IF;

  IF v_location_id IS NULL AND v_requirement_id IS NOT NULL THEN
    SELECT r.scope_location_id INTO v_location_id
    FROM public.labor_compliance_requirements r
    WHERE r.id = v_requirement_id
      AND r.scope_type = 'location';
  END IF;

  INSERT INTO public.labor_compliance_audit_events (
    table_name,
    operation,
    row_id,
    labor_employee_id,
    requirement_id,
    location_id,
    actor_user_id,
    before_snapshot,
    after_snapshot
  )
  VALUES (
    TG_TABLE_NAME,
    TG_OP,
    v_row_id,
    v_labor_employee_id,
    v_requirement_id,
    v_location_id,
    v_actor_user_id,
    v_old,
    v_new
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.validate_labor_compliance_requirement_parent() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.labor_compliance_requirement_matches_employee_location(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.audit_labor_compliance_mutation() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.labor_compliance_requirement_matches_employee_location(uuid, uuid) TO authenticated;

DROP TRIGGER IF EXISTS trg_labor_compliance_requirements_audit ON public.labor_compliance_requirements;
CREATE TRIGGER trg_labor_compliance_requirements_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.labor_compliance_requirements
  FOR EACH ROW EXECUTE FUNCTION public.audit_labor_compliance_mutation();

DROP TRIGGER IF EXISTS trg_labor_compliance_role_applicability_audit ON public.labor_compliance_role_applicability;
CREATE TRIGGER trg_labor_compliance_role_applicability_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.labor_compliance_role_applicability
  FOR EACH ROW EXECUTE FUNCTION public.audit_labor_compliance_mutation();

DROP TRIGGER IF EXISTS trg_labor_compliance_evidence_links_audit ON public.labor_compliance_evidence_links;
CREATE TRIGGER trg_labor_compliance_evidence_links_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.labor_compliance_evidence_links
  FOR EACH ROW EXECUTE FUNCTION public.audit_labor_compliance_mutation();

DROP TRIGGER IF EXISTS trg_labor_compliance_exceptions_audit ON public.labor_compliance_exceptions;
CREATE TRIGGER trg_labor_compliance_exceptions_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.labor_compliance_exceptions
  FOR EACH ROW EXECUTE FUNCTION public.audit_labor_compliance_mutation();

-- ─── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.labor_compliance_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labor_compliance_role_applicability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labor_compliance_evidence_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labor_compliance_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labor_compliance_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS labor_compliance_requirements_read ON public.labor_compliance_requirements;
CREATE POLICY labor_compliance_requirements_read ON public.labor_compliance_requirements
  FOR SELECT TO authenticated
  USING (
    (scope_type = 'enterprise' AND public.labor_compliance_has_enterprise_policy_access())
    OR (scope_type = 'location' AND public.labor_compliance_can_view(scope_location_id))
  );

DROP POLICY IF EXISTS labor_compliance_requirements_write ON public.labor_compliance_requirements;
CREATE POLICY labor_compliance_requirements_write ON public.labor_compliance_requirements
  FOR ALL TO authenticated
  USING (
    (scope_type = 'enterprise' AND public.labor_compliance_has_enterprise_policy_access())
    OR (scope_type = 'location' AND public.labor_compliance_can_manage_policy(scope_location_id))
  )
  WITH CHECK (
    (scope_type = 'enterprise' AND public.labor_compliance_has_enterprise_policy_access())
    OR (scope_type = 'location' AND public.labor_compliance_can_manage_policy(scope_location_id))
  );

DROP POLICY IF EXISTS labor_compliance_role_applicability_read ON public.labor_compliance_role_applicability;
CREATE POLICY labor_compliance_role_applicability_read ON public.labor_compliance_role_applicability
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.labor_compliance_requirements r
      WHERE r.id = requirement_id
        AND (
          (r.scope_type = 'enterprise' AND public.labor_compliance_has_enterprise_policy_access())
          OR (r.scope_type = 'location' AND public.labor_compliance_can_view(r.scope_location_id))
        )
    )
  );

DROP POLICY IF EXISTS labor_compliance_role_applicability_write ON public.labor_compliance_role_applicability;
CREATE POLICY labor_compliance_role_applicability_write ON public.labor_compliance_role_applicability
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.labor_compliance_requirements r
      WHERE r.id = requirement_id
        AND (
          (r.scope_type = 'enterprise' AND public.labor_compliance_has_enterprise_policy_access())
          OR (r.scope_type = 'location' AND public.labor_compliance_can_manage_policy(r.scope_location_id))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.labor_compliance_requirements r
      WHERE r.id = requirement_id
        AND (
          (r.scope_type = 'enterprise' AND public.labor_compliance_has_enterprise_policy_access())
          OR (r.scope_type = 'location' AND public.labor_compliance_can_manage_policy(r.scope_location_id))
        )
    )
  );

DROP POLICY IF EXISTS labor_compliance_evidence_links_read ON public.labor_compliance_evidence_links;
CREATE POLICY labor_compliance_evidence_links_read ON public.labor_compliance_evidence_links
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.labor_employees e
      WHERE e.id = labor_employee_id
        AND public.labor_compliance_can_view(e.location_id)
    )
  );

DROP POLICY IF EXISTS labor_compliance_evidence_links_write ON public.labor_compliance_evidence_links;
CREATE POLICY labor_compliance_evidence_links_write ON public.labor_compliance_evidence_links
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.labor_employees e
      WHERE e.id = labor_employee_id
        AND public.labor_compliance_can_update_evidence(e.location_id)
    )
    AND public.labor_compliance_requirement_matches_employee_location(labor_employee_id, requirement_id)
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.labor_employees e
      WHERE e.id = labor_employee_id
        AND public.labor_compliance_can_update_evidence(e.location_id)
    )
    AND public.labor_compliance_requirement_matches_employee_location(labor_employee_id, requirement_id)
  );

DROP POLICY IF EXISTS labor_compliance_exceptions_read ON public.labor_compliance_exceptions;
CREATE POLICY labor_compliance_exceptions_read ON public.labor_compliance_exceptions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.labor_employees e
      WHERE e.id = labor_employee_id
        AND public.labor_compliance_can_view(e.location_id)
    )
  );

DROP POLICY IF EXISTS labor_compliance_exceptions_write ON public.labor_compliance_exceptions;
CREATE POLICY labor_compliance_exceptions_write ON public.labor_compliance_exceptions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.labor_employees e
      WHERE e.id = labor_employee_id
        AND (
          public.labor_compliance_can_manage_policy(e.location_id)
          OR (exception_kind = 'historical_cleanup' AND public.labor_compliance_can_historical_cleanup(e.location_id))
        )
    )
    AND public.labor_compliance_requirement_matches_employee_location(labor_employee_id, requirement_id)
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.labor_employees e
      WHERE e.id = labor_employee_id
        AND (
          public.labor_compliance_can_manage_policy(e.location_id)
          OR (exception_kind = 'historical_cleanup' AND public.labor_compliance_can_historical_cleanup(e.location_id))
        )
    )
    AND public.labor_compliance_requirement_matches_employee_location(labor_employee_id, requirement_id)
  );

DROP POLICY IF EXISTS labor_compliance_audit_events_read ON public.labor_compliance_audit_events;
CREATE POLICY labor_compliance_audit_events_read ON public.labor_compliance_audit_events
  FOR SELECT TO authenticated
  USING (
    (location_id IS NULL AND public.labor_compliance_has_enterprise_policy_access())
    OR (location_id IS NOT NULL AND public.labor_compliance_can_view(location_id))
  );

REVOKE ALL ON TABLE public.labor_compliance_requirements FROM PUBLIC;
REVOKE ALL ON TABLE public.labor_compliance_role_applicability FROM PUBLIC;
REVOKE ALL ON TABLE public.labor_compliance_evidence_links FROM PUBLIC;
REVOKE ALL ON TABLE public.labor_compliance_exceptions FROM PUBLIC;
REVOKE ALL ON TABLE public.labor_compliance_audit_events FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.labor_compliance_requirements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.labor_compliance_role_applicability TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.labor_compliance_evidence_links TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.labor_compliance_exceptions TO authenticated;
GRANT SELECT ON TABLE public.labor_compliance_audit_events TO authenticated;

-- ─── Board resolver RPC ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_labor_compliance_board(
  p_location_id uuid,
  p_as_of date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_as_of date := COALESCE(p_as_of, CURRENT_DATE);
  v_result jsonb;
BEGIN
  IF p_location_id IS NULL THEN
    RAISE EXCEPTION 'p_location_id is required' USING ERRCODE = '22023';
  END IF;

  IF NOT public.labor_compliance_can_view(p_location_id) THEN
    RAISE EXCEPTION 'Insufficient permission to view labor compliance board for location %', p_location_id
      USING ERRCODE = '42501';
  END IF;

  WITH candidate_requirements AS (
    SELECT
      r.*,
      COALESCE(r.parent_requirement_id, r.id) AS policy_key,
      CASE WHEN r.scope_type = 'location' THEN 1 ELSE 0 END AS scope_rank
    FROM public.labor_compliance_requirements r
    WHERE r.is_active = true
      AND (
        (r.scope_type = 'enterprise' AND r.scope_location_id IS NULL)
        OR (r.scope_type = 'location' AND r.scope_location_id = p_location_id)
      )
  ),
  effective_requirements AS (
    SELECT *
    FROM (
      SELECT
        cr.*,
        row_number() OVER (
          PARTITION BY cr.policy_key
          ORDER BY cr.scope_rank DESC, cr.updated_at DESC, cr.created_at DESC, cr.id
        ) AS rn
      FROM candidate_requirements cr
    ) ranked
    WHERE ranked.rn = 1
  ),
  employees AS (
    SELECT e.*
    FROM public.labor_employees e
    WHERE e.location_id = p_location_id
      AND COALESCE(e.employment_status::text, 'active') NOT IN ('terminated', 'quit', 'archived')
      AND (e.end_date IS NULL OR e.end_date >= v_as_of)
  ),
  applicable AS (
    SELECT
      e.id AS labor_employee_id,
      er.*
    FROM employees e
    CROSS JOIN effective_requirements er
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.labor_compliance_role_applicability ra
      WHERE ra.requirement_id = er.id
        AND ra.is_required = true
    )
    OR EXISTS (
      SELECT 1
      FROM public.labor_compliance_role_applicability ra
      WHERE ra.requirement_id = er.id
        AND ra.is_required = true
        AND (
          lower(btrim(ra.role_name)) = lower(btrim(COALESCE(e.position_title, '')))
          OR lower(btrim(COALESCE(e.position_title, ''))) LIKE '%' || lower(btrim(ra.role_name)) || '%'
        )
    )
  ),
  latest_evidence AS (
    SELECT DISTINCT ON (el.labor_employee_id, COALESCE(rr.parent_requirement_id, rr.id))
      el.*,
      COALESCE(rr.parent_requirement_id, rr.id) AS policy_key
    FROM public.labor_compliance_evidence_links el
    JOIN public.labor_compliance_requirements rr
      ON rr.id = el.requirement_id
    WHERE el.is_current = true
      AND el.superseded_at IS NULL
      AND public.labor_compliance_requirement_matches_employee_location(el.labor_employee_id, el.requirement_id)
    ORDER BY
      el.labor_employee_id,
      COALESCE(rr.parent_requirement_id, rr.id),
      el.completed_on DESC NULLS LAST,
      el.updated_at DESC,
      el.created_at DESC
  ),
  latest_exceptions AS (
    SELECT DISTINCT ON (ex.labor_employee_id, COALESCE(rr.parent_requirement_id, rr.id))
      ex.*,
      COALESCE(rr.parent_requirement_id, rr.id) AS policy_key
    FROM public.labor_compliance_exceptions ex
    JOIN public.labor_compliance_requirements rr
      ON rr.id = ex.requirement_id
    WHERE ex.effective_on <= v_as_of
      AND ex.superseded_at IS NULL
      AND public.labor_compliance_requirement_matches_employee_location(ex.labor_employee_id, ex.requirement_id)
      AND (ex.expires_on IS NULL OR ex.expires_on >= v_as_of)
    ORDER BY
      ex.labor_employee_id,
      COALESCE(rr.parent_requirement_id, rr.id),
      ex.effective_on DESC,
      ex.created_at DESC
  ),
  legacy_certifications AS (
    SELECT DISTINCT ON (ec.labor_employee_id, er.policy_key)
      ec.labor_employee_id,
      er.policy_key,
      ec.id AS legacy_certification_id,
      ec.completed_on,
      ec.expires_on,
      ec.labor_employee_document_id,
      ec.external_document_url,
      ec.source_note
    FROM effective_requirements er
    JOIN public.certification_requirements cr
      ON cr.slug IN (
        SELECT jsonb_array_elements_text(
          CASE
            WHEN jsonb_typeof(er.metadata->'legacy_slugs') = 'array' THEN er.metadata->'legacy_slugs'
            ELSE '[]'::jsonb
          END
        )
      )
    JOIN public.employee_certifications ec
      ON ec.requirement_id = cr.id
    WHERE er.requirement_kind = 'training'
    ORDER BY ec.labor_employee_id, er.policy_key, ec.completed_on DESC, ec.created_at DESC
  ),
  legacy_reviews AS (
    SELECT DISTINCT ON (eri.labor_employee_id, er.policy_key)
      eri.labor_employee_id,
      er.policy_key,
      eri.id AS legacy_review_instance_id,
      eri.due_date,
      eri.completed_at,
      eri.status::text AS status
    FROM effective_requirements er
    JOIN public.employee_review_instances eri
      ON eri.review_cycle::text = er.metadata->>'legacy_review_cycle'
    WHERE er.requirement_kind = 'review_checkpoint'
    ORDER BY eri.labor_employee_id, er.policy_key, COALESCE(eri.completed_at, eri.updated_at, eri.created_at) DESC
  ),
  status_base AS (
    SELECT
      a.labor_employee_id,
      a.id AS requirement_id,
      a.parent_requirement_id,
      a.policy_key,
      a.slug,
      a.title,
      a.requirement_kind,
      a.evidence_policy,
      a.renewal_due_date_required,
      a.due_rule,
      a.display_group,
      a.display_order,
      a.metadata AS requirement_metadata,
      le.id AS evidence_link_id,
      COALESCE(le.completed_on, lc.completed_on, CASE WHEN lr.status = 'completed' THEN lr.completed_at::date ELSE NULL END) AS completed_on,
      COALESCE(le.renewal_due_date, lc.expires_on) AS renewal_due_date,
      CASE
        WHEN lr.due_date IS NOT NULL THEN lr.due_date
        WHEN a.due_rule->>'anchor' = 'start_date'
          AND a.due_rule ? 'offset_days'
          AND e.start_date IS NOT NULL
          THEN e.start_date + ((a.due_rule->>'offset_days')::integer)
        WHEN a.renewal_due_date_required THEN COALESCE(le.renewal_due_date, lc.expires_on)
        ELSE NULL::date
      END AS due_date,
      lx.original_due_date,
      lx.adjusted_due_date,
      lx.exception_kind,
      lx.reason AS exception_reason,
      lc.legacy_certification_id,
      lr.legacy_review_instance_id,
      lr.status AS legacy_review_status,
      COALESCE(le.labor_employee_document_id, lc.labor_employee_document_id) AS labor_employee_document_id,
      COALESCE(le.external_evidence_url, lc.external_document_url) AS external_evidence_url,
      COALESCE(le.source_note, lc.source_note) AS source_note
    FROM applicable a
    JOIN employees e
      ON e.id = a.labor_employee_id
    LEFT JOIN latest_evidence le
      ON le.labor_employee_id = a.labor_employee_id
     AND le.policy_key = a.policy_key
    LEFT JOIN latest_exceptions lx
      ON lx.labor_employee_id = a.labor_employee_id
     AND lx.policy_key = a.policy_key
    LEFT JOIN legacy_certifications lc
      ON lc.labor_employee_id = a.labor_employee_id
     AND lc.policy_key = a.policy_key
    LEFT JOIN legacy_reviews lr
      ON lr.labor_employee_id = a.labor_employee_id
     AND lr.policy_key = a.policy_key
  ),
  status_rows AS (
    SELECT
      sb.*,
      CASE
        WHEN sb.exception_kind = 'not_applicable_override' THEN 'not_applicable'
        WHEN sb.exception_kind = 'waived' THEN 'waived'
        WHEN sb.exception_kind = 'historical_cleanup' THEN 'historical_cleanup'
        WHEN sb.legacy_review_status = 'completed' THEN 'complete'
        WHEN sb.completed_on IS NOT NULL
          AND sb.renewal_due_date_required = true
          AND sb.renewal_due_date IS NULL
          THEN 'missing_renewal_due_date'
        WHEN sb.completed_on IS NOT NULL
          AND sb.renewal_due_date_required = true
          AND sb.renewal_due_date < v_as_of
          THEN 'expired'
        WHEN sb.completed_on IS NOT NULL
          AND (sb.renewal_due_date_required = false OR sb.renewal_due_date >= v_as_of)
          THEN 'complete'
        WHEN sb.legacy_review_status IN ('in_progress', 'scheduled') THEN sb.legacy_review_status
        WHEN sb.due_date IS NOT NULL AND sb.due_date < v_as_of THEN 'overdue'
        WHEN sb.due_date IS NOT NULL THEN 'scheduled'
        ELSE 'not_started'
      END AS compliance_status
    FROM status_base sb
  ),
  employee_rows AS (
    SELECT
      e.id,
      e.full_name,
      e.position_title,
      e.employment_status::text AS employment_status,
      e.start_date,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'requirement_id', sr.requirement_id,
            'parent_requirement_id', sr.parent_requirement_id,
            'slug', sr.slug,
            'title', sr.title,
            'requirement_kind', sr.requirement_kind,
            'status', sr.compliance_status,
            'due_date', sr.due_date,
            'original_due_date', COALESCE(sr.original_due_date, sr.due_date),
            'adjusted_due_date', sr.adjusted_due_date,
            'completed_on', sr.completed_on,
            'renewal_due_date', sr.renewal_due_date,
            'evidence_policy', sr.evidence_policy,
            'renewal_due_date_required', sr.renewal_due_date_required,
            'evidence_link_id', sr.evidence_link_id,
            'labor_employee_document_id', sr.labor_employee_document_id,
            'external_evidence_url', sr.external_evidence_url,
            'source_note', sr.source_note,
            'exception_kind', sr.exception_kind,
            'exception_reason', sr.exception_reason,
            'compatibility', jsonb_strip_nulls(jsonb_build_object(
              'legacy_certification_id', sr.legacy_certification_id,
              'legacy_review_instance_id', sr.legacy_review_instance_id,
              'legacy_review_status', sr.legacy_review_status
            ))
          )
          ORDER BY sr.display_group, sr.display_order, sr.title
        ) FILTER (WHERE sr.requirement_id IS NOT NULL),
        '[]'::jsonb
      ) AS requirements
    FROM employees e
    LEFT JOIN status_rows sr
      ON sr.labor_employee_id = e.id
    GROUP BY e.id, e.full_name, e.position_title, e.employment_status, e.start_date
  )
  SELECT jsonb_build_object(
    'location_id', p_location_id,
    'as_of', v_as_of,
    'generated_at', now(),
    'requirements', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', er.id,
          'parent_requirement_id', er.parent_requirement_id,
          'slug', er.slug,
          'title', er.title,
          'requirement_kind', er.requirement_kind,
          'scope_type', er.scope_type,
          'scope_location_id', er.scope_location_id,
          'evidence_policy', er.evidence_policy,
          'renewal_due_date_required', er.renewal_due_date_required,
          'due_rule', er.due_rule,
          'display_group', er.display_group,
          'display_order', er.display_order,
          'metadata', er.metadata
        )
        ORDER BY er.display_group, er.display_order, er.title
      )
      FROM effective_requirements er
    ), '[]'::jsonb),
    'employees', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'labor_employee_id', erows.id,
          'full_name', erows.full_name,
          'position_title', erows.position_title,
          'employment_status', erows.employment_status,
          'start_date', erows.start_date,
          'requirements', erows.requirements
        )
        ORDER BY erows.full_name, erows.id
      )
      FROM employee_rows erows
    ), '[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_labor_compliance_board(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_labor_compliance_board(uuid, date) TO authenticated;

-- ─── K9 legacy enterprise defaults ──────────────────────────────────────────
-- These rows preserve prior UI slugs/cycles as metadata while making the active
-- policy configurable and overrideable by location rows.

INSERT INTO public.labor_compliance_requirements (
  requirement_kind,
  scope_type,
  scope_location_id,
  parent_requirement_id,
  slug,
  title,
  description,
  evidence_policy,
  renewal_due_date_required,
  due_rule,
  display_group,
  display_order,
  metadata,
  is_active
)
VALUES
  (
    'training',
    'enterprise',
    NULL,
    NULL,
    'franchisor_training_guide',
    'Franchisor Training Guide',
    'Legacy Incite/franchisor training guide completion with uploaded evidence.',
    'file_required',
    false,
    jsonb_build_object('anchor', 'start_date'),
    'training',
    10,
    jsonb_build_object(
      'legacy_slugs', jsonb_build_array('incite_modules'),
      'legacy_label', 'Incite Modules',
      'legacy_source', 'LABOR_TRAINING_REQUIREMENT_DEFINITIONS',
      'compatibility_slug', 'incite_modules'
    ),
    true
  ),
  (
    'training',
    'enterprise',
    NULL,
    NULL,
    'dog_cpr',
    'Dog CPR Certification',
    'Annual dog CPR certification with uploaded file or certificate reference.',
    'url_or_reference',
    true,
    jsonb_build_object('renewal_interval_days', 365, 'reminder_window_days', 30),
    'training',
    20,
    jsonb_build_object(
      'legacy_slugs', jsonb_build_array('dog_cpr_annual'),
      'legacy_label', 'Dog CPR Certification',
      'legacy_frequency', 'annual',
      'compatibility_slug', 'dog_cpr_annual',
      'renewal_due_date_required', true
    ),
    true
  ),
  (
    'training',
    'enterprise',
    NULL,
    NULL,
    'ppbc_level_1',
    'PPBC Level 1',
    'PPBC Level 1 online certification for leadership roles with uploaded evidence.',
    'file_required',
    false,
    jsonb_build_object('anchor', 'start_date'),
    'training',
    30,
    jsonb_build_object(
      'legacy_slugs', jsonb_build_array('ppbc_level_1'),
      'legacy_label', 'PPBC Level 1',
      'legacy_ppbc_only', true,
      'compatibility_slug', 'ppbc_level_1'
    ),
    true
  ),
  (
    'training',
    'enterprise',
    NULL,
    NULL,
    'ppbc_level_2',
    'PPBC Level 2',
    'PPBC Level 2 online certification for leadership roles with uploaded evidence.',
    'file_required',
    false,
    jsonb_build_object('anchor', 'start_date'),
    'training',
    40,
    jsonb_build_object(
      'legacy_slugs', jsonb_build_array('ppbc_level_2'),
      'legacy_label', 'PPBC Level 2',
      'legacy_ppbc_only', true,
      'compatibility_slug', 'ppbc_level_2'
    ),
    true
  ),
  (
    'review_checkpoint',
    'enterprise',
    NULL,
    NULL,
    'review_30_day',
    '30-Day Review',
    'First performance review checkpoint due 30 days after start date.',
    'file_required',
    false,
    jsonb_build_object('anchor', 'start_date', 'offset_days', 30),
    'reviews',
    110,
    jsonb_build_object(
      'legacy_review_cycle', '30_day',
      'legacy_cycles', jsonb_build_array('30_day'),
      'compatibility_slug', 'review_30_day'
    ),
    true
  ),
  (
    'review_checkpoint',
    'enterprise',
    NULL,
    NULL,
    'review_60_day',
    '60-Day Review',
    'Second performance review checkpoint due 60 days after start date.',
    'file_required',
    false,
    jsonb_build_object('anchor', 'start_date', 'offset_days', 60),
    'reviews',
    120,
    jsonb_build_object(
      'legacy_review_cycle', '60_day',
      'legacy_cycles', jsonb_build_array('60_day'),
      'compatibility_slug', 'review_60_day'
    ),
    true
  ),
  (
    'review_checkpoint',
    'enterprise',
    NULL,
    NULL,
    'review_90_day',
    '90-Day Review',
    'Third performance review checkpoint due 90 days after start date.',
    'file_required',
    false,
    jsonb_build_object('anchor', 'start_date', 'offset_days', 90),
    'reviews',
    130,
    jsonb_build_object(
      'legacy_review_cycle', '90_day',
      'legacy_cycles', jsonb_build_array('90_day'),
      'compatibility_slug', 'review_90_day'
    ),
    true
  )
ON CONFLICT (scope_type, scope_location_id, slug) DO UPDATE
SET
  requirement_kind = EXCLUDED.requirement_kind,
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  evidence_policy = EXCLUDED.evidence_policy,
  renewal_due_date_required = EXCLUDED.renewal_due_date_required,
  due_rule = EXCLUDED.due_rule,
  display_group = EXCLUDED.display_group,
  display_order = EXCLUDED.display_order,
  metadata = public.labor_compliance_requirements.metadata || EXCLUDED.metadata,
  is_active = EXCLUDED.is_active,
  updated_at = now();

WITH seeded_requirements AS (
  SELECT id
  FROM public.labor_compliance_requirements
  WHERE scope_type = 'enterprise'
    AND scope_location_id IS NULL
    AND slug IN (
      'franchisor_training_guide',
      'dog_cpr',
      'ppbc_level_1',
      'ppbc_level_2',
      'review_30_day',
      'review_60_day',
      'review_90_day'
    )
), default_roles(role_name) AS (
  VALUES
    ('Supervisor'),
    ('Assistant Manager'),
    ('General Manager')
)
INSERT INTO public.labor_compliance_role_applicability (
  requirement_id,
  role_name,
  is_required,
  metadata
)
SELECT
  seeded_requirements.id,
  default_roles.role_name,
  true,
  jsonb_build_object('seed', 'k9_legacy_labor_compliance_defaults')
FROM seeded_requirements
CROSS JOIN default_roles
ON CONFLICT (requirement_id, role_name) DO UPDATE
SET
  is_required = EXCLUDED.is_required,
  metadata = public.labor_compliance_role_applicability.metadata || EXCLUDED.metadata,
  updated_at = now();

COMMENT ON TABLE public.labor_compliance_requirements IS
  'Canonical labor compliance policy spine. Enterprise rows are defaults; location rows may override parent requirements without frontend constants.';
COMMENT ON TABLE public.labor_compliance_role_applicability IS
  'Configurable mapping from compliance requirements to labor role names.';
COMMENT ON TABLE public.labor_compliance_evidence_links IS
  'Evidence and completion links for labor compliance requirements, including legacy certification/review compatibility sources.';
COMMENT ON TABLE public.labor_compliance_exceptions IS
  'Auditable waivers, not-applicable overrides, and historical cleanup exceptions for labor compliance.';
COMMENT ON FUNCTION public.get_labor_compliance_board(uuid, date) IS
  'Resolves effective labor compliance policy for a location and date, applying location overrides, evidence, legacy compatibility records, and exceptions.';

COMMIT;

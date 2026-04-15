-- Labor employee RPC enum hotfix
-- Ensures roster create/edit writes cast correctly into labor_employment_status.

CREATE OR REPLACE FUNCTION public.create_labor_employee(
  p_location_ref text,
  p_full_name text,
  p_position_title text,
  p_start_date date,
  p_end_date date DEFAULT NULL,
  p_linked_user_id uuid DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL,
  p_actor_name text DEFAULT NULL
)
RETURNS public.labor_employees
LANGUAGE plpgsql
AS $$
DECLARE
  v_location_id uuid;
  v_employee public.labor_employees%ROWTYPE;
  v_full_name text := trim(COALESCE(p_full_name, ''));
  v_position_title text := trim(COALESCE(p_position_title, ''));
BEGIN
  IF v_full_name = '' THEN
    RAISE EXCEPTION 'Employee full name is required';
  END IF;

  IF v_position_title = '' THEN
    RAISE EXCEPTION 'Position title is required';
  END IF;

  IF p_start_date IS NULL THEN
    RAISE EXCEPTION 'Start date is required';
  END IF;

  v_location_id := public.resolve_labor_location_id(p_location_ref, p_actor_user_id);
  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'Unable to resolve location from %', p_location_ref;
  END IF;

  INSERT INTO public.labor_employees (
    location_id,
    linked_user_id,
    linked_lite_profile_id,
    full_name,
    position_title,
    employment_status,
    start_date,
    end_date,
    metadata,
    created_by_user_id,
    updated_by_user_id
  )
  VALUES (
    v_location_id,
    p_linked_user_id,
    (
      SELECT lp.id
      FROM public.lite_profiles lp
      LEFT JOIN public.locations l
        ON l.slug = lp.location_id
      WHERE lp.user_id = p_linked_user_id
        AND (l.id = v_location_id OR lp.role = 'enterprise_admin')
      LIMIT 1
    ),
    v_full_name,
    v_position_title,
    (
      CASE
        WHEN p_end_date IS NULL THEN 'active'
        ELSE 'terminated'
      END
    )::public.labor_employment_status,
    p_start_date,
    p_end_date,
    jsonb_build_object(
      'created_via', 'labor_management',
      'actor_name', NULLIF(trim(COALESCE(p_actor_name, '')), '')
    ),
    p_actor_user_id,
    p_actor_user_id
  )
  RETURNING *
  INTO v_employee;

  RETURN v_employee;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_labor_employee(
  p_employee_id uuid,
  p_full_name text DEFAULT NULL,
  p_position_title text DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_end_date_provided boolean DEFAULT false,
  p_linked_user_id uuid DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS public.labor_employees
LANGUAGE plpgsql
AS $$
DECLARE
  v_employee public.labor_employees%ROWTYPE;
BEGIN
  UPDATE public.labor_employees
  SET
    full_name = COALESCE(NULLIF(trim(COALESCE(p_full_name, '')), ''), full_name),
    position_title = COALESCE(NULLIF(trim(COALESCE(p_position_title, '')), ''), position_title),
    start_date = COALESCE(p_start_date, start_date),
    end_date = CASE WHEN p_end_date_provided THEN p_end_date ELSE end_date END,
    linked_user_id = COALESCE(p_linked_user_id, linked_user_id),
    employment_status = CASE
      WHEN p_end_date_provided AND p_end_date IS NULL THEN 'active'::public.labor_employment_status
      WHEN p_end_date_provided AND p_end_date IS NOT NULL THEN 'terminated'::public.labor_employment_status
      WHEN end_date IS NULL THEN 'active'::public.labor_employment_status
      ELSE employment_status
    END,
    first_shift_date = NULL,
    assigned_trainer_user_id = NULL,
    assigned_trainer_name = NULL,
    assigned_manager_user_id = NULL,
    assigned_manager_name = NULL,
    updated_by_user_id = COALESCE(p_actor_user_id, updated_by_user_id),
    updated_at = now()
  WHERE id = p_employee_id
  RETURNING *
  INTO v_employee;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Labor employee % not found', p_employee_id;
  END IF;

  RETURN v_employee;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_labor_employee(text, text, text, date, date, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_labor_employee(uuid, text, text, date, date, boolean, uuid, uuid) TO authenticated;

DO $$
DECLARE
  v_employee public.labor_employees%ROWTYPE;
  v_template_id uuid;
  v_record_id uuid;
  v_old_sheet_name text := 'Sophia Miekle';
BEGIN
  SELECT *
  INTO v_employee
  FROM public.labor_employees
  WHERE employment_status = 'active'
    AND regexp_replace(lower(full_name), '[^a-z0-9]+', '', 'g') = 'sophiameikle'
  ORDER BY COALESCE(first_shift_date, start_date) DESC NULLS LAST, full_name
  LIMIT 1;

  IF v_employee.id IS NULL THEN
    RAISE NOTICE 'No active Sophia Meikle roster employee found; CSR readiness pairing skipped.';
    RETURN;
  END IF;

  SELECT id
  INTO v_template_id
  FROM public.training_templates
  WHERE slug = 'csr_team_readiness_board'
  LIMIT 1;

  IF v_template_id IS NULL THEN
    RAISE NOTICE 'CSR team readiness board template not found; Sophia Meikle pairing skipped.';
    RETURN;
  END IF;

  SELECT id
  INTO v_record_id
  FROM public.training_records
  WHERE template_id = v_template_id
    AND overall_status <> 'archived'
    AND (
      labor_employee_id = v_employee.id
      OR (
        labor_employee_id IS NULL
        AND regexp_replace(lower(employee_full_name), '[^a-z0-9]+', '', 'g') = 'sophiamiekle'
      )
    )
  ORDER BY (labor_employee_id = v_employee.id) DESC, created_at DESC
  LIMIT 1;

  IF v_record_id IS NULL THEN
    RAISE NOTICE 'No Sophia Miekle CSR readiness record found to pair with Sophia Meikle.';
    RETURN;
  END IF;

  UPDATE public.training_records
  SET
    labor_employee_id = v_employee.id,
    employee_id = v_employee.id,
    employee_name_first = split_part(v_employee.full_name, ' ', 1),
    employee_name_last = NULLIF(btrim(substring(v_employee.full_name FROM length(split_part(v_employee.full_name, ' ', 1)) + 1)), ''),
    employee_full_name = v_employee.full_name,
    target_role = COALESCE(NULLIF(v_employee.position_title, ''), target_role, 'CSR'),
    location_id = COALESCE(v_employee.location_id, location_id),
    hire_date = COALESCE(v_employee.first_shift_date, v_employee.start_date, hire_date),
    assigned_trainer_name = COALESCE(v_employee.assigned_trainer_name, assigned_trainer_name),
    assigned_manager_name = COALESCE(v_employee.assigned_manager_name, assigned_manager_name),
    updated_at = now()
  WHERE id = v_record_id;

  UPDATE public.training_template_versions version
  SET metadata = jsonb_set(
    version.metadata,
    '{import_report,employee_matching}',
    jsonb_build_object(
      'matched',
        COALESCE((
          SELECT jsonb_agg(match_entry)
          FROM jsonb_array_elements(COALESCE(version.metadata->'import_report'->'employee_matching'->'matched', '[]'::jsonb)) match_entry
          WHERE match_entry->>'sheet_name' <> v_old_sheet_name
        ), '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
          'sheet_name', v_old_sheet_name,
          'corrected_sheet_name', v_employee.full_name,
          'labor_employee_id', v_employee.id,
          'employee_name', v_employee.full_name,
          'location_id', v_employee.location_id,
          'match_method', 'corrected_roster_spelling'
        )),
      'unmatched',
        COALESCE((
          SELECT jsonb_agg(unmatched_entry)
          FROM jsonb_array_elements(COALESCE(version.metadata->'import_report'->'employee_matching'->'unmatched', '[]'::jsonb)) unmatched_entry
          WHERE unmatched_entry->>'sheet_name' <> v_old_sheet_name
        ), '[]'::jsonb),
      'ambiguous',
        COALESCE(version.metadata->'import_report'->'employee_matching'->'ambiguous', '[]'::jsonb)
    ),
    true
  )
  FROM public.training_templates template
  WHERE version.template_id = template.id
    AND template.slug = 'csr_team_readiness_board';
END;
$$;

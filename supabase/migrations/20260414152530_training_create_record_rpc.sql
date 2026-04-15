create or replace function public.create_training_record(
  p_template_id uuid,
  p_location_ref text,
  p_employee_full_name text,
  p_target_role text,
  p_hire_date date default null,
  p_training_start_date date default null,
  p_target_end_date date default null,
  p_assigned_trainer_name text default null,
  p_actor_user_id uuid default null,
  p_actor_name text default null
)
returns public.training_records
language plpgsql
as $$
declare
  v_location_id uuid;
  v_template public.training_templates%rowtype;
  v_version public.training_template_versions%rowtype;
  v_record public.training_records%rowtype;
  v_required_item_count integer := 0;
  v_employee_full_name text := trim(coalesce(p_employee_full_name, ''));
  v_target_role text := trim(coalesce(p_target_role, ''));
  v_location_ref text := trim(coalesce(p_location_ref, ''));
  v_actor_name text := nullif(trim(coalesce(p_actor_name, '')), '');
  v_employee_name_first text := null;
  v_employee_name_last text := null;
begin
  if p_template_id is null then
    raise exception 'Training template is required';
  end if;

  if v_employee_full_name = '' then
    raise exception 'Employee full name is required';
  end if;

  if v_target_role = '' then
    raise exception 'Target role is required';
  end if;

  if v_location_ref = '' then
    raise exception 'Location reference is required';
  end if;

  if v_location_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_location_id := v_location_ref::uuid;
  else
    select id
    into v_location_id
    from public.locations
    where slug = v_location_ref
    limit 1;

    if v_location_id is null and p_actor_user_id is not null then
      select location_id
      into v_location_id
      from public.profile_locations
      where profile_id = p_actor_user_id
      limit 1;
    end if;
  end if;

  if v_location_id is null then
    raise exception 'Unable to resolve location from %', v_location_ref;
  end if;

  select *
  into v_template
  from public.training_templates
  where id = p_template_id
    and is_active = true
    and template_class = 'training_plan'
    and (location_id is null or location_id = v_location_id)
  limit 1;

  if not found then
    raise exception 'Training template % is not available for location %', p_template_id, v_location_id;
  end if;

  select *
  into v_version
  from public.training_template_versions
  where template_id = v_template.id
    and is_current = true
    and status = 'published'
  limit 1;

  if not found then
    raise exception 'Training template % does not have a current published version', p_template_id;
  end if;

  select count(*)
  into v_required_item_count
  from public.training_template_items
  where template_version_id = v_version.id
    and required = true;

  v_employee_name_first := split_part(v_employee_full_name, ' ', 1);
  v_employee_name_last := nullif(btrim(substring(v_employee_full_name from length(v_employee_name_first) + 1)), '');

  insert into public.training_records (
    template_id,
    template_version_id,
    template_name_snapshot,
    template_class_snapshot,
    employee_name_first,
    employee_name_last,
    employee_full_name,
    target_role,
    location_id,
    hire_date,
    training_start_date,
    target_end_date,
    assigned_trainer_name,
    overall_status,
    progress_percent,
    required_item_count,
    required_item_completed_count,
    template_snapshot,
    created_by_user_id,
    updated_by_user_id
  )
  values (
    v_template.id,
    v_version.id,
    v_template.name,
    v_template.template_class,
    v_employee_name_first,
    v_employee_name_last,
    v_employee_full_name,
    v_target_role,
    v_location_id,
    p_hire_date,
    p_training_start_date,
    p_target_end_date,
    nullif(trim(coalesce(p_assigned_trainer_name, '')), ''),
    'not_started',
    0,
    v_required_item_count,
    0,
    coalesce(v_version.published_snapshot, '{}'::jsonb),
    p_actor_user_id,
    p_actor_user_id
  )
  returning *
  into v_record;

  insert into public.training_record_item_results (
    record_id,
    template_item_id,
    template_section_id,
    status
  )
  select
    v_record.id,
    item.id,
    item.template_section_id,
    'not_started'::public.training_item_status
  from public.training_template_items item
  where item.template_version_id = v_version.id;

  insert into public.training_record_events (
    record_id,
    event_type,
    actor_user_id,
    actor_name,
    after_state
  )
  values (
    v_record.id,
    'record_created',
    p_actor_user_id,
    coalesce(v_actor_name, 'System'),
    jsonb_build_object(
      'employee_full_name', v_record.employee_full_name,
      'target_role', v_record.target_role,
      'template_id', v_record.template_id,
      'template_version_id', v_record.template_version_id
    )
  );

  return v_record;
end;
$$;

grant execute on function public.create_training_record(
  uuid,
  text,
  text,
  text,
  date,
  date,
  date,
  text,
  uuid,
  text
) to authenticated;

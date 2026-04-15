create or replace function public.replace_role_page_config(
  p_location_id text,
  p_roles text[],
  p_rows jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_duplicate jsonb;
  v_inserted_count integer := 0;
begin
  if coalesce(trim(p_location_id), '') = '' then
    raise exception 'replace_role_page_config requires p_location_id';
  end if;

  if p_roles is null or array_length(p_roles, 1) is null then
    raise exception 'replace_role_page_config requires at least one role';
  end if;

  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' then
    raise exception 'replace_role_page_config expects p_rows to be a JSON array';
  end if;

  with parsed as (
    select
      trim(coalesce(x.role, '')) as role,
      trim(coalesce(x.section, '')) as section,
      trim(coalesce(x.task_id, '')) as task_id
    from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as x(
      role text,
      section text,
      task_id text,
      task_label text,
      task_time text,
      task_description text,
      sort_order integer,
      source text,
      day_of_week integer,
      is_active boolean
    )
  ),
  dupes as (
    select role, section, task_id, count(*) as dup_count
    from parsed
    group by 1, 2, 3
    having count(*) > 1
  )
  select jsonb_agg(jsonb_build_object(
    'role', role,
    'section', section,
    'task_id', task_id,
    'count', dup_count
  ))
  into v_duplicate
  from dupes;

  if v_duplicate is not null then
    raise exception 'Duplicate role layout rows in payload: %', v_duplicate::text;
  end if;

  delete from public.role_page_config
  where location_id = p_location_id
    and role = any(p_roles);

  with parsed as (
    select
      trim(coalesce(x.role, '')) as role,
      trim(coalesce(x.section, '')) as section,
      trim(coalesce(x.task_id, '')) as task_id,
      trim(coalesce(x.task_label, '')) as task_label,
      nullif(trim(coalesce(x.task_time, '')), '') as task_time,
      nullif(trim(coalesce(x.task_description, '')), '') as task_description,
      coalesce(x.sort_order, 0) as sort_order,
      nullif(trim(coalesce(x.source, '')), '') as source,
      x.day_of_week as day_of_week,
      coalesce(x.is_active, true) as is_active
    from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as x(
      role text,
      section text,
      task_id text,
      task_label text,
      task_time text,
      task_description text,
      sort_order integer,
      source text,
      day_of_week integer,
      is_active boolean
    )
  )
  insert into public.role_page_config (
    location_id,
    role,
    section,
    task_id,
    task_label,
    task_time,
    task_description,
    sort_order,
    source,
    day_of_week,
    is_active,
    updated_at
  )
  select
    p_location_id,
    role,
    section,
    task_id,
    task_label,
    task_time,
    task_description,
    sort_order,
    coalesce(source, 'custom'),
    day_of_week,
    is_active,
    now()
  from parsed
  where role = any(p_roles)
    and section in ('opening', 'midday', 'closing', 'as_needed')
    and task_id <> ''
    and task_label <> '';

  get diagnostics v_inserted_count = row_count;

  return jsonb_build_object(
    'ok', true,
    'location_id', p_location_id,
    'roles', p_roles,
    'inserted_count', v_inserted_count
  );
end;
$$;

revoke all on function public.replace_role_page_config(text, text[], jsonb) from public;
grant execute on function public.replace_role_page_config(text, text[], jsonb) to authenticated, service_role;

-- ============================================================================
-- Dynamic GINGR workflow configuration
--
-- This migration adds the location-scoped configuration layer used to move
-- operational reports off runtime Cherry Hill string matching. Legacy text
-- matching below is used only to seed explicit mappings from existing data.
-- ============================================================================

create table if not exists public.gingr_reference_sync_runs (
  id uuid primary key default gen_random_uuid(),
  location_id text not null,
  mode text not null default 'initial_bootstrap',
  status text not null default 'queued',
  requested_by uuid,
  total_units integer not null default 0,
  completed_units integer not null default 0,
  failed_units integer not null default 0,
  current_entity text,
  current_label text,
  entity_progress jsonb not null default '{}'::jsonb,
  last_message text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gingr_reference_sync_runs_status_check
    check (status in ('queued', 'running', 'complete', 'failed', 'cancelled'))
);

create index if not exists idx_gingr_reference_sync_runs_location
  on public.gingr_reference_sync_runs (location_id, created_at desc);

create index if not exists idx_gingr_reference_sync_runs_active
  on public.gingr_reference_sync_runs (location_id, status)
  where status in ('queued', 'running');

create table if not exists public.gingr_service_catalog (
  id bigserial primary key,
  location_id text not null,
  source_key text not null,
  service_id text,
  service_name text not null,
  service_type_id text,
  service_type_name text,
  reservation_type_id text,
  reservation_type_name text,
  source_kind text not null default 'service',
  is_active boolean not null default true,
  raw_payload jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, source_key)
);

create index if not exists idx_gingr_service_catalog_location
  on public.gingr_service_catalog (location_id, service_name);

create table if not exists public.gingr_service_addon_catalog (
  id bigserial primary key,
  location_id text not null,
  source_key text not null,
  service_source_key text,
  service_id text,
  addon_id text,
  addon_name text not null,
  reservation_type_id text,
  reservation_type_name text,
  is_active boolean not null default true,
  raw_payload jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, source_key)
);

create index if not exists idx_gingr_service_addon_catalog_location
  on public.gingr_service_addon_catalog (location_id, addon_name);

create table if not exists public.gingr_workflow_settings (
  id bigserial primary key,
  location_id text not null,
  workflow_key text not null,
  label text,
  settings jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, workflow_key)
);

create index if not exists idx_gingr_workflow_settings_location
  on public.gingr_workflow_settings (location_id, workflow_key)
  where is_active = true;

create table if not exists public.gingr_workflow_mappings (
  id bigserial primary key,
  location_id text not null,
  workflow_key text not null,
  source_type text not null,
  source_id text,
  source_identity_key text not null,
  source_label text,
  capability_key text not null,
  settings jsonb not null default '{}'::jsonb,
  mapping_source text not null default 'manual',
  is_required boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, workflow_key, source_type, source_identity_key, capability_key)
);

create index if not exists idx_gingr_workflow_mappings_location
  on public.gingr_workflow_mappings (location_id);

create index if not exists idx_gingr_workflow_mappings_capability
  on public.gingr_workflow_mappings (location_id, workflow_key, capability_key)
  where is_active = true;

create unique index if not exists uniq_gingr_workflow_active_reservation_category
  on public.gingr_workflow_mappings (location_id, workflow_key, source_type, source_identity_key)
  where is_active = true
    and workflow_key = 'reservation_categories'
    and capability_key like 'reservation.category.%';

create unique index if not exists uniq_gingr_workflow_active_bath_type
  on public.gingr_workflow_mappings (location_id, workflow_key, source_type, source_identity_key)
  where is_active = true
    and workflow_key = 'bathing'
    and capability_key in (
      'bathing.type.standard',
      'bathing.type.premium',
      'bathing.type.medicated',
      'bathing.type.whitening',
      'bathing.type.shampoo_from_home',
      'bathing.type.hypoallergenic',
      'bathing.type.hypoallergenic_no_spray',
      'bathing.type.hypoallergenic_with_spray',
      'bathing.type.water_rinse',
      'bathing.type.fresh_n_clean'
    );

create or replace function public.update_gingr_dynamic_config_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_gingr_reference_sync_runs_updated_at on public.gingr_reference_sync_runs;
create trigger trg_gingr_reference_sync_runs_updated_at
  before update on public.gingr_reference_sync_runs
  for each row execute function public.update_gingr_dynamic_config_updated_at();

drop trigger if exists trg_gingr_service_catalog_updated_at on public.gingr_service_catalog;
create trigger trg_gingr_service_catalog_updated_at
  before update on public.gingr_service_catalog
  for each row execute function public.update_gingr_dynamic_config_updated_at();

drop trigger if exists trg_gingr_service_addon_catalog_updated_at on public.gingr_service_addon_catalog;
create trigger trg_gingr_service_addon_catalog_updated_at
  before update on public.gingr_service_addon_catalog
  for each row execute function public.update_gingr_dynamic_config_updated_at();

drop trigger if exists trg_gingr_workflow_settings_updated_at on public.gingr_workflow_settings;
create trigger trg_gingr_workflow_settings_updated_at
  before update on public.gingr_workflow_settings
  for each row execute function public.update_gingr_dynamic_config_updated_at();

drop trigger if exists trg_gingr_workflow_mappings_updated_at on public.gingr_workflow_mappings;
create trigger trg_gingr_workflow_mappings_updated_at
  before update on public.gingr_workflow_mappings
  for each row execute function public.update_gingr_dynamic_config_updated_at();

create or replace function public.replace_gingr_workflow_mapping(
  p_location_id text,
  p_workflow_key text,
  p_source_type text,
  p_source_identity_key text,
  p_source_id text default null,
  p_source_label text default null,
  p_capability_key text default null,
  p_capability_group_prefix text default null,
  p_capability_keys text[] default null,
  p_settings jsonb default '{}'::jsonb,
  p_is_required boolean default false
)
returns public.gingr_workflow_mappings
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_row public.gingr_workflow_mappings;
begin
  if nullif(btrim(coalesce(p_location_id, '')), '') is null
    or nullif(btrim(coalesce(p_workflow_key, '')), '') is null
    or nullif(btrim(coalesce(p_source_type, '')), '') is null
    or nullif(btrim(coalesce(p_source_identity_key, '')), '') is null then
    raise exception 'Missing required workflow mapping identity';
  end if;

  if nullif(btrim(coalesce(p_capability_group_prefix, '')), '') is null
    and coalesce(array_length(p_capability_keys, 1), 0) = 0 then
    raise exception 'A capability group prefix or capability key list is required';
  end if;

  update public.gingr_workflow_mappings
  set
    is_active = false,
    mapping_source = 'manual',
    updated_at = now()
  where location_id = p_location_id
    and workflow_key = p_workflow_key
    and source_type = p_source_type
    and source_identity_key = p_source_identity_key
    and is_active = true
    and (
      (
        nullif(btrim(coalesce(p_capability_group_prefix, '')), '') is not null
        and capability_key like p_capability_group_prefix || '%'
      )
      or (
        coalesce(array_length(p_capability_keys, 1), 0) > 0
        and capability_key = any(p_capability_keys)
      )
    );

  if nullif(btrim(coalesce(p_capability_key, '')), '') is null then
    return null;
  end if;

  insert into public.gingr_workflow_mappings (
    location_id,
    workflow_key,
    source_type,
    source_id,
    source_identity_key,
    source_label,
    capability_key,
    settings,
    mapping_source,
    is_required,
    is_active
  )
  values (
    p_location_id,
    p_workflow_key,
    p_source_type,
    nullif(btrim(coalesce(p_source_id, '')), ''),
    p_source_identity_key,
    nullif(btrim(coalesce(p_source_label, '')), ''),
    p_capability_key,
    coalesce(p_settings, '{}'::jsonb),
    'manual',
    coalesce(p_is_required, false),
    true
  )
  on conflict (location_id, workflow_key, source_type, source_identity_key, capability_key)
  do update set
    source_id = excluded.source_id,
    source_label = excluded.source_label,
    settings = excluded.settings,
    mapping_source = 'manual',
    is_required = excluded.is_required,
    is_active = true,
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

alter table public.gingr_reference_sync_runs enable row level security;
alter table public.gingr_service_catalog enable row level security;
alter table public.gingr_service_addon_catalog enable row level security;
alter table public.gingr_workflow_settings enable row level security;
alter table public.gingr_workflow_mappings enable row level security;

drop policy if exists gingr_reference_sync_runs_select on public.gingr_reference_sync_runs;
create policy gingr_reference_sync_runs_select
  on public.gingr_reference_sync_runs
  for select
  to authenticated
  using (
    exists (
      select 1 from public.lite_profiles
      where user_id = auth.uid()
        and is_active = true
        and (role::text in ('enterprise_admin', 'multi_location_admin') or location_id = gingr_reference_sync_runs.location_id)
    )
  );

drop policy if exists gingr_reference_sync_runs_service on public.gingr_reference_sync_runs;
create policy gingr_reference_sync_runs_service
  on public.gingr_reference_sync_runs
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists gingr_service_catalog_select on public.gingr_service_catalog;
create policy gingr_service_catalog_select
  on public.gingr_service_catalog
  for select
  to authenticated
  using (
    exists (
      select 1 from public.lite_profiles
      where user_id = auth.uid()
        and is_active = true
        and (role::text in ('enterprise_admin', 'multi_location_admin') or location_id = gingr_service_catalog.location_id)
    )
  );

drop policy if exists gingr_service_catalog_service on public.gingr_service_catalog;
create policy gingr_service_catalog_service
  on public.gingr_service_catalog
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists gingr_service_addon_catalog_select on public.gingr_service_addon_catalog;
create policy gingr_service_addon_catalog_select
  on public.gingr_service_addon_catalog
  for select
  to authenticated
  using (
    exists (
      select 1 from public.lite_profiles
      where user_id = auth.uid()
        and is_active = true
        and (role::text in ('enterprise_admin', 'multi_location_admin') or location_id = gingr_service_addon_catalog.location_id)
    )
  );

drop policy if exists gingr_service_addon_catalog_service on public.gingr_service_addon_catalog;
create policy gingr_service_addon_catalog_service
  on public.gingr_service_addon_catalog
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists gingr_workflow_settings_select on public.gingr_workflow_settings;
create policy gingr_workflow_settings_select
  on public.gingr_workflow_settings
  for select
  to authenticated
  using (
    exists (
      select 1 from public.lite_profiles
      where user_id = auth.uid()
        and is_active = true
        and (role::text in ('enterprise_admin', 'multi_location_admin') or location_id = gingr_workflow_settings.location_id)
    )
  );

drop policy if exists gingr_workflow_settings_mutate on public.gingr_workflow_settings;
create policy gingr_workflow_settings_mutate
  on public.gingr_workflow_settings
  for all
  to authenticated
  using (
    exists (
      select 1 from public.lite_profiles
      where user_id = auth.uid()
        and is_active = true
        and (
          role::text in ('enterprise_admin', 'multi_location_admin')
          or (
            location_id = gingr_workflow_settings.location_id
            and role::text in ('location_admin', 'manager', 'supervisor')
          )
        )
    )
  )
  with check (
    exists (
      select 1 from public.lite_profiles
      where user_id = auth.uid()
        and is_active = true
        and (
          role::text in ('enterprise_admin', 'multi_location_admin')
          or (
            location_id = gingr_workflow_settings.location_id
            and role::text in ('location_admin', 'manager', 'supervisor')
          )
        )
    )
  );

drop policy if exists gingr_workflow_settings_service on public.gingr_workflow_settings;
create policy gingr_workflow_settings_service
  on public.gingr_workflow_settings
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists gingr_workflow_mappings_select on public.gingr_workflow_mappings;
create policy gingr_workflow_mappings_select
  on public.gingr_workflow_mappings
  for select
  to authenticated
  using (
    exists (
      select 1 from public.lite_profiles
      where user_id = auth.uid()
        and is_active = true
        and (role::text in ('enterprise_admin', 'multi_location_admin') or location_id = gingr_workflow_mappings.location_id)
    )
  );

drop policy if exists gingr_workflow_mappings_mutate on public.gingr_workflow_mappings;
create policy gingr_workflow_mappings_mutate
  on public.gingr_workflow_mappings
  for all
  to authenticated
  using (
    exists (
      select 1 from public.lite_profiles
      where user_id = auth.uid()
        and is_active = true
        and (
          role::text in ('enterprise_admin', 'multi_location_admin')
          or (
            location_id = gingr_workflow_mappings.location_id
            and role::text in ('location_admin', 'manager', 'supervisor')
          )
        )
    )
  )
  with check (
    exists (
      select 1 from public.lite_profiles
      where user_id = auth.uid()
        and is_active = true
        and (
          role::text in ('enterprise_admin', 'multi_location_admin')
          or (
            location_id = gingr_workflow_mappings.location_id
            and role::text in ('location_admin', 'manager', 'supervisor')
          )
        )
    )
  );

drop policy if exists gingr_workflow_mappings_service on public.gingr_workflow_mappings;
create policy gingr_workflow_mappings_service
  on public.gingr_workflow_mappings
  for all
  to service_role
  using (true)
  with check (true);

grant select on public.gingr_reference_sync_runs to authenticated, service_role;
grant select on public.gingr_service_catalog to authenticated, service_role;
grant select on public.gingr_service_addon_catalog to authenticated, service_role;
grant select on public.gingr_workflow_settings to authenticated, service_role;
grant select on public.gingr_workflow_mappings to authenticated, service_role;

grant insert, update, delete on public.gingr_workflow_settings to authenticated;
grant insert, update, delete on public.gingr_workflow_mappings to authenticated;
grant execute on function public.replace_gingr_workflow_mapping(text, text, text, text, text, text, text, text, text[], jsonb, boolean) to authenticated, service_role;

grant all on public.gingr_reference_sync_runs to service_role;
grant all on public.gingr_service_catalog to service_role;
grant all on public.gingr_service_addon_catalog to service_role;
grant all on public.gingr_workflow_settings to service_role;
grant all on public.gingr_workflow_mappings to service_role;

grant usage, select on sequence public.gingr_service_catalog_id_seq to service_role;
grant usage, select on sequence public.gingr_service_addon_catalog_id_seq to service_role;
grant usage, select on sequence public.gingr_workflow_settings_id_seq to authenticated, service_role;
grant usage, select on sequence public.gingr_workflow_mappings_id_seq to authenticated, service_role;

create or replace view public.v_gingr_initial_sync_status
with (security_invoker = true) as
select distinct on (location_id)
  id,
  location_id,
  mode,
  status,
  total_units,
  completed_units,
  failed_units,
  case
    when total_units > 0 then least(100, round((completed_units::numeric / total_units::numeric) * 100, 1))
    when status = 'complete' then 100::numeric
    else 0::numeric
  end as percent,
  current_entity,
  current_label,
  entity_progress,
  last_message,
  error_message,
  started_at,
  completed_at,
  updated_at,
  created_at
from public.gingr_reference_sync_runs
where mode in ('initial_bootstrap', 'reference_discovery')
order by location_id, created_at desc;

create or replace view public.v_gingr_workflow_mapping_status
with (security_invoker = true) as
select
  m.id,
  m.location_id,
  m.workflow_key,
  m.source_type,
  m.source_id,
  m.source_identity_key,
  m.source_label,
  m.capability_key,
  m.settings,
  m.mapping_source,
  m.is_required,
  m.is_active,
  m.created_at,
  m.updated_at,
  case
    when m.source_type = 'icon' and inv.location_id is null then 'stale'
    when m.source_type = 'service' and svc.location_id is null then 'stale'
    when m.source_type = 'service_addon' and addon.location_id is null then 'stale'
    when m.source_type = 'reservation_type' and rt.location_id is null then 'stale'
    when m.source_type in ('run', 'room') and run.location_id is null then 'stale'
    else 'active'
  end as mapping_status,
  coalesce(inv.current_title, svc.service_name, addon.addon_name, rt.name, run.run_name, m.source_label) as current_label,
  inv.active_assignment_count as icon_assignment_count
from public.gingr_workflow_mappings m
left join public.v_gingr_icon_inventory_current inv
  on m.source_type = 'icon'
 and inv.location_id = m.location_id
 and (
   inv.icon_identity_key = m.source_identity_key
   or ('icon:' || coalesce(inv.icon_identity_key, inv.inventory_key)) = m.source_identity_key
 )
left join public.gingr_service_catalog svc
  on m.source_type = 'service'
 and svc.location_id = m.location_id
 and svc.source_key = m.source_identity_key
left join public.gingr_service_addon_catalog addon
  on m.source_type = 'service_addon'
 and addon.location_id = m.location_id
 and addon.source_key = m.source_identity_key
left join public.gingr_reservation_types rt
  on m.source_type = 'reservation_type'
 and rt.location_id = m.location_id
 and ('reservation_type:' || rt.gingr_id) = m.source_identity_key
left join public.gingr_runs run
  on m.source_type in ('run', 'room')
 and run.location_id = m.location_id
 and (
   ('run:' || run.gingr_run_id) = m.source_identity_key
   or ('room:' || run.gingr_run_id) = m.source_identity_key
   or ('run_name:' || lower(regexp_replace(run.run_name, '\s+', ' ', 'g'))) = m.source_identity_key
 );

grant select on public.v_gingr_initial_sync_status to authenticated, service_role;
grant select on public.v_gingr_workflow_mapping_status to authenticated, service_role;

-- Make playgroup computation explicit-mapping only. Legacy title matching is
-- seeded into gingr_icon_mappings below and must not run silently forever.
create or replace view public.v_dog_playgroup_icon_tags
with (security_invoker = true) as
select distinct
  i.location_id,
  i.animal_gingr_id,
  case
    when m.capability_key = 'play.private_play' then 'private_play'
    when m.capability_key = 'play.large_daycare' then 'large'
    when m.capability_key = 'play.small_daycare' then 'small'
    when m.capability_key = 'play.evaluation' then 'evaluation'
    else null
  end as playgroup,
  i.icon_title,
  i.icon_color,
  i.icon_template_id,
  i.icon_comment
from public.gingr_animal_icons_live i
join public.gingr_icon_mappings m
  on m.location_id = i.location_id
 and m.is_active = true
 and m.capability_key in (
   'play.private_play',
   'play.large_daycare',
   'play.small_daycare',
   'play.evaluation'
 )
 and (
   (nullif(m.icon_template_id, '') is not null and nullif(i.icon_template_id, '') = nullif(m.icon_template_id, ''))
   or (
     nullif(m.icon_template_id, '') is null
     and i.icon_identity_key = m.icon_identity_key
   )
 )
where i.animal_gingr_id is not null;

-- --------------------------------------------------------------------------
-- Seed explicit config from existing synced Cherry Hill-era data.
-- These heuristics are intentionally write-time seeds, not runtime fallbacks.
-- --------------------------------------------------------------------------

with known_locations as (
  select distinct location_id from public.gingr_reservations
  union
  select distinct location_id from public.gingr_animal_icons_live
  union
  select distinct location_id from public.gingr_reservation_types
)
insert into public.gingr_workflow_settings (location_id, workflow_key, label, settings)
select location_id, 'private_play', 'Private Play', '{"required_sessions": 3}'::jsonb
from known_locations
where location_id is not null
on conflict (location_id, workflow_key)
do nothing;

with service_rows as (
  select
    r.location_id,
    coalesce(r.reservation_type_id, r.raw_data #>> '{reservation_type,id}') as reservation_type_id,
    coalesce(r.reservation_type_name, r.raw_data #>> '{reservation_type,type}') as reservation_type_name,
    service.value as service_payload
  from public.gingr_reservations r
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(r.raw_data->'services') = 'array'
        and jsonb_array_length(coalesce(r.raw_data->'services', '[]'::jsonb)) > 0
        then r.raw_data->'services'
      when jsonb_typeof(r.services) = 'array'
        then r.services
      else '[]'::jsonb
    end
  ) as service(value)
),
normalized as (
  select
    location_id,
    reservation_type_id,
    reservation_type_name,
    nullif(
      btrim(
        case
          when jsonb_typeof(service_payload) = 'string' then service_payload #>> '{}'
          else coalesce(
            service_payload->>'name',
            service_payload->>'service_name',
            service_payload->>'label',
            service_payload->>'title'
          )
        end
      ),
      ''
    ) as service_name,
    nullif(coalesce(
      service_payload->>'id',
      service_payload->>'service_id',
      service_payload->>'value'
    ), '') as service_id,
    service_payload
  from service_rows
),
keyed_services as (
  select
    location_id,
    'service_name:' || lower(regexp_replace(service_name, '\s+', ' ', 'g')) as source_key,
    service_id,
    service_name,
    reservation_type_id,
    reservation_type_name,
    service_payload
  from normalized
  where service_name is not null
)
insert into public.gingr_service_catalog (
  location_id,
  source_key,
  service_id,
  service_name,
  reservation_type_id,
  reservation_type_name,
  raw_payload
)
select distinct on (location_id, source_key)
  location_id,
  source_key,
  service_id,
  service_name,
  reservation_type_id,
  reservation_type_name,
  service_payload
from keyed_services
order by location_id, source_key, reservation_type_name nulls last, service_name
on conflict (location_id, source_key)
do update set
  service_id = coalesce(excluded.service_id, public.gingr_service_catalog.service_id),
  service_name = excluded.service_name,
  reservation_type_id = coalesce(excluded.reservation_type_id, public.gingr_service_catalog.reservation_type_id),
  reservation_type_name = coalesce(excluded.reservation_type_name, public.gingr_service_catalog.reservation_type_name),
  raw_payload = excluded.raw_payload,
  last_seen_at = now(),
  synced_at = now(),
  updated_at = now();

with reservation_type_seed as (
  select
    location_id,
    gingr_id,
    coalesce(nullif(type_label, ''), nullif(name, ''), gingr_id) as label,
    lower(coalesce(type_label, name, '')) as label_key
  from public.gingr_reservation_types
),
category_mappings as (
  select
    location_id,
    'reservation_categories'::text as workflow_key,
    'reservation_type'::text as source_type,
    gingr_id as source_id,
    'reservation_type:' || gingr_id as source_identity_key,
    label as source_label,
    case
      when label_key like '%day board%' then 'reservation.category.day_boarding'
      when label_key like '%eval%' then 'reservation.category.evaluation'
      when label_key like '%tour%' then 'reservation.category.tour'
      when label_key like '%groom%' or label_key like '%bath%' then 'reservation.category.grooming'
      when label_key like '%daycare%' or label_key like '%day care%' then 'reservation.category.daycare'
      when label_key like '%boarding%' or label_key like '%suite%' or label_key like '%villa%' or label_key like '%executive%' or label_key like '%compartment%' then 'reservation.category.boarding'
      else null
    end as capability_key,
    '{"seeded_from": "legacy_reservation_type_name", "needs_review": true}'::jsonb as settings
  from reservation_type_seed
),
private_play_day_boarding as (
  select
    location_id,
    'private_play'::text as workflow_key,
    'reservation_type'::text as source_type,
    gingr_id as source_id,
    'reservation_type:' || gingr_id as source_identity_key,
    label as source_label,
    'private_play.include'::text as capability_key,
    '{"seeded_from": "legacy_day_boarding_rule", "required_sessions": 3, "needs_review": true}'::jsonb as settings
  from reservation_type_seed
  where label_key like '%day board%'
),
all_reservation_mappings as (
  select * from category_mappings where capability_key is not null
  union all
  select * from private_play_day_boarding
)
insert into public.gingr_workflow_mappings (
  location_id,
  workflow_key,
  source_type,
  source_id,
  source_identity_key,
  source_label,
  capability_key,
  settings,
  mapping_source,
  is_required
)
select
  location_id,
  workflow_key,
  source_type,
  source_id,
  source_identity_key,
  source_label,
  capability_key,
  settings,
  'legacy_seed',
  workflow_key = 'reservation_categories'
from all_reservation_mappings
on conflict (location_id, workflow_key, source_type, source_identity_key, capability_key)
do update set
  source_label = excluded.source_label,
  settings = excluded.settings || public.gingr_workflow_mappings.settings,
  updated_at = now()
where public.gingr_workflow_mappings.mapping_source = 'legacy_seed';

with historical_service_rows as (
  select
    r.location_id,
    coalesce(r.reservation_type_id, r.raw_data #>> '{reservation_type,id}') as reservation_type_id,
    coalesce(r.reservation_type_name, r.raw_data #>> '{reservation_type,type}') as reservation_type_name,
    service.value as service_payload
  from public.gingr_reservations r
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(r.raw_data->'services') = 'array'
        and jsonb_array_length(coalesce(r.raw_data->'services', '[]'::jsonb)) > 0
        then r.raw_data->'services'
      when jsonb_typeof(r.services) = 'array'
        then r.services
      else '[]'::jsonb
    end
  ) as service(value)
),
historical_addon_rows as (
  select
    location_id,
    reservation_type_id,
    reservation_type_name,
    nullif(coalesce(service_payload->>'id', service_payload->>'service_id', service_payload->>'value'), '') as service_id,
    nullif(
      btrim(coalesce(service_payload->>'name', service_payload->>'service_name', service_payload->>'label', service_payload->>'title')),
      ''
    ) as service_name,
    addon.value as addon_payload
  from historical_service_rows
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(service_payload->'addons') = 'array' then service_payload->'addons'
      when jsonb_typeof(service_payload->'add_ons') = 'array' then service_payload->'add_ons'
      when jsonb_typeof(service_payload->'service_addons') = 'array' then service_payload->'service_addons'
      when jsonb_typeof(service_payload->'allowable_services_addons') = 'array' then service_payload->'allowable_services_addons'
      else '[]'::jsonb
    end
  ) as addon(value)
),
normalized_historical_addons as (
  select
    location_id,
    reservation_type_id,
    reservation_type_name,
    case
      when service_id is not null then 'service:' || service_id
      when service_name is not null then 'service_name:' || lower(regexp_replace(service_name, '\s+', ' ', 'g'))
      else null
    end as service_source_key,
    service_id,
    nullif(coalesce(addon_payload->>'id', addon_payload->>'addon_id', addon_payload->>'value'), '') as addon_id,
    nullif(
      btrim(
        case
          when jsonb_typeof(addon_payload) = 'string' then addon_payload #>> '{}'
          else coalesce(addon_payload->>'name', addon_payload->>'addon_name', addon_payload->>'label', addon_payload->>'title')
        end
      ),
      ''
    ) as addon_name,
    addon_payload
  from historical_addon_rows
),
keyed_historical_addons as (
  select
    location_id,
    case
      when addon_id is not null then 'service_addon:' || addon_id
      else 'service_addon_name:' || lower(regexp_replace(addon_name, '\s+', ' ', 'g'))
    end as source_key,
    service_source_key,
    service_id,
    addon_id,
    addon_name,
    reservation_type_id,
    reservation_type_name,
    addon_payload
  from normalized_historical_addons
  where addon_name is not null
)
insert into public.gingr_service_addon_catalog (
  location_id,
  source_key,
  service_source_key,
  service_id,
  addon_id,
  addon_name,
  reservation_type_id,
  reservation_type_name,
  raw_payload
)
select distinct on (location_id, source_key)
  location_id,
  source_key,
  service_source_key,
  service_id,
  addon_id,
  addon_name,
  reservation_type_id,
  reservation_type_name,
  addon_payload
from keyed_historical_addons
order by location_id, source_key, reservation_type_name nulls last, addon_name
on conflict (location_id, source_key)
do update set
  service_source_key = coalesce(excluded.service_source_key, public.gingr_service_addon_catalog.service_source_key),
  service_id = coalesce(excluded.service_id, public.gingr_service_addon_catalog.service_id),
  addon_id = coalesce(excluded.addon_id, public.gingr_service_addon_catalog.addon_id),
  addon_name = excluded.addon_name,
  reservation_type_id = coalesce(excluded.reservation_type_id, public.gingr_service_addon_catalog.reservation_type_id),
  reservation_type_name = coalesce(excluded.reservation_type_name, public.gingr_service_addon_catalog.reservation_type_name),
  raw_payload = excluded.raw_payload,
  last_seen_at = now(),
  synced_at = now(),
  updated_at = now();

with addon_seed as (
  select
    location_id,
    source_key,
    addon_id,
    addon_name,
    lower(addon_name) as label_key
  from public.gingr_service_addon_catalog
),
addon_base_capabilities as (
  select
    location_id,
    'bathing'::text as workflow_key,
    'service_addon'::text as source_type,
    addon_id as source_id,
    source_key as source_identity_key,
    addon_name as source_label,
    case
      when label_key like '%hypo%' and label_key like '%no spray%' then 'bathing.type.hypoallergenic_no_spray'
      when label_key like '%hypo%' and label_key like '%with spray%' then 'bathing.type.hypoallergenic_with_spray'
      when label_key like '%hypo%' then 'bathing.type.hypoallergenic'
      when label_key like '%shampoo from home%' then 'bathing.type.shampoo_from_home'
      when label_key like '%fresh n clean%' or label_key like '%fresh & clean%' then 'bathing.type.fresh_n_clean'
      when label_key like '%water rinse%' then 'bathing.type.water_rinse'
      when label_key = 'premium' or label_key like '%premium bath%' then 'bathing.type.premium'
      when label_key = 'medicated' or label_key like '%medicated bath%' then 'bathing.type.medicated'
      when label_key = 'whitening' or label_key like '%whitening bath%' then 'bathing.type.whitening'
      when label_key = 'bath' or label_key like '%standard%' then 'bathing.type.standard'
      when label_key like '%no crate dryer%' then 'bathing.modifier.no_crate_dryer'
      when label_key like '%no velocity dryer%' then 'bathing.modifier.no_velocity_dryer'
      when label_key = 'no dryer' or (label_key like '%no dryer%' and label_key not like '%spray%') then 'bathing.modifier.no_dryer'
      when label_key like '%towel dry only%' then 'bathing.modifier.towel_dry_only'
      when label_key like '%see account notes%' then 'bathing.modifier.see_account_notes'
      else null
    end as capability_key,
    '{"seeded_from": "legacy_bath_addon_name", "needs_review": true}'::jsonb as settings
  from addon_seed
),
addon_mappings as (
  select
    location_id,
    'private_play'::text as workflow_key,
    'service_addon'::text as source_type,
    addon_id as source_id,
    source_key as source_identity_key,
    addon_name as source_label,
    'private_play.include'::text as capability_key,
    '{"seeded_from": "legacy_addon_name", "required_sessions": 3, "needs_review": true}'::jsonb as settings
  from addon_seed
  where label_key like '%private play%' or label_key like '%play time%'
  union all
  select
    location_id,
    'bathing',
    'service_addon',
    source_id,
    source_identity_key,
    source_label,
    'bathing.include',
    '{"seeded_from": "legacy_addon_name", "needs_review": true}'::jsonb
  from addon_base_capabilities
  where capability_key is not null or lower(source_label) like '%bath%' or lower(source_label) like '%groom%'
  union all
  select
    location_id,
    workflow_key,
    source_type,
    source_id,
    source_identity_key,
    source_label,
    capability_key,
    settings
  from addon_base_capabilities
  where capability_key is not null
)
insert into public.gingr_workflow_mappings (
  location_id,
  workflow_key,
  source_type,
  source_id,
  source_identity_key,
  source_label,
  capability_key,
  settings,
  mapping_source
)
select
  location_id,
  workflow_key,
  source_type,
  source_id,
  source_identity_key,
  source_label,
  capability_key,
  settings,
  'legacy_seed'
from addon_mappings
where capability_key is not null
on conflict (location_id, workflow_key, source_type, source_identity_key, capability_key)
do update set
  source_label = excluded.source_label,
  settings = excluded.settings || public.gingr_workflow_mappings.settings,
  updated_at = now()
where public.gingr_workflow_mappings.mapping_source = 'legacy_seed';

with run_mappings as (
  select
    location_id,
    'room_cleaning'::text as workflow_key,
    'run'::text as source_type,
    gingr_run_id as source_id,
    'run:' || gingr_run_id as source_identity_key,
    coalesce(nullif(area_name, '') || ' / ', '') || run_name as source_label,
    case
      when is_private_play then 'room_cleaning.private_play_room'
      when is_isolation then 'room_cleaning.isolation_room'
      else 'room_cleaning.lodging_room'
    end as capability_key,
    jsonb_build_object(
      'seeded_from', 'gingr_runs',
      'needs_review', true,
      'area_id', area_id,
      'area_name', area_name,
      'run_type', run_type
    ) as settings
  from public.gingr_runs
  where gingr_run_id is not null
    and run_name is not null
)
insert into public.gingr_workflow_mappings (
  location_id,
  workflow_key,
  source_type,
  source_id,
  source_identity_key,
  source_label,
  capability_key,
  settings,
  mapping_source
)
select
  location_id,
  workflow_key,
  source_type,
  source_id,
  source_identity_key,
  source_label,
  capability_key,
  settings,
  'legacy_seed'
from run_mappings
on conflict (location_id, workflow_key, source_type, source_identity_key, capability_key)
do update set
  source_label = excluded.source_label,
  settings = excluded.settings || public.gingr_workflow_mappings.settings,
  updated_at = now()
where public.gingr_workflow_mappings.mapping_source = 'legacy_seed';

with service_seed as (
  select
    location_id,
    source_key,
    service_id,
    service_name,
    lower(service_name) as label_key
  from public.gingr_service_catalog
),
service_mappings as (
  select
    location_id,
    'private_play'::text as workflow_key,
    'service'::text as source_type,
    service_id as source_id,
    source_key as source_identity_key,
    service_name as source_label,
    'private_play.include'::text as capability_key,
    '{"seeded_from": "legacy_service_name", "required_sessions": 3, "needs_review": true}'::jsonb as settings
  from service_seed
  where label_key like '%private play%'
  union all
  select
    location_id,
    'bathing',
    'service',
    service_id,
    source_key,
    service_name,
    'bathing.include',
    '{"seeded_from": "legacy_service_name", "needs_review": true}'::jsonb
  from service_seed
  where label_key like '%bath%' or label_key like '%groom%'
  union all
  select
    location_id,
    'bathing',
    'service',
    service_id,
    source_key,
    service_name,
    case
      when label_key like '%hypo%' and label_key like '%no spray%' then 'bathing.type.hypoallergenic_no_spray'
      when label_key like '%hypo%' and label_key like '%with spray%' then 'bathing.type.hypoallergenic_with_spray'
      when label_key like '%hypo%' then 'bathing.type.hypoallergenic'
      when label_key like '%shampoo from home%' or label_key like '%from home%' then 'bathing.type.shampoo_from_home'
      when label_key like '%fresh n clean%' or label_key like '%fresh & clean%' then 'bathing.type.fresh_n_clean'
      when label_key like '%water rinse%' then 'bathing.type.water_rinse'
      when label_key like '%premium%' then 'bathing.type.premium'
      when label_key like '%medicated%' then 'bathing.type.medicated'
      when label_key like '%whitening%' then 'bathing.type.whitening'
      when label_key = 'bath' or label_key like '%standard%' then 'bathing.type.standard'
      when label_key like '%no crate dryer%' then 'bathing.modifier.no_crate_dryer'
      when label_key like '%no velocity dryer%' then 'bathing.modifier.no_velocity_dryer'
      when label_key = 'no dryer' or (label_key like '%no dryer%' and label_key not like '%spray%') then 'bathing.modifier.no_dryer'
      when label_key like '%towel dry only%' then 'bathing.modifier.towel_dry_only'
      when label_key like '%see account notes%' then 'bathing.modifier.see_account_notes'
      else null
    end,
    '{"seeded_from": "legacy_bath_service_name", "needs_review": true}'::jsonb
  from service_seed
)
insert into public.gingr_workflow_mappings (
  location_id,
  workflow_key,
  source_type,
  source_id,
  source_identity_key,
  source_label,
  capability_key,
  settings,
  mapping_source
)
select
  location_id,
  workflow_key,
  source_type,
  source_id,
  source_identity_key,
  source_label,
  capability_key,
  settings,
  'legacy_seed'
from service_mappings
where capability_key is not null
on conflict (location_id, workflow_key, source_type, source_identity_key, capability_key)
do update set
  source_label = excluded.source_label,
  settings = excluded.settings || public.gingr_workflow_mappings.settings,
  updated_at = now()
where public.gingr_workflow_mappings.mapping_source = 'legacy_seed';

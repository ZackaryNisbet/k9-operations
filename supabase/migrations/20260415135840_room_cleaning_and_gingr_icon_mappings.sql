-- ============================================================================
-- Room cleaning support structures + Gingr icon mappings
-- ============================================================================

create table if not exists public.gingr_icon_mappings (
  id bigserial primary key,
  location_id text not null,
  capability_key text not null,
  icon_template_id text,
  icon_identity_key text not null,
  icon_group text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, capability_key, icon_identity_key)
);

create index if not exists idx_gingr_icon_mappings_location
  on public.gingr_icon_mappings (location_id);

create index if not exists idx_gingr_icon_mappings_capability
  on public.gingr_icon_mappings (location_id, capability_key)
  where is_active = true;

create or replace function public.update_gingr_icon_mappings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_gingr_icon_mappings_updated_at on public.gingr_icon_mappings;
create trigger trg_gingr_icon_mappings_updated_at
  before update on public.gingr_icon_mappings
  for each row execute function public.update_gingr_icon_mappings_updated_at();

alter table public.gingr_icon_mappings enable row level security;

drop policy if exists gingr_icon_mappings_select on public.gingr_icon_mappings;
create policy gingr_icon_mappings_select
  on public.gingr_icon_mappings
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.lite_profiles
      where user_id = auth.uid()
        and is_active = true
        and (
          role = 'enterprise_admin'
          or location_id = gingr_icon_mappings.location_id
        )
    )
    or exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and role in ('owner', 'role_owner')
    )
  );

drop policy if exists gingr_icon_mappings_service on public.gingr_icon_mappings;
create policy gingr_icon_mappings_service
  on public.gingr_icon_mappings
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists gingr_icon_mappings_mutate on public.gingr_icon_mappings;
create policy gingr_icon_mappings_mutate
  on public.gingr_icon_mappings
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.lite_profiles
      where user_id = auth.uid()
        and is_active = true
        and (
          role = 'enterprise_admin'
          or location_id = gingr_icon_mappings.location_id
        )
    )
    or exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and role in ('owner', 'role_owner')
    )
  )
  with check (
    exists (
      select 1
      from public.lite_profiles
      where user_id = auth.uid()
        and is_active = true
        and (
          role = 'enterprise_admin'
          or location_id = gingr_icon_mappings.location_id
        )
    )
    or exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and role in ('owner', 'role_owner')
    )
  );

create or replace view public.v_gingr_icon_inventory_current
with (security_invoker = true) as
with inventory_rows as (
  select
    location_id,
    coalesce(nullif(icon_template_id, ''), icon_identity_key) as inventory_key,
    nullif(icon_template_id, '') as icon_template_id,
    icon_identity_key,
    coalesce(nullif(icon_group, ''), 'Other') as icon_group,
    icon_title,
    icon_comment,
    icon_color,
    icon_class,
    animal_gingr_id,
    first_seen_at,
    last_seen_at,
    synced_at,
    id
  from public.gingr_animal_icons_live
),
latest as (
  select distinct on (location_id, inventory_key)
    location_id,
    inventory_key,
    icon_template_id,
    icon_identity_key,
    icon_group,
    icon_title,
    icon_comment,
    icon_color,
    icon_class
  from inventory_rows
  order by location_id, inventory_key, coalesce(last_seen_at, synced_at) desc, id desc
),
rollup as (
  select
    location_id,
    inventory_key,
    max(icon_template_id) as icon_template_id,
    max(icon_identity_key) as icon_identity_key,
    max(icon_group) as icon_group,
    count(distinct animal_gingr_id) as active_assignment_count,
    min(first_seen_at) as first_seen_at,
    max(last_seen_at) as last_seen_at
  from inventory_rows
  group by location_id, inventory_key
)
select
  rollup.location_id,
  rollup.inventory_key,
  rollup.icon_template_id,
  rollup.icon_identity_key,
  rollup.icon_group,
  latest.icon_title as current_title,
  latest.icon_comment as current_comment,
  latest.icon_color,
  latest.icon_class,
  rollup.active_assignment_count,
  rollup.first_seen_at,
  rollup.last_seen_at
from rollup
join latest
  on latest.location_id = rollup.location_id
 and latest.inventory_key = rollup.inventory_key;

create or replace view public.v_gingr_icon_mapping_status
with (security_invoker = true) as
select
  m.id,
  m.location_id,
  m.capability_key,
  m.icon_template_id,
  m.icon_identity_key,
  m.icon_group,
  m.notes,
  m.is_active,
  m.created_at,
  m.updated_at,
  inv.inventory_key,
  inv.current_title,
  inv.current_comment,
  inv.active_assignment_count,
  inv.first_seen_at,
  inv.last_seen_at,
  case
    when inv.location_id is null then 'stale'
    else 'active'
  end as mapping_status
from public.gingr_icon_mappings m
left join public.v_gingr_icon_inventory_current inv
  on inv.location_id = m.location_id
 and (
   (nullif(m.icon_template_id, '') is not null and inv.icon_template_id = nullif(m.icon_template_id, ''))
   or (
     nullif(m.icon_template_id, '') is null
     and inv.icon_identity_key = m.icon_identity_key
   )
 );

grant select on public.v_gingr_icon_inventory_current to authenticated, service_role;
grant select on public.v_gingr_icon_mapping_status to authenticated, service_role;

create or replace view public.v_dog_playgroup_icon_tags
with (security_invoker = true) as
with mapped_icons as (
  select distinct
    i.location_id,
    i.animal_gingr_id,
    i.icon_title,
    i.icon_color,
    i.icon_template_id,
    i.icon_comment,
    case
      when m.capability_key = 'play.private_play' then 'private_play'
      when m.capability_key = 'play.large_daycare' then 'large'
      when m.capability_key = 'play.small_daycare' then 'small'
      when m.capability_key = 'play.evaluation' then 'evaluation'
      else null
    end as playgroup
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
),
fallback_icons as (
  select distinct
    location_id,
    animal_gingr_id,
    icon_title,
    icon_color,
    icon_template_id,
    icon_comment,
    case
      when lower(icon_title) = 'private play' then 'private_play'
      when lower(icon_title) = 'large dog playgroup' then 'large'
      when lower(icon_title) = 'small dog playgroup' then 'small'
      when lower(icon_title) = 'evaluation' then 'evaluation'
      else null
    end as playgroup
  from public.gingr_animal_icons_live
  where icon_group = 'Play'
    and lower(icon_title) in ('private play', 'large dog playgroup', 'small dog playgroup', 'evaluation')
),
all_tags as (
  select * from mapped_icons
  union
  select * from fallback_icons
)
select
  location_id,
  animal_gingr_id,
  playgroup,
  icon_title,
  icon_color,
  icon_template_id,
  icon_comment
from all_tags
where playgroup is not null;

create or replace view public.v_dog_playgroup_assignments_current
with (security_invoker = true) as
with tag_rollup as (
  select
    location_id,
    animal_gingr_id,
    bool_or(playgroup = 'private_play') as has_private_play,
    bool_or(playgroup = 'evaluation') as has_evaluation,
    bool_or(playgroup = 'large') as has_large,
    bool_or(playgroup = 'small') as has_small,
    coalesce(array_agg(distinct playgroup order by playgroup), array[]::text[]) as playgroup_tags,
    coalesce(
      array_agg(distinct nullif(btrim(icon_title), '') order by nullif(btrim(icon_title), ''))
        filter (where nullif(btrim(icon_title), '') is not null),
      array[]::text[]
    ) as source_icon_titles,
    coalesce(
      array_agg(distinct nullif(btrim(icon_comment), '') order by nullif(btrim(icon_comment), ''))
        filter (where nullif(btrim(icon_comment), '') is not null),
      array[]::text[]
    ) as source_icon_comments,
    max(nullif(btrim(icon_comment), '')) filter (where playgroup = 'private_play') as private_play_comment
  from public.v_dog_playgroup_icon_tags
  group by location_id, animal_gingr_id
)
select
  location_id,
  animal_gingr_id,
  case
    when has_large and not has_small then 'large'
    when has_small and not has_large then 'small'
    else null
  end as size_group,
  has_private_play,
  has_evaluation,
  (
    has_private_play
    and (
      (has_large and not has_small)
      or (has_small and not has_large)
    )
  ) as is_half_and_half,
  case
    when has_private_play and (
      (has_large and not has_small)
      or (has_small and not has_large)
    ) then 'half_and_half'
    when has_private_play then 'private_play'
    when has_large and not has_small then 'large'
    when has_small and not has_large then 'small'
    when has_evaluation then 'evaluation'
    else null
  end as primary_display_playgroup,
  case
    when has_private_play then 'private_play'
    when has_large and not has_small then 'large'
    when has_small and not has_large then 'small'
    else null
  end as scheduling_playgroup,
  playgroup_tags,
  source_icon_titles,
  source_icon_comments,
  case
    when has_private_play and (
      (has_large and not has_small)
      or (has_small and not has_large)
    ) then private_play_comment
    else null
  end as half_and_half_note,
  case
    when has_large and has_small then 'conflicting_size_icons'
    when not has_private_play and not has_large and not has_small and has_evaluation then 'evaluation_only'
    when not has_private_play and not has_large and not has_small then 'no_actionable_icon'
    else null
  end as unresolved_reason
from tag_rollup;

create or replace view public.v_dog_playgroups
with (security_invoker = true) as
select
  location_id,
  animal_gingr_id,
  playgroup,
  icon_title,
  icon_color,
  icon_template_id,
  icon_comment
from public.v_dog_playgroup_icon_tags;

grant select on public.v_dog_playgroup_icon_tags to authenticated, service_role;
grant select on public.v_dog_playgroup_assignments_current to authenticated, service_role;
grant select on public.v_dog_playgroups to authenticated, service_role;

with seed_candidates as (
  select
    location_id,
    'play.private_play'::text as capability_key,
    nullif(icon_template_id, '') as icon_template_id,
    icon_identity_key,
    icon_group
  from public.gingr_animal_icons_live
  where lower(icon_title) = 'private play'
  union all
  select location_id, 'play.large_daycare', nullif(icon_template_id, ''), icon_identity_key, icon_group
  from public.gingr_animal_icons_live
  where lower(icon_title) = 'large dog playgroup'
  union all
  select location_id, 'play.small_daycare', nullif(icon_template_id, ''), icon_identity_key, icon_group
  from public.gingr_animal_icons_live
  where lower(icon_title) = 'small dog playgroup'
  union all
  select location_id, 'play.evaluation', nullif(icon_template_id, ''), icon_identity_key, icon_group
  from public.gingr_animal_icons_live
  where lower(icon_title) = 'evaluation'
  union all
  select location_id, 'bathing.include', nullif(icon_template_id, ''), icon_identity_key, icon_group
  from public.gingr_animal_icons_live
  where lower(icon_group) = 'bath'
  union all
  select
    location_id,
    case
      when lower(icon_title) = 'premium' then 'bathing.type.premium'
      when lower(icon_title) = 'medicated' then 'bathing.type.medicated'
      when lower(icon_title) = 'whitening' then 'bathing.type.whitening'
      when lower(icon_title) in ('shampoo from home', 'from home') then 'bathing.type.shampoo_from_home'
      when lower(icon_title) like '%hypo%' and lower(icon_title) like '%no spray%' then 'bathing.type.hypoallergenic_no_spray'
      when lower(icon_title) like '%hypo%' and lower(icon_title) like '%with spray%' then 'bathing.type.hypoallergenic_with_spray'
      when lower(icon_title) like '%hypo%' then 'bathing.type.hypoallergenic'
      when lower(icon_title) like '%water rinse%' then 'bathing.type.water_rinse'
      when lower(icon_title) like '%fresh n clean%' or lower(icon_title) like '%fresh & clean%' then 'bathing.type.fresh_n_clean'
      when lower(icon_title) in ('bath', 'standard') then 'bathing.type.standard'
      when lower(icon_title) like '%no crate dryer%' then 'bathing.modifier.no_crate_dryer'
      when lower(icon_title) like '%no velocity dryer%' then 'bathing.modifier.no_velocity_dryer'
      when lower(icon_title) = 'no dryer' or (lower(icon_title) like '%no dryer%' and lower(icon_title) not like '%spray%') then 'bathing.modifier.no_dryer'
      when lower(icon_title) like '%towel dry only%' then 'bathing.modifier.towel_dry_only'
      when lower(icon_title) like '%see account notes%' then 'bathing.modifier.see_account_notes'
      else null
    end as capability_key,
    nullif(icon_template_id, '') as icon_template_id,
    icon_identity_key,
    icon_group
  from public.gingr_animal_icons_live
  where lower(icon_group) = 'bath'
)
insert into public.gingr_icon_mappings (
  location_id,
  capability_key,
  icon_template_id,
  icon_identity_key,
  icon_group
)
select distinct
  location_id,
  capability_key,
  icon_template_id,
  icon_identity_key,
  icon_group
from seed_candidates
where capability_key is not null
on conflict (location_id, capability_key, icon_identity_key)
do update set
  icon_template_id = excluded.icon_template_id,
  icon_group = excluded.icon_group,
  is_active = true,
  updated_at = now();

-- The first dynamic workflow seed grouped historical reservation service rows by
-- per-reservation service ids. That produced tens of thousands of active service
-- mappings for Adair Forsythe and made Edge Functions load far more config than
-- the workflows need. Collapse historical service seeds to normalized names.

with normalized_services as (
  select
    location_id,
    lower(regexp_replace(btrim(service_name), '\s+', ' ', 'g')) as label_key,
    min(service_name) as service_name,
    min(reservation_type_id) filter (where reservation_type_id is not null and reservation_type_id <> '') as reservation_type_id,
    min(reservation_type_name) filter (where reservation_type_name is not null and reservation_type_name <> '') as reservation_type_name
  from public.gingr_service_catalog
  where service_name is not null
    and btrim(service_name) <> ''
  group by location_id, lower(regexp_replace(btrim(service_name), '\s+', ' ', 'g'))
),
inserted_name_catalog as (
  insert into public.gingr_service_catalog (
    location_id,
    source_key,
    service_id,
    service_name,
    reservation_type_id,
    reservation_type_name,
    source_kind,
    raw_payload,
    last_seen_at,
    synced_at
  )
  select
    location_id,
    'service_name:' || label_key,
    null,
    service_name,
    reservation_type_id,
    reservation_type_name,
    'historical_service_name',
    jsonb_build_object(
      'seeded_from', 'historical_service_name_dedupe',
      'service_name', service_name
    ),
    now(),
    now()
  from normalized_services
  on conflict (location_id, source_key)
  do update set
    service_name = excluded.service_name,
    reservation_type_id = coalesce(public.gingr_service_catalog.reservation_type_id, excluded.reservation_type_id),
    reservation_type_name = coalesce(public.gingr_service_catalog.reservation_type_name, excluded.reservation_type_name),
    source_kind = coalesce(nullif(public.gingr_service_catalog.source_kind, ''), excluded.source_kind),
    last_seen_at = now(),
    synced_at = now()
  returning location_id, source_key
)
delete from public.gingr_service_catalog catalog
where catalog.source_key like 'service:%'
  and exists (
    select 1
    from normalized_services normalized
    where normalized.location_id = catalog.location_id
      and 'service_name:' || normalized.label_key <> catalog.source_key
      and lower(regexp_replace(btrim(catalog.service_name), '\s+', ' ', 'g')) = normalized.label_key
  );

delete from public.gingr_workflow_mappings
where mapping_source = 'legacy_seed'
  and source_type = 'service'
  and settings->>'seeded_from' in ('legacy_service_name', 'legacy_bath_service_name');

with service_seed as (
  select
    location_id,
    source_key,
    service_id,
    service_name,
    lower(regexp_replace(btrim(service_name), '\s+', ' ', 'g')) as label_key
  from public.gingr_service_catalog
  where service_name is not null
    and btrim(service_name) <> ''
    and source_key like 'service_name:%'
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
  where label_key like '%bath%'
     or label_key like '%groom%'

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
      when label_key like '%shampoo from home%' then 'bathing.type.shampoo_from_home'
      when label_key like '%fresh n clean%' or label_key like '%fresh & clean%' then 'bathing.type.fresh_n_clean'
      when label_key like '%water rinse%' then 'bathing.type.water_rinse'
      when label_key = 'premium' or label_key like '%premium bath%' then 'bathing.type.premium'
      when label_key = 'medicated' or label_key like '%medicated bath%' then 'bathing.type.medicated'
      when label_key = 'whitening' or label_key like '%whitening bath%' then 'bathing.type.whitening'
      when label_key = 'bath' or label_key like '%standard bath%' then 'bathing.type.standard'
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
  source_id = coalesce(excluded.source_id, public.gingr_workflow_mappings.source_id),
  source_label = excluded.source_label,
  settings = excluded.settings || public.gingr_workflow_mappings.settings,
  is_active = true,
  updated_at = now()
where public.gingr_workflow_mappings.mapping_source = 'legacy_seed';

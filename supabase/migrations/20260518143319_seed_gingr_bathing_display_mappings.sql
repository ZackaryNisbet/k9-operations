-- Seed display-only workflow rows from the explicit Gingr icon capabilities
-- that already power current report displays.
--
-- This keeps the Gingr Configuration matrix aligned with current behavior:
-- Bath icon rows should appear enabled for Bathing without making those icons
-- decide which dogs appear on the bathing report. Play icon rows should appear
-- enabled for reports that currently show playgroup/icon-derived context on
-- web/mobile workflow rows.

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
select distinct on (m.location_id, coalesce(inv.icon_identity_key, m.icon_identity_key, inv.inventory_key, m.icon_template_id))
  m.location_id,
  'bathing'::text as workflow_key,
  'icon'::text as source_type,
  coalesce(nullif(m.icon_template_id, ''), nullif(m.icon_identity_key, ''), nullif(inv.inventory_key, '')) as source_id,
  'icon:' || coalesce(inv.icon_identity_key, m.icon_identity_key, inv.inventory_key, m.icon_template_id) as source_identity_key,
  coalesce(inv.current_title, m.icon_identity_key, inv.inventory_key, m.icon_template_id) as source_label,
  'bathing.display_icon'::text as capability_key,
  jsonb_build_object(
    'behavior', 'cosmetic',
    'seeded_from', 'existing_bathing_icon_capability',
    'source_capability_key', m.capability_key
  ) as settings,
  'legacy_seed'::text as mapping_source,
  false as is_required,
  true as is_active
from public.gingr_icon_mappings m
left join public.v_gingr_icon_inventory_current inv
  on inv.location_id = m.location_id
 and (
   (nullif(m.icon_template_id, '') is not null and inv.icon_template_id = nullif(m.icon_template_id, ''))
   or inv.icon_identity_key = m.icon_identity_key
 )
where m.is_active = true
  and (
    m.capability_key = 'bathing.include'
    or m.capability_key like 'bathing.type.%'
    or m.capability_key like 'bathing.modifier.%'
  )
  and coalesce(inv.icon_identity_key, m.icon_identity_key, inv.inventory_key, m.icon_template_id) is not null
on conflict (location_id, workflow_key, source_type, source_identity_key, capability_key)
do nothing;

create unique index if not exists uniq_gingr_workflow_active_room_cleaning_run_classification
on public.gingr_workflow_mappings (location_id, workflow_key, source_type, source_identity_key)
where is_active = true
  and workflow_key = 'room_cleaning'
  and source_type = 'run'
  and capability_key in (
    'room_cleaning.lodging_room',
    'room_cleaning.private_play_room',
    'room_cleaning.isolation_room'
  );

with configured_locations as (
  select distinct location_id from public.gingr_icon_mappings where location_id is not null
  union
  select distinct location_id from public.gingr_workflow_mappings where location_id is not null
  union
  select distinct location_id from public.gingr_service_catalog where location_id is not null
  union
  select distinct location_id from public.gingr_service_addon_catalog where location_id is not null
  union
  select distinct location_id from public.gingr_reservation_types where location_id is not null
  union
  select distinct location_id from public.gingr_runs where location_id is not null
),
workflow_inventory as (
  select *
  from (
    values
      ('gingr_reference_sync', 'Gingr Reference Sync', '{"status":"covered","role_ids":["bootstrap","onboarding"],"route":"settings","daily_ops_id":"gingr_reference_sync_runs","completion_key":"v_gingr_initial_sync_status","source_categories":["animal icons","reservation types","services/add-ons","runs/rooms","feeding and medication source data"],"current_defaults":["full historical pull on initial sync","reference refresh can be rerun from Gingr Configuration"],"config_surfaces":["summary tiles","initial sync status","refresh Gingr data"]}'::jsonb),
      ('reservation_categories', 'Shared Reservation Categories', '{"status":"covered","role_ids":["reservation_categories"],"route":"shared server dependency","daily_ops_id":"not a daily row","completion_key":"not applicable","source_categories":["Gingr reservation types"],"current_defaults":["boarding","day boarding","daycare","evaluation","grooming","tour","other"],"config_surfaces":["reservation types"]}'::jsonb),
      ('playgroups', 'Shared Playgroup Icons', '{"status":"covered","role_ids":["playgroups"],"route":"shared server dependency","daily_ops_id":"v_dog_playgroups / v_dog_playgroup_icon_tags","completion_key":"not applicable","source_categories":["Gingr animal icons"],"current_defaults":["private play","large daycare","small daycare","evaluation"],"config_surfaces":["icon matrix"]}'::jsonb),
      ('room_occupancy', 'Room Occupancy Source', '{"status":"partial","role_ids":["room_occupancy"],"route":"shared server dependency","daily_ops_id":"ops_room_occupancy_${date}","completion_key":"not applicable","source_categories":["Gingr runs/rooms","room occupancy table","reservation categories"],"current_defaults":["lodging-only categories","room code extraction","daycare/evaluation exclusion"],"config_surfaces":["runs / rooms","reservation types"]}'::jsonb),
      ('bathing', 'Bathing Report', '{"status":"covered","role_ids":["bathing"],"route":"ops-bathing","daily_ops_id":"ops_bathing_${date}","completion_key":"ops_bathing_${date}","source_categories":["bath services/add-ons","bath and play icons for display","boarding stay logic"],"current_defaults":["service/add-on contains bath or groom","bath icons display shampoo/modifier notes","play icons display playgroup context"],"config_surfaces":["services/add-ons","icon matrix","reservation types"]}'::jsonb),
      ('private_play', 'Private Play', '{"status":"covered","role_ids":["pp","private_play"],"route":"ops-pp","daily_ops_id":"ops_pp_${date}","completion_key":"ops_pp_${date}","source_categories":["Private Play icon","Private Play / play-time services","day boarding / reservation type rules"],"current_defaults":["play.private_play","service/add-on contains private play or play time","required_sessions=3"],"config_surfaces":["icon matrix","services/add-ons","reservation types","PP sessions"]}'::jsonb),
      ('room_cleaning', 'Room Cleaning & Setups', '{"status":"covered","role_ids":["room_cleaning"],"route":"ops-rooms","daily_ops_id":"ops_room_cleaning_${date}","completion_key":"task ids in ops_room_cleaning_${date}","source_categories":["Gingr runs/rooms","room occupancy","boarding arrival/departure dates"],"current_defaults":["run.is_private_play","run.is_isolation","otherwise lodging room","refresh/full disinfect/setup rules stay server-side"],"config_surfaces":["runs / rooms","reservation types"]}'::jsonb),
      ('enrichment', 'Enrichment', '{"status":"covered","role_ids":["enrichment"],"route":"ops-svc","daily_ops_id":"ops_svc_${date}","completion_key":"ops_svc_Enrichment_${date}","source_categories":["enrichment services/add-ons","play icons for display"],"current_defaults":["service/add-on contains enrichment","play icons display playgroup context"],"config_surfaces":["services/add-ons","icon matrix","reservation types"]}'::jsonb),
      ('pamper', 'Pamper Package', '{"status":"covered","role_ids":["pamper"],"route":"ops-pamper","daily_ops_id":"ops_pamper_${date}","completion_key":"ops_pamper_${date}","source_categories":["pamper services/add-ons","Luxury Suite reservation types","play icons for display"],"current_defaults":["service/add-on contains pamper","reservation type contains luxury suite"],"config_surfaces":["services/add-ons","reservation types","icon matrix"]}'::jsonb),
      ('collar_prep', 'Next Day Collars', '{"status":"partial","role_ids":["collars","collar_prep"],"route":"ops-collars","daily_ops_id":"ops_collars_${tomorrow}","completion_key":"ops_collars_completions_${tomorrow}","source_categories":["next-day reservations","play icons","collar color rules"],"current_defaults":["small/large/private/evaluation play parsing","pink/red/green/blue/yellow/half-and-half collar buckets"],"config_surfaces":["icon matrix","collar color policy still needs runtime config"]}'::jsonb),
      ('roll_call_opening', 'Opening Roll Call', '{"status":"partial","role_ids":["roll_call_opening"],"route":"ops-roll-call-opening","daily_ops_id":"ops_roll_call_opening_${date}","completion_key":"room/reservation row completions","source_categories":["current in-resort dogs","reservation categories","room/area order","play icons for display"],"current_defaults":["area order and boarding classification are code-defined"],"config_surfaces":["reservation types","icon matrix","runs / rooms visible; area ordering still needs runtime config"]}'::jsonb),
      ('roll_call_closing', 'Closing Roll Call', '{"status":"partial","role_ids":["roll_call_closing","roll_call"],"route":"ops-roll-call-closing","daily_ops_id":"ops_roll_call_closing_${date}","completion_key":"room/reservation row completions","source_categories":["current in-resort dogs","reservation categories","room/area order","play icons for display"],"current_defaults":["closing roll call shares the same area and category assumptions"],"config_surfaces":["reservation types","icon matrix","runs / rooms visible; area ordering still needs runtime config"]}'::jsonb),
      ('feeding_meds', 'Feeding & Meds', '{"status":"partial","role_ids":["feeding_meds_am","feeding_meds_midday","feeding_meds_pm"],"route":"care reports","daily_ops_id":"ops_feeding_meds_{session}_${date}","completion_key":"instruction item ids","source_categories":["feeding schedules","medication schedules","reservation status","play icons for display"],"current_defaults":["AM/midday/PM keyword and hour parsing","BID/TID schedule handling"],"config_surfaces":["icon matrix","care schedule aliases still need runtime config"]}'::jsonb),
      ('feeding_report', 'Feeding Report', '{"status":"partial","role_ids":["feeding_report"],"route":"ops-feeding-report","daily_ops_id":"ops_feeding_report_${date}","completion_key":"row ids with outcome","source_categories":["feeding schedules","overnight boarding category","reservation status"],"current_defaults":["overnight boarding is text/category classified","AM requires prior overnight"],"config_surfaces":["reservation types","care report filters still need runtime config"]}'::jsonb),
      ('medication_report', 'Medication Report', '{"status":"partial","role_ids":["meds","medication_report"],"route":"ops-medication-report","daily_ops_id":"ops_medication_report_${date}","completion_key":"row ids with decision/outcome","source_categories":["medication schedules","reservation status"],"current_defaults":["web/mobile ids currently alias meds to medication_report","pill-pocket/in-food fallback text"],"config_surfaces":["care schedule aliases still need runtime config"]}'::jsonb),
      ('lodging_transfers', 'Lodging Transfers', '{"status":"partial","role_ids":["lodging_transfer","lodging_transfers"],"route":"ops-lodging-transfers","daily_ops_id":"ops_lodging_transfer_${date}","completion_key":"ops_lodging_transfer_completions_${date}","source_categories":["Gingr lodging transfer report","room assignment changes","current occupancy fallback"],"current_defaults":["move belongings / update collar / clean old room / setup new room action taxonomy"],"config_surfaces":["runs / rooms visible","action taxonomy still needs runtime config"]}'::jsonb),
      ('gourmet_ice_cream', 'Gourmet Ice Cream', '{"status":"covered","role_ids":["ice_cream","gourmet_ice_cream"],"route":"eod","daily_ops_id":"ops_svc_${date}","completion_key":"ops_svc_Ice_Cream_${date}","source_categories":["ice cream / gourmet services","play icons for display"],"current_defaults":["service/add-on contains ice cream or gourmet"],"config_surfaces":["services/add-ons","icon matrix"]}'::jsonb),
      ('belongings', 'Belongings', '{"status":"partial","role_ids":["belongings"],"route":"ops-belongings","daily_ops_id":"ops_belongings_${tomorrow}","completion_key":"ops_belongings_completions_${tomorrow}","source_categories":["departing reservations","Gingr belongings fields/forms"],"current_defaults":["tomorrow departure window","row key g${reservationGingrId}","answer_1/2/3 field meanings"],"config_surfaces":["reservation types","departure field/window rules still need runtime config"]}'::jsonb),
      ('shutouts', 'Shutouts', '{"status":"gap","role_ids":["shutouts"],"route":"","daily_ops_id":"No current runtime row found","completion_key":"No current completion source found","source_categories":["requested workflow, no current report code path found"],"current_defaults":["none found"],"config_surfaces":["reserved column for future pairing"]}'::jsonb),
      ('scheduling_capacity', 'Staffing Capacity', '{"status":"partial","role_ids":["scheduling_capacity"],"route":"scheduling","daily_ops_id":"scheduling projection snapshots","completion_key":"not applicable","source_categories":["reservation types","playgroup icons","bath services","medication services","runs/rooms"],"current_defaults":["reservation bucket names","medication service keyword","departure bath logic","capacity factors"],"config_surfaces":["reservation types","icon matrix","services/add-ons; staffing factors still live outside this screen"]}'::jsonb),
      ('checkout_tv', 'Checkout TV / Facility Presence', '{"status":"partial","role_ids":["checkout_tv","facility_presence"],"route":"checkout-tv","daily_ops_id":"facility_presence_current","completion_key":"not applicable","source_categories":["checked-in reservations","room assignments","playgroup icons","presence sync settings"],"current_defaults":["presence cadence and business-hour behavior","boarding/daycare/evaluation/day-boarding sets","playgroup priority"],"config_surfaces":["reservation types","icon matrix","runs / rooms; sync settings remain separate"]}'::jsonb)
  ) as rows(workflow_key, label, settings)
)
insert into public.gingr_workflow_settings (
  location_id,
  workflow_key,
  label,
  settings,
  is_active
)
select
  configured_locations.location_id,
  workflow_inventory.workflow_key,
  workflow_inventory.label,
  workflow_inventory.settings || jsonb_build_object(
    'configured_from', 'gingr_configuration_source_inventory',
    'inventory_only', true
  ),
  true
from configured_locations
cross join workflow_inventory
on conflict (location_id, workflow_key)
do update set
  label = excluded.label,
  settings = excluded.settings || public.gingr_workflow_settings.settings,
  is_active = public.gingr_workflow_settings.is_active,
  updated_at = now();

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
with workflow_sources as (
  select
    location_id,
    'service'::text as source_type,
    service_id as source_id,
    source_key as source_identity_key,
    service_name as source_label,
    lower(service_name) as label_key
  from public.gingr_service_catalog
  union all
  select
    location_id,
    'service_addon'::text as source_type,
    addon_id as source_id,
    source_key as source_identity_key,
    addon_name as source_label,
    lower(addon_name) as label_key
  from public.gingr_service_addon_catalog
),
seeded_workflows as (
  select
    location_id,
    'private_play'::text as workflow_key,
    source_type,
    source_id,
    source_identity_key,
    source_label,
    'private_play.include'::text as capability_key,
    '{"seeded_from": "legacy_service_keyword", "required_sessions": 3, "needs_review": true}'::jsonb as settings,
    true as is_required
  from workflow_sources
  where label_key like '%private play%' or label_key like '%play time%'
  union all
  select
    location_id,
    'bathing',
    source_type,
    source_id,
    source_identity_key,
    source_label,
    'bathing.include',
    '{"seeded_from": "legacy_service_keyword", "needs_review": true}'::jsonb,
    true
  from workflow_sources
  where label_key like '%bath%' or label_key like '%groom%'
  union all
  select
    location_id,
    'pamper',
    source_type,
    source_id,
    source_identity_key,
    source_label,
    'pamper.include',
    '{"seeded_from": "legacy_service_keyword", "needs_review": true}'::jsonb,
    true
  from workflow_sources
  where label_key like '%pamper%'
  union all
  select
    location_id,
    'enrichment',
    source_type,
    source_id,
    source_identity_key,
    source_label,
    'enrichment.include',
    '{"seeded_from": "legacy_service_keyword", "needs_review": true}'::jsonb,
    true
  from workflow_sources
  where label_key like '%enrichment%'
  union all
  select
    location_id,
    'gourmet_ice_cream',
    source_type,
    source_id,
    source_identity_key,
    source_label,
    'gourmet_ice_cream.include',
    '{"seeded_from": "legacy_service_keyword", "needs_review": true}'::jsonb,
    true
  from workflow_sources
  where label_key like '%ice cream%' or label_key like '%gourmet%'
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
  is_required,
  true
from seeded_workflows
on conflict (location_id, workflow_key, source_type, source_identity_key, capability_key)
do nothing;

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
select distinct on (
  m.location_id,
  workflow.workflow_key,
  coalesce(inv.icon_identity_key, m.icon_identity_key, inv.inventory_key, m.icon_template_id)
)
  m.location_id,
  workflow.workflow_key,
  'icon'::text as source_type,
  coalesce(nullif(m.icon_template_id, ''), nullif(m.icon_identity_key, ''), nullif(inv.inventory_key, '')) as source_id,
  'icon:' || coalesce(inv.icon_identity_key, m.icon_identity_key, inv.inventory_key, m.icon_template_id) as source_identity_key,
  coalesce(inv.current_title, m.icon_identity_key, inv.inventory_key, m.icon_template_id) as source_label,
  workflow.workflow_key || '.display_icon' as capability_key,
  jsonb_build_object(
    'behavior', 'cosmetic',
    'seeded_from', 'existing_play_icon_report_context',
    'source_capability_key', m.capability_key
  ) as settings,
  'legacy_seed'::text as mapping_source,
  false as is_required,
  true as is_active
from public.gingr_icon_mappings m
cross join (
  values
    ('bathing'::text),
    ('enrichment'::text),
    ('pamper'::text),
    ('collar_prep'::text),
    ('roll_call'::text),
    ('feeding_meds'::text),
    ('gourmet_ice_cream'::text)
) as workflow(workflow_key)
left join public.v_gingr_icon_inventory_current inv
  on inv.location_id = m.location_id
 and (
   (nullif(m.icon_template_id, '') is not null and inv.icon_template_id = nullif(m.icon_template_id, ''))
   or inv.icon_identity_key = m.icon_identity_key
 )
where m.is_active = true
  and m.capability_key in (
    'play.private_play',
    'play.large_daycare',
    'play.small_daycare',
    'play.evaluation'
  )
  and coalesce(inv.icon_identity_key, m.icon_identity_key, inv.inventory_key, m.icon_template_id) is not null
on conflict (location_id, workflow_key, source_type, source_identity_key, capability_key)
do nothing;

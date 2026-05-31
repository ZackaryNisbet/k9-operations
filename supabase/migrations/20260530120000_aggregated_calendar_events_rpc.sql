-- Aggregated calendar feed (C1 · K9-16).
--
-- One server-side function that unions the six operational sources into a
-- normalized event stream for a location + date window:
--   labor start dates, 30/60/90-day reviews, training due dates, marketing
--   events + outreach follow-ups, enrichment events, and the recurring
--   inventory count (materialized from the per-location cadence in lite_settings).
--
-- SECURITY INVOKER so the existing per-table RLS (labor_has_location_access,
-- can_access_training_location, the enrichment/grassroots policies, …) governs
-- what each caller can see; the function adds no new read surface of its own.

create or replace function public.get_calendar_events(
  p_location_id uuid,
  p_start date,
  p_end date,
  p_today date default current_date
)
returns table (
  source text,
  event_id text,
  kind text,
  event_date date,
  event_time time,
  title text,
  subtitle text,
  status text,
  tone text,
  ref_id text
)
language sql
stable
security invoker
-- search_path = public (not '') on purpose: this function reads tables whose RLS
-- policies call helper functions (e.g. get_user_location_id) that reference
-- unqualified public tables and don't pin their own search_path. An empty
-- search_path would make those helpers fail with "relation does not exist" on the
-- authenticated path. Our own table refs below stay fully schema-qualified.
set search_path = public
as $$
  with inv_sched as (
    select
      coalesce(nullif(s.setting_value->>'cadenceDays','')::int, 7)       as cadence,
      coalesce(nullif(s.setting_value->>'dueWeekday','')::int, 1)        as dow,
      coalesce(nullif(s.setting_value->>'dueTime',''), '09:00')::time    as due_time,
      nullif(s.setting_value->>'anchorDate','')::date                    as anchor_raw
    from (select 1) one
    left join public.lite_settings s
      on s.location_id = p_location_id::text
     and s.setting_key = 'inventory_schedule'
  ),
  inv as (
    select
      greatest(coalesce(cadence, 7), 1) as cadence,
      due_time,
      coalesce(anchor_raw, (p_today - (((extract(dow from p_today)::int - dow + 7) % 7)))) as anchor
    from inv_sched
  )

  -- 1. Labor: start dates
  select 'labor', 'labor-start-'||e.id::text, 'start',
         e.start_date, null::time,
         coalesce(nullif(e.full_name,''), 'New hire'),
         case when nullif(e.position_title,'') is not null then 'Starts · '||e.position_title else 'Start date' end,
         e.employment_status::text,
         case when e.start_date < p_today then 'done' else 'default' end,
         e.id::text
  from public.labor_employees e
  where e.location_id = p_location_id
    and e.start_date between p_start and p_end

  union all
  -- 1b. Labor: first-shift dates (when distinct from the start date)
  select 'labor', 'labor-shift-'||e.id::text, 'first_shift',
         e.first_shift_date, null::time,
         coalesce(nullif(e.full_name,''), 'New hire'),
         case when nullif(e.position_title,'') is not null then 'First shift · '||e.position_title else 'First shift' end,
         e.employment_status::text,
         'default',
         e.id::text
  from public.labor_employees e
  where e.location_id = p_location_id
    and e.first_shift_date is distinct from e.start_date
    and e.first_shift_date between p_start and p_end

  union all
  -- 2. Reviews: 30 / 60 / 90-day instances
  select 'review', 'review-'||r.id::text, r.review_cycle::text,
         r.due_date, null::time,
         coalesce(nullif(e.full_name,''), 'Employee')||' · '||
           (case r.review_cycle::text when '30_day' then '30-Day' when '60_day' then '60-Day' when '90_day' then '90-Day' else 'Review' end)||' review',
         case when r.status::text = 'completed' then 'Completed'
              when r.due_date < p_today then 'Overdue' else 'Due' end,
         r.status::text,
         case when r.status::text = 'completed' then 'done'
              when r.due_date < p_today then 'overdue' else 'default' end,
         r.id::text
  from public.employee_review_instances r
  join public.labor_employees e on e.id = r.labor_employee_id
  where e.location_id = p_location_id
    and r.review_cycle::text in ('30_day','60_day','90_day')
    and r.due_date between p_start and p_end

  union all
  -- 3. Training: outstanding records with a target completion date
  select 'training', 'training-'||t.id::text, 'due',
         t.target_end_date, null::time,
         coalesce(nullif(t.employee_full_name,''), 'Employee')||' · Training due',
         coalesce(nullif(t.target_role,''), 'Training')||
           case when coalesce(t.progress_percent,0) > 0 then ' · '||round(t.progress_percent)::text||'%' else '' end,
         t.overall_status::text,
         case when t.target_end_date < p_today then 'overdue' else 'default' end,
         t.id::text
  from public.training_records t
  where t.location_id = p_location_id
    and t.overall_status::text not in ('complete','passed','archived')
    and t.target_end_date between p_start and p_end

  union all
  -- 4. Marketing: scheduled event dates (org-centric grassroots tracker model).
  -- Events live in grassroots_event_dates (one row per date) joined to the target
  -- org/contact in grassroots_targets — NOT the legacy grassroots_events table.
  select 'marketing', 'mkt-eventdate-'||ed.id::text, 'event',
         ed.event_date, ed.start_time,
         coalesce(nullif(trim(tg.name),''), nullif(tg.organizer,''), 'Marketing event'),
         coalesce(nullif(tg.organizer,''),
           case tg.category
             when 'events' then 'Events'
             when 'drops' then 'Drops'
             when 'corporate_partnerships' then 'Corporate partnership'
             when 'apartments' then 'Apartments'
             when 'pet_professional_partnerships' then 'Pet professional'
             else coalesce(nullif(initcap(replace(tg.category,'_',' ')),''), 'Event') end),
         tg.status,
         case when ed.event_date < p_today then 'done' else 'default' end,
         ed.target_id::text
  from public.grassroots_event_dates ed
  join public.grassroots_targets tg on tg.id = ed.target_id
  where ed.location_id = p_location_id
    and ed.event_date between p_start and p_end

  union all
  -- 5. Marketing: outreach follow-ups (a target's next scheduled contact)
  select 'marketing', 'mkt-follow-'||tg.id::text, 'follow_up',
         tg.next_contact_date, null::time,
         'Follow up · '||coalesce(nullif(trim(tg.name),''), nullif(tg.organizer,''), 'Outreach target'),
         case tg.category
           when 'events' then 'Events'
           when 'drops' then 'Drops'
           when 'corporate_partnerships' then 'Corporate partnership'
           when 'apartments' then 'Apartments'
           when 'pet_professional_partnerships' then 'Pet professional'
           else coalesce(nullif(initcap(replace(tg.category,'_',' ')),''), 'Outreach') end,
         tg.status,
         case when tg.next_contact_date < p_today then 'overdue' else 'default' end,
         tg.id::text
  from public.grassroots_targets tg
  where tg.location_id = p_location_id
    and tg.next_contact_date between p_start and p_end

  union all
  -- 6. Enrichment: enterprise-mandated (global) + this location's own events
  select 'enrichment', 'enrich-'||en.id::text, 'enrichment',
         en.event_date, null::time,
         coalesce(nullif(en.title,''), 'Enrichment'),
         coalesce(nullif(en.subtitle,''), nullif(en.category,''), 'Enrichment'),
         en.status,
         'default',
         en.id::text
  from public.enrichment_events en
  where (en.scope = 'global' or en.location_id = p_location_id::text)
    and en.event_date between p_start and p_end

  union all
  -- 7. Inventory: recurring count-due materialized from the cadence
  select 'inventory', 'inventory-'||to_char(occ.d,'YYYY-MM-DD'), 'count_due',
         occ.d, inv.due_time,
         'Inventory count due',
         case inv.cadence when 7 then 'Weekly count' when 14 then 'Biweekly count' when 28 then 'Every 4 weeks' else inv.cadence::text||'-day cadence' end,
         null::text,
         case when occ.d < p_today then 'overdue' else 'default' end,
         null::text
  from inv
  cross join lateral (
    select (inv.anchor + (n * inv.cadence))::date as d
    from generate_series(
      floor((p_start - inv.anchor)::numeric / inv.cadence)::int,
      ceil((p_end - inv.anchor)::numeric / inv.cadence)::int
    ) as n
  ) occ
  where occ.d between p_start and p_end
$$;

grant execute on function public.get_calendar_events(uuid, date, date, date) to authenticated, service_role;

-- Aggregated calendar feed (C1 · K9-16).
--
-- One server-side function that unions the operational sources into a normalized
-- event stream for a location + date window:
--   labor start dates, compliance due dates, training due dates, marketing events
--   + outreach follow-ups, enrichment events, and the recurring inventory count.
--
-- SECURITY INVOKER so the existing per-table RLS governs what each caller sees;
-- the function adds no new read surface of its own.

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
  ),
  -- Effective compliance requirements for this location: active, scoped to the
  -- enterprise (all locations) or this location, deduped per policy (the
  -- location-scoped override wins). Mirrors get_labor_compliance_board.
  comp_eff as (
    select id, coalesce(parent_requirement_id, id) as policy_key, title, due_rule, renewal_due_date_required, metadata
    from (
      select r.*, row_number() over (partition by coalesce(r.parent_requirement_id, r.id)
              order by case when r.scope_type='location' then 1 else 0 end desc, r.updated_at desc, r.id) as rn
      from public.labor_compliance_requirements r
      where r.is_active = true
        and ((r.scope_type='enterprise' and r.scope_location_id is null)
             or (r.scope_type='location' and r.scope_location_id = p_location_id))
    ) ranked
    where rn = 1
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
  -- 2. Compliance: effective due date per employee × applicable requirement.
  -- COALESCE(due-date override, legacy review instance, start_date + offset_days,
  -- renewal due date). Role applicability + waiver/NA exclusion match the board.
  select 'compliance', 'compliance-'||e.id::text||'-'||er.policy_key::text, 'due',
         cd.due_date, null::time,
         er.title,
         coalesce(nullif(e.full_name,''), 'Employee'),
         null::text,
         case when cd.completed then 'done' when cd.due_date < p_today then 'overdue' else 'default' end,
         e.id::text
  from public.labor_employees e
  cross join comp_eff er
  cross join lateral (
    select
      coalesce(ovr.due_date, lr.due_date,
        case when er.due_rule->>'anchor'='start_date' and er.due_rule ? 'offset_days' and e.start_date is not null
             then e.start_date + ((er.due_rule->>'offset_days')::int) end,
        case when er.renewal_due_date_required then ev.renewal_due_date end) as due_date,
      (lr.status='completed' or ev.completed_on is not null) as completed,
      ex.exception_kind
    from (select 1) _
    left join lateral (select d.due_date from public.labor_compliance_due_date_overrides d
       where d.labor_employee_id=e.id and d.requirement_id=er.id and d.is_current and d.superseded_at is null
       order by d.updated_at desc limit 1) ovr on true
    left join lateral (select eri.due_date, eri.status::text as status from public.employee_review_instances eri
       where eri.labor_employee_id=e.id and eri.review_cycle::text = er.metadata->>'legacy_review_cycle'
       order by coalesce(eri.completed_at, eri.updated_at, eri.created_at) desc limit 1) lr on true
    left join lateral (select el.renewal_due_date, el.completed_on from public.labor_compliance_evidence_links el
       where el.labor_employee_id=e.id and el.requirement_id=er.id and el.is_current and el.superseded_at is null
       order by el.updated_at desc limit 1) ev on true
    left join lateral (select ex2.exception_kind from public.labor_compliance_exceptions ex2
       where ex2.labor_employee_id=e.id and ex2.requirement_id=er.id and ex2.superseded_at is null
         and ex2.effective_on <= p_today and (ex2.expires_on is null or ex2.expires_on >= p_today)
       order by ex2.effective_on desc limit 1) ex on true
  ) cd
  where e.location_id = p_location_id
    and coalesce(e.employment_status::text,'active') not in ('terminated','quit','archived')
    and (e.end_date is null or e.end_date >= p_today)
    and (not exists (select 1 from public.labor_compliance_role_applicability ra where ra.requirement_id=er.id and ra.is_required=true)
         or exists (select 1 from public.labor_compliance_role_applicability ra where ra.requirement_id=er.id and ra.is_required=true
                    and (lower(btrim(ra.role_name))=lower(btrim(coalesce(e.position_title,'')))
                         or lower(btrim(coalesce(e.position_title,''))) like '%'||lower(btrim(ra.role_name))||'%')))
    and cd.due_date is not null
    and cd.due_date between p_start and p_end
    and coalesce(cd.exception_kind,'') not in ('waived','not_applicable_override','historical_cleanup')

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

  union all
  -- 8. Federal holidays (universal — no location filter)
  select 'holiday', 'holiday-'||to_char(h.holiday_date,'YYYY-MM-DD'), 'holiday',
         h.holiday_date, null::time,
         h.name, 'Federal holiday', null::text, 'default', null::text
  from public.us_federal_holidays h
  where h.holiday_date between p_start and p_end
$$;

grant execute on function public.get_calendar_events(uuid, date, date, date) to authenticated, service_role;

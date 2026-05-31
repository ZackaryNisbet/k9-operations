-- ============================================================================
-- Ignite Lead Updates — relational CRM follow-up log
-- Replaces the short-lived ignite_leads.outreach_log JSON blob with a proper
-- relational table, modeled on grassroots_activity: one row per outreach touch
-- (call / text / email / note), each carrying a note and an optional next
-- follow-up date, attributed to a user.
-- ============================================================================

create table if not exists ignite_lead_updates (
  id                  uuid primary key default gen_random_uuid(),
  location_id         uuid not null,
  lead_id             uuid not null references ignite_leads(id) on delete cascade,
  update_type         text not null default 'note' check (update_type in ('call','text','email','note')),
  notes               text,
  next_follow_up_date date,
  created_by_user_id  uuid,
  created_by_name     text,
  created_at          timestamptz not null default now()
);

create index if not exists idx_ignite_lead_updates_lead     on ignite_lead_updates(lead_id);
create index if not exists idx_ignite_lead_updates_location on ignite_lead_updates(location_id);

comment on table ignite_lead_updates is 'CRM outreach/follow-up log for an ignite_leads submission (one row per touch).';

alter table ignite_lead_updates enable row level security;
create policy "Allow all for authenticated" on ignite_lead_updates
  for all to authenticated using (true) with check (true);

-- Retire the JSON-blob approach.
alter table ignite_leads drop column if exists outreach_log;

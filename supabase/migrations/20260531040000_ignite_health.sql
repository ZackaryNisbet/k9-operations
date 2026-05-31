-- ============================================================================
-- Ignite Health — pipeline health snapshots written hourly by the
-- ignite-health-check edge function (dry-run bridge + Resend reachability +
-- submission freshness). The CRM health badge reads the latest row.
-- ============================================================================

create table if not exists ignite_health (
  id            uuid primary key default gen_random_uuid(),
  location_id   uuid not null,
  checked_at    timestamptz not null default now(),
  level         text not null,           -- ok | warn | down | unconfigured
  bridge_ok     boolean,                 -- dry-run parse+routing validated
  resend_ok     boolean,                 -- Resend account/API reachable
  last_lead_at  timestamptz,             -- freshness of real submissions
  detail        text
);

create index if not exists idx_ignite_health_location on ignite_health(location_id, checked_at desc);

alter table ignite_health enable row level security;
create policy "Allow all for authenticated" on ignite_health
  for all to authenticated using (true) with check (true);

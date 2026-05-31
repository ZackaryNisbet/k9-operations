-- ============================================================================
-- Ignite Health — detailed per-run telemetry + synthetic round-trip probe.
--
-- Turns the hourly snapshot into a rich, per-run record the CRM health feature
-- can show in excruciating detail (per-check latencies + the synthetic round-trip
-- timings), and adds the plumbing for a canary: a tagged email sent through the
-- REAL pipeline every run, flagged so it never reaches the CRM.
-- ============================================================================

-- 1. Flag synthetic health-check probes on ignite_leads so they never pollute
--    the CRM list or the freshness signal. Existing rows default to false.
alter table ignite_leads add column if not exists is_synthetic boolean not null default false;
alter table ignite_leads add column if not exists probe_token  text;
create index if not exists idx_ignite_leads_synthetic on ignite_leads(location_id, is_synthetic);

-- 2. Richer per-run detail on the existing snapshot table (one row per run).
alter table ignite_health add column if not exists bridge_ms          integer;     -- dry-run parse+route latency
alter table ignite_health add column if not exists resend_ms          integer;     -- Resend API reachability latency
alter table ignite_health add column if not exists db_ok              boolean;     -- Postgres reachable
alter table ignite_health add column if not exists db_ms              integer;     -- Postgres round-trip latency
alter table ignite_health add column if not exists roundtrip_ok       boolean;     -- synthetic email landed in ignite_leads
alter table ignite_health add column if not exists roundtrip_ms       integer;     -- send → insert latency
alter table ignite_health add column if not exists probe_sent_at      timestamptz; -- t0
alter table ignite_health add column if not exists probe_received_at  timestamptz; -- t1 (webhook entry)
alter table ignite_health add column if not exists probe_inserted_at  timestamptz; -- t2 (after DB insert)
alter table ignite_health add column if not exists next_run_at        timestamptz; -- when the next 15-min run is due

-- 3. In-flight synthetic probes (the canary). The health-check inserts a
--    'pending' row when it sends; the webhook stamps received/inserted when the
--    tagged email lands; the next run reads it to compute round-trip latency.
create table if not exists ignite_health_probe (
  id           uuid primary key default gen_random_uuid(),
  location_id  uuid not null,
  token        text not null unique,
  slug         text,
  sent_at      timestamptz not null default now(),
  received_at  timestamptz,
  inserted_at  timestamptz,
  lead_id      uuid,
  latency_ms   integer,
  status       text not null default 'pending'  -- pending | landed | timeout
);
create index if not exists idx_ignite_health_probe_token on ignite_health_probe(token);
create index if not exists idx_ignite_health_probe_loc   on ignite_health_probe(location_id, sent_at desc);

alter table ignite_health_probe enable row level security;
do $$ begin
  create policy "Allow all for authenticated" on ignite_health_probe
    for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

-- 4. Stream health snapshots to the CRM badge live (no refresh).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ignite_health'
  ) then
    alter publication supabase_realtime add table ignite_health;
  end if;
end $$;

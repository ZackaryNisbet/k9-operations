-- ============================================================================
-- ignite_inbound_seen — dedup ledger for the one-time inbound backfill, so a
-- received email is replayed through the webhook at most once even if the
-- catch-up pass is run more than once. The live webhook stays the instant path;
-- this is only for recovering mail that arrived while it was disabled.
-- ============================================================================
create table if not exists ignite_inbound_seen (
  email_id     text primary key,
  result       text,
  processed_at timestamptz not null default now()
);

alter table ignite_inbound_seen enable row level security;
do $$ begin
  create policy "Allow all for authenticated" on ignite_inbound_seen
    for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

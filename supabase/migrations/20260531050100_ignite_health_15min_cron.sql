-- ============================================================================
-- Reschedule the Ignite pipeline health check from hourly → every 15 minutes,
-- so a silent break is caught within one interval and the synthetic round-trip
-- runs often enough to be meaningful. Idempotent: re-running upserts the job.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Drop the old hourly job (named in the prior migration); ignore if absent.
do $$ begin
  perform cron.unschedule('ignite-health-hourly');
exception when others then null; end $$;

select cron.schedule(
  'ignite-health-15min',
  '*/15 * * * *',
  $$
    select net.http_post(
      url := 'https://YOUR_SUPABASE_PROJECT_REF.supabase.co/functions/v1/ignite-health-check',
      headers := jsonb_build_object('Content-Type', 'application/json')
    );
  $$
);

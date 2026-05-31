-- ============================================================================
-- Schedule the pipeline health check at the top of every hour. pg_cron invokes
-- the ignite-health-check edge function via pg_net; the function validates each
-- active location (dry-run + Resend + freshness) and records an ignite_health
-- snapshot. cron.schedule() upserts by job name, so this is safe to re-run.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'ignite-health-hourly',
  '0 * * * *',
  $$
    select net.http_post(
      url := 'https://xuzvqcpthqikyroqhypw.supabase.co/functions/v1/ignite-health-check',
      headers := jsonb_build_object('Content-Type', 'application/json')
    );
  $$
);

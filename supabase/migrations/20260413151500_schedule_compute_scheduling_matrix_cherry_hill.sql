do $$
declare
  existing_job_id bigint;
  cron_command text := $cmd$
    select net.http_post(
      url := 'https://xuzvqcpthqikyroqhypw.supabase.co/functions/v1/compute-scheduling-matrix',
      body := jsonb_build_object(
        'location_id', '8ea382b0-63f7-44ac-b6f8-83243c03d946',
        'date_from', (now() at time zone 'America/New_York')::date::text,
        'date_to', (((now() at time zone 'America/New_York')::date) + 6)::text
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
      )
    );
  $cmd$;
begin
  select jobid
  into existing_job_id
  from cron.job
  where jobname = 'compute-scheduling-matrix-cherry-hill';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'compute-scheduling-matrix-cherry-hill',
    '*/5 * * * *',
    cron_command
  );
end $$;

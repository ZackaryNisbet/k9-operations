do $$
declare
  job_name text;
  day_offset integer;
  cron_sql text;
  cron_expression text;
begin
  foreach job_name in array array[
    'compute-scheduling-matrix-cherry-hill',
    'compute-scheduling-matrix-cherry-hill-week-1',
    'compute-scheduling-matrix-cherry-hill-week-2',
    'compute-scheduling-matrix-cherry-hill-week-3',
    'compute-scheduling-matrix-cherry-hill-week-4'
  ]
  loop
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = job_name;
  end loop;

  for day_offset in 7..27 loop
    job_name := format('compute-scheduling-matrix-cherry-hill-day-%s', day_offset);

    perform cron.unschedule(jobid)
    from cron.job
    where jobname = job_name;

    cron_expression := format('%s * * * *', day_offset - 7);
    cron_sql := format(
      $cmd$
        select net.http_post(
          url := 'https://xuzvqcpthqikyroqhypw.supabase.co/functions/v1/compute-scheduling-matrix',
          body := jsonb_build_object(
            'location_id', '8ea382b0-63f7-44ac-b6f8-83243c03d946',
            'date_from', (((now() at time zone 'America/New_York')::date) + %1$s)::text,
            'date_to', (((now() at time zone 'America/New_York')::date) + %1$s)::text
          ),
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
            'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
          ),
          timeout_milliseconds := 120000
        );
      $cmd$,
      day_offset
    );

    perform cron.schedule(job_name, cron_expression, cron_sql);
  end loop;
end $$;

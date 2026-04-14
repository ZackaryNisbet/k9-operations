do $$
declare
  auth_headers text := $headers$
    jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    )
  $headers$;
  job_name text;
  day_offset integer;
  cron_sql text;
begin
  foreach job_name in array array[
    'gingr-boh-poll-a',
    'gingr-today-sync',
    'gingr-incremental-sync',
    'gingr-tv-poll',
    'de-expansion-daily',
    'ops-compute-poll',
    'compute-scheduling-matrix-cherry-hill',
    'compute-scheduling-matrix-cherry-hill-current-week',
    'compute-scheduling-matrix-cherry-hill-next-week',
    'compute-scheduling-matrix-cherry-hill-two-weeks',
    'compute-scheduling-matrix-cherry-hill-three-weeks',
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
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = format('compute-scheduling-matrix-cherry-hill-day-%s', day_offset);
  end loop;

  perform cron.schedule(
    'gingr-boh-poll-a',
    '* * * * *',
    format(
      $cmd$
        select net.http_post(
          url := 'https://xuzvqcpthqikyroqhypw.supabase.co/functions/v1/gingr-boh-poll',
          headers := %1$s,
          body := %2$L::jsonb,
          timeout_milliseconds := 120000
        );
      $cmd$,
      auth_headers,
      '{ "location_id": "8ea382b0-63f7-44ac-b6f8-83243c03d946" }'
    )
  );

  perform cron.schedule(
    'gingr-today-sync',
    '*/5 * * * *',
    format(
      $cmd$
        select net.http_post(
          url := 'https://xuzvqcpthqikyroqhypw.supabase.co/functions/v1/gingr-sync',
          headers := %1$s,
          body := %2$L::jsonb,
          timeout_milliseconds := 120000
        );
      $cmd$,
      auth_headers,
      '{ "sync_type": "today-sync", "location_id": "8ea382b0-63f7-44ac-b6f8-83243c03d946" }'
    )
  );

  perform cron.schedule(
    'gingr-incremental-sync',
    '*/15 * * * *',
    format(
      $cmd$
        select net.http_post(
          url := 'https://xuzvqcpthqikyroqhypw.supabase.co/functions/v1/gingr-sync',
          headers := %1$s,
          body := %2$L::jsonb,
          timeout_milliseconds := 120000
        );
      $cmd$,
      auth_headers,
      '{ "sync_type": "incremental", "location_id": "8ea382b0-63f7-44ac-b6f8-83243c03d946" }'
    )
  );

  perform cron.schedule(
    'gingr-tv-poll',
    '* * * * *',
    format(
      $cmd$
        select net.http_post(
          url := 'https://xuzvqcpthqikyroqhypw.supabase.co/functions/v1/gingr-sync',
          headers := %1$s,
          body := %2$L::jsonb,
          timeout_milliseconds := 120000
        );
      $cmd$,
      auth_headers,
      '{ "sync_type": "tv-poll", "location_id": "8ea382b0-63f7-44ac-b6f8-83243c03d946" }'
    )
  );

  perform cron.schedule(
    'de-expansion-daily',
    '0 7 * * *',
    format(
      $cmd$
        select net.http_post(
          url := 'https://xuzvqcpthqikyroqhypw.supabase.co/functions/v1/gingr-sync',
          headers := %1$s,
          body := %2$L::jsonb,
          timeout_milliseconds := 120000
        );
      $cmd$,
      auth_headers,
      '{ "sync_type": "de-expansion", "location_id": "k9cherryhill" }'
    )
  );

  perform cron.schedule(
    'ops-compute-poll',
    '* * * * *',
    format(
      $cmd$
        select net.http_post(
          url := 'https://xuzvqcpthqikyroqhypw.supabase.co/functions/v1/ops-compute',
          headers := %1$s,
          body := %2$L::jsonb,
          timeout_milliseconds := 120000
        );
      $cmd$,
      auth_headers,
      '{ "location_id": "8ea382b0-63f7-44ac-b6f8-83243c03d946" }'
    )
  );

  perform cron.schedule(
    'compute-scheduling-matrix-cherry-hill-current-week',
    '*/5 * * * *',
    format(
      $cmd$
        select net.http_post(
          url := 'https://xuzvqcpthqikyroqhypw.supabase.co/functions/v1/compute-scheduling-matrix',
          headers := %1$s,
          body := jsonb_build_object(
            'location_id', '8ea382b0-63f7-44ac-b6f8-83243c03d946',
            'date_from', (now() at time zone 'America/New_York')::date::text,
            'date_to', (((now() at time zone 'America/New_York')::date) + 6)::text
          ),
          timeout_milliseconds := 120000
        );
      $cmd$,
      auth_headers
    )
  );

  for day_offset in 7..27 loop
    cron_sql := format(
      $cmd$
        select net.http_post(
          url := 'https://xuzvqcpthqikyroqhypw.supabase.co/functions/v1/compute-scheduling-matrix',
          headers := %1$s,
          body := jsonb_build_object(
            'location_id', '8ea382b0-63f7-44ac-b6f8-83243c03d946',
            'date_from', (((now() at time zone 'America/New_York')::date) + %2$s)::text,
            'date_to', (((now() at time zone 'America/New_York')::date) + %2$s)::text
          ),
          timeout_milliseconds := 120000
        );
      $cmd$,
      auth_headers,
      day_offset
    );

    perform cron.schedule(
      format('compute-scheduling-matrix-cherry-hill-day-%s', day_offset),
      format('%s * * * *', day_offset - 7),
      cron_sql
    );
  end loop;
end $$;

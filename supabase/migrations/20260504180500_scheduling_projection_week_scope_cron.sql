do $$
declare
  auth_headers jsonb := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
    'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
  );
  day_offset integer;
  backfill_date date;
  cron_sql text;
begin
  for day_offset in 7..27 loop
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = format('compute-scheduling-matrix-cherry-hill-day-%s', day_offset);

    cron_sql := format(
      $cmd$
        select net.http_post(
          url := 'https://YOUR_SUPABASE_PROJECT_REF.supabase.co/functions/v1/compute-scheduling-matrix',
          headers := %1$s,
          body := jsonb_build_object(
            'location_id', '11111111-1111-1111-1111-111111111111',
            'date_from', (((now() at time zone 'America/New_York')::date) + %2$s)::text,
            'date_to', (((now() at time zone 'America/New_York')::date) + %2$s)::text,
            'projection_scope_date_from', date_trunc('week', (((now() at time zone 'America/New_York')::date) + %2$s)::timestamp)::date::text,
            'projection_scope_date_to', (date_trunc('week', (((now() at time zone 'America/New_York')::date) + %2$s)::timestamp)::date + 6)::text
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

  for backfill_date in
    select generate_series('2026-05-11'::date, '2026-05-17'::date, interval '1 day')::date
  loop
    perform net.http_post(
      url := 'https://YOUR_SUPABASE_PROJECT_REF.supabase.co/functions/v1/compute-scheduling-matrix',
      headers := auth_headers,
      body := jsonb_build_object(
        'location_id', '11111111-1111-1111-1111-111111111111',
        'date_from', backfill_date::text,
        'date_to', backfill_date::text,
        'projection_scope_date_from', '2026-05-11',
        'projection_scope_date_to', '2026-05-17'
      ),
      timeout_milliseconds := 120000
    );
  end loop;
end $$;

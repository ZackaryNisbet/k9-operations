do $$
declare
  legacy_job_id bigint;
  existing_job_id bigint;
  current_week_command text := $cmd$
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
  next_week_command text := $cmd$
    select net.http_post(
      url := 'https://xuzvqcpthqikyroqhypw.supabase.co/functions/v1/compute-scheduling-matrix',
      body := jsonb_build_object(
        'location_id', '8ea382b0-63f7-44ac-b6f8-83243c03d946',
        'date_from', (((now() at time zone 'America/New_York')::date) + 7)::text,
        'date_to', (((now() at time zone 'America/New_York')::date) + 13)::text
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
      )
    );
  $cmd$;
  two_weeks_command text := $cmd$
    select net.http_post(
      url := 'https://xuzvqcpthqikyroqhypw.supabase.co/functions/v1/compute-scheduling-matrix',
      body := jsonb_build_object(
        'location_id', '8ea382b0-63f7-44ac-b6f8-83243c03d946',
        'date_from', (((now() at time zone 'America/New_York')::date) + 14)::text,
        'date_to', (((now() at time zone 'America/New_York')::date) + 20)::text
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
      )
    );
  $cmd$;
  three_weeks_command text := $cmd$
    select net.http_post(
      url := 'https://xuzvqcpthqikyroqhypw.supabase.co/functions/v1/compute-scheduling-matrix',
      body := jsonb_build_object(
        'location_id', '8ea382b0-63f7-44ac-b6f8-83243c03d946',
        'date_from', (((now() at time zone 'America/New_York')::date) + 21)::text,
        'date_to', (((now() at time zone 'America/New_York')::date) + 27)::text
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
      )
    );
  $cmd$;
begin
  select jobid into legacy_job_id
  from cron.job
  where jobname = 'compute-scheduling-matrix-cherry-hill';

  if legacy_job_id is not null then
    perform cron.unschedule(legacy_job_id);
  end if;

  select jobid into existing_job_id
  from cron.job
  where jobname = 'compute-scheduling-matrix-cherry-hill-current-week';
  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  select jobid into existing_job_id
  from cron.job
  where jobname = 'compute-scheduling-matrix-cherry-hill-next-week';
  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  select jobid into existing_job_id
  from cron.job
  where jobname = 'compute-scheduling-matrix-cherry-hill-two-weeks';
  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  select jobid into existing_job_id
  from cron.job
  where jobname = 'compute-scheduling-matrix-cherry-hill-three-weeks';
  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'compute-scheduling-matrix-cherry-hill-current-week',
    '*/5 * * * *',
    current_week_command
  );

  perform cron.schedule(
    'compute-scheduling-matrix-cherry-hill-next-week',
    '1,16,31,46 * * * *',
    next_week_command
  );

  perform cron.schedule(
    'compute-scheduling-matrix-cherry-hill-two-weeks',
    '3,33 * * * *',
    two_weeks_command
  );

  perform cron.schedule(
    'compute-scheduling-matrix-cherry-hill-three-weeks',
    '7 * * * *',
    three_weeks_command
  );
end $$;

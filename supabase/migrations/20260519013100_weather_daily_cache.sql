-- Weather cache and location settings for OpenWeather One Call 3.0.
-- Daily rows are the canonical scheduling/export surface; raw provider payloads in
-- details_json keep hourly/minutely/alerts available for dashboard graphing.

CREATE TABLE IF NOT EXISTS public.weather_location_settings (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  location_id text NOT NULL,
  display_name text NOT NULL,
  latitude numeric(9, 6) NOT NULL CHECK (latitude >= -90 AND latitude <= 90),
  longitude numeric(9, 6) NOT NULL CHECK (longitude >= -180 AND longitude <= 180),
  timezone_id text NOT NULL DEFAULT 'America/New_York',
  provider text NOT NULL DEFAULT 'openweather',
  enabled boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT weather_location_settings_location_uidx UNIQUE (location_id)
);

CREATE TABLE IF NOT EXISTS public.weather_daily_cache (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  location_id text NOT NULL,
  weather_date date NOT NULL,
  provider text NOT NULL DEFAULT 'openweather',
  source_kind text NOT NULL DEFAULT 'daily_forecast'
    CHECK (source_kind IN (
      'current_conditions',
      'daily_forecast',
      'historical_observation',
      'historical_forecast',
      'statistical_forecast',
      'reanalysis',
      'cached',
      'unavailable'
    )),
  status text NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'unavailable', 'error')),
  summary text,
  condition_type text,
  icon_base_uri text,
  timezone_id text,
  high_temp_f numeric(6, 2),
  low_temp_f numeric(6, 2),
  current_temp_f numeric(6, 2),
  feels_like_temp_f numeric(6, 2),
  humidity_pct numeric(6, 2),
  uv_index numeric(6, 2),
  precipitation_probability_pct numeric(6, 2),
  precipitation_quantity_in numeric(8, 3),
  precipitation_type text,
  thunderstorm_probability_pct numeric(6, 2),
  wind_speed_mph numeric(8, 2),
  wind_gust_mph numeric(8, 2),
  wind_direction text,
  cloud_cover_pct numeric(6, 2),
  visibility_miles numeric(8, 2),
  pressure_millibars numeric(8, 2),
  sunrise_time timestamptz,
  sunset_time timestamptz,
  moonrise_time timestamptz,
  moonset_time timestamptz,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  details_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT weather_daily_cache_location_date_provider_uidx
    UNIQUE (location_id, weather_date, provider)
);

CREATE INDEX IF NOT EXISTS weather_daily_cache_location_date_idx
  ON public.weather_daily_cache (location_id, weather_date);

CREATE INDEX IF NOT EXISTS weather_daily_cache_expires_idx
  ON public.weather_daily_cache (expires_at)
  WHERE expires_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.update_weather_daily_cache_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_weather_location_settings_updated_at ON public.weather_location_settings;
CREATE TRIGGER trg_weather_location_settings_updated_at
  BEFORE UPDATE ON public.weather_location_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_weather_daily_cache_updated_at();

DROP TRIGGER IF EXISTS trg_weather_daily_cache_updated_at ON public.weather_daily_cache;
CREATE TRIGGER trg_weather_daily_cache_updated_at
  BEFORE UPDATE ON public.weather_daily_cache
  FOR EACH ROW EXECUTE FUNCTION public.update_weather_daily_cache_updated_at();

ALTER TABLE public.weather_location_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weather_daily_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS weather_location_settings_select ON public.weather_location_settings;
CREATE POLICY weather_location_settings_select ON public.weather_location_settings
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1
      FROM public.lite_profiles lp
      WHERE lp.user_id = (select auth.uid())
        AND lp.is_active = true
        AND (
          lp.role::text IN ('owner', 'enterprise_admin', 'developer', 'multi_location_admin')
          OR lp.location_id = weather_location_settings.location_id
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (select auth.uid())
        AND p.role IN ('owner', 'role_owner')
    )
  );

DROP POLICY IF EXISTS weather_location_settings_manage ON public.weather_location_settings;
CREATE POLICY weather_location_settings_manage ON public.weather_location_settings
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.lite_profiles lp
      WHERE lp.user_id = (select auth.uid())
        AND lp.is_active = true
        AND lp.role::text IN ('owner', 'location_admin', 'enterprise_admin', 'developer', 'multi_location_admin')
        AND (
          lp.role::text IN ('owner', 'enterprise_admin', 'developer', 'multi_location_admin')
          OR lp.location_id = weather_location_settings.location_id
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (select auth.uid())
        AND p.role IN ('owner', 'role_owner')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.lite_profiles lp
      WHERE lp.user_id = (select auth.uid())
        AND lp.is_active = true
        AND lp.role::text IN ('owner', 'location_admin', 'enterprise_admin', 'developer', 'multi_location_admin')
        AND (
          lp.role::text IN ('owner', 'enterprise_admin', 'developer', 'multi_location_admin')
          OR lp.location_id = weather_location_settings.location_id
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (select auth.uid())
        AND p.role IN ('owner', 'role_owner')
    )
  );

DROP POLICY IF EXISTS weather_daily_cache_select ON public.weather_daily_cache;
CREATE POLICY weather_daily_cache_select ON public.weather_daily_cache
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1
      FROM public.lite_profiles lp
      WHERE lp.user_id = (select auth.uid())
        AND lp.is_active = true
        AND (
          lp.role::text IN ('owner', 'enterprise_admin', 'developer', 'multi_location_admin')
          OR lp.location_id = weather_daily_cache.location_id
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (select auth.uid())
        AND p.role IN ('owner', 'role_owner')
    )
  );

INSERT INTO public.weather_location_settings (
  location_id,
  display_name,
  latitude,
  longitude,
  timezone_id,
  provider,
  metadata
) VALUES
  (
    '8ea382b0-63f7-44ac-b6f8-83243c03d946',
    'Cherry Hill',
    39.903360,
    -74.975440,
    'America/New_York',
    'openweather',
    '{"address":"1149 Marlkress Rd, Cherry Hill, NJ 08003","seed_source":"public_address_lookup"}'::jsonb
  ),
  (
    'cherry-hill',
    'Cherry Hill',
    39.903360,
    -74.975440,
    'America/New_York',
    'openweather',
    '{"address":"1149 Marlkress Rd, Cherry Hill, NJ 08003","seed_source":"public_address_lookup","alias_for":"8ea382b0-63f7-44ac-b6f8-83243c03d946"}'::jsonb
  ),
  (
    'demo',
    'Cherry Hill',
    39.903360,
    -74.975440,
    'America/New_York',
    'openweather',
    '{"address":"1149 Marlkress Rd, Cherry Hill, NJ 08003","seed_source":"public_address_lookup"}'::jsonb
  )
ON CONFLICT (location_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude,
  timezone_id = EXCLUDED.timezone_id,
  provider = EXCLUDED.provider,
  metadata = public.weather_location_settings.metadata || EXCLUDED.metadata,
  updated_at = now();

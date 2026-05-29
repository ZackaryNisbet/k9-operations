-- Active-dog denominators for the Incidents incident-rate metric.
--
-- The browser only holds a recent slice of reservations, so client-side
-- "active dogs in period" is wrong for historical windows (YTD/TTM/Last Full
-- Year/All Time). This function computes the population at risk — unique dogs
-- with a countable stay overlapping each standard reporting window — over the
-- full gingr_reservations table, server-side.
--
-- A dog is "active" in a window if a non-cancelled, non-tour, non-grooming
-- reservation overlaps it (start <= window_end AND end >= window_start), using
-- the resort's local calendar (America/New_York). Windows mirror the JS in
-- clientManagementData.js (getIncidentReportingPeriodRange).
--
-- SECURITY INVOKER (default): the caller can already read these reservations,
-- so existing RLS governs access.

CREATE OR REPLACE FUNCTION public.incident_active_dog_counts(
  p_location_id uuid,
  p_as_of date DEFAULT CURRENT_DATE
)
RETURNS TABLE (period_id text, active_dogs bigint)
LANGUAGE sql
STABLE
AS $$
  WITH bounds AS (
    SELECT
      date_trunc('month', p_as_of::timestamp)::date AS mtd_start,
      date_trunc('quarter', p_as_of::timestamp)::date AS qtd_start,
      date_trunc('year', p_as_of::timestamp)::date AS ytd_start,
      (p_as_of - INTERVAL '1 year')::date AS ttm_start,
      (date_trunc('year', p_as_of::timestamp)::date - INTERVAL '1 year')::date AS ly_start,
      (date_trunc('year', p_as_of::timestamp)::date - INTERVAL '1 day')::date AS ly_end,
      p_as_of AS today
  ),
  r AS (
    SELECT
      animal_gingr_id,
      (start_date AT TIME ZONE 'America/New_York')::date AS s,
      COALESCE((end_date AT TIME ZONE 'America/New_York')::date,
               (start_date AT TIME ZONE 'America/New_York')::date) AS e
    FROM public.gingr_reservations
    WHERE location_id = p_location_id::text
      AND cancelled_date IS NULL
      AND COALESCE(animal_gingr_id, '') <> ''
      AND reservation_type_name IS NOT NULL
      AND reservation_type_name NOT ILIKE '%tour%'
      AND reservation_type_name NOT ILIKE '%groom%'
  )
  SELECT 'mtd', count(DISTINCT animal_gingr_id) FROM r, bounds WHERE s <= today AND e >= mtd_start
  UNION ALL
  SELECT 'qtd', count(DISTINCT animal_gingr_id) FROM r, bounds WHERE s <= today AND e >= qtd_start
  UNION ALL
  SELECT 'ytd', count(DISTINCT animal_gingr_id) FROM r, bounds WHERE s <= today AND e >= ytd_start
  UNION ALL
  SELECT 'ttm', count(DISTINCT animal_gingr_id) FROM r, bounds WHERE s <= today AND e >= ttm_start
  UNION ALL
  SELECT 'last_year', count(DISTINCT animal_gingr_id) FROM r, bounds WHERE s <= ly_end AND e >= ly_start
  UNION ALL
  SELECT 'all', count(DISTINCT animal_gingr_id) FROM r;
$$;

GRANT EXECUTE ON FUNCTION public.incident_active_dog_counts(uuid, date) TO authenticated;

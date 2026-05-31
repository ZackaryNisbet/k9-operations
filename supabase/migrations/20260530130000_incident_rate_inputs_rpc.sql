-- Incident-rate inputs: dog VOLUME as the denominator (plus unique dogs).
--
-- The previous incident_active_dog_counts RPC used unique dogs (COUNT DISTINCT
-- animal_gingr_id) as the denominator, which badly understates exposure: a month
-- read as ~600 when the resort sees that many dogs in a week. The operationally
-- correct denominator is dog VOLUME, the per-day reservation counts that the
-- Scheduling demand matrix already treats as the count authority
-- (gingr_reservation_widget_daily.total_reservation_volume), summed over the
-- window. We also return unique_dogs (distinct animals with a countable stay
-- overlapping the window) as a secondary figure, and covered_from (the earliest
-- day with volume data inside the window) so the UI can flag a partial window
-- when widget coverage does not reach the window start.
--
-- Windows mirror getIncidentReportingPeriodRange in clientManagementData.js and
-- the bounds of incident_active_dog_counts. SECURITY INVOKER (default): the
-- caller's RLS on both source tables governs access.
--
-- Non-destructive: CREATE OR REPLACE FUNCTION only; the old RPC is left in place.

CREATE OR REPLACE FUNCTION public.incident_rate_inputs(
  p_location_id uuid,
  p_as_of date DEFAULT CURRENT_DATE
)
RETURNS TABLE (period_id text, dog_volume bigint, unique_dogs bigint, covered_from date)
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
  vol AS ( -- daily dog volume = Scheduling's reservation-count authority
    SELECT widget_date AS d, total_reservation_volume AS v
    FROM public.gingr_reservation_widget_daily
    WHERE location_id = p_location_id::text
  ),
  res AS ( -- countable reservations for the unique-dog figure (population at risk)
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
  SELECT 'mtd',
    (SELECT COALESCE(SUM(v),0) FROM vol, bounds WHERE d >= mtd_start AND d <= today),
    (SELECT COUNT(DISTINCT animal_gingr_id) FROM res, bounds WHERE s <= today AND e >= mtd_start),
    (SELECT MIN(d) FROM vol, bounds WHERE d >= mtd_start AND d <= today)
  UNION ALL
  SELECT 'qtd',
    (SELECT COALESCE(SUM(v),0) FROM vol, bounds WHERE d >= qtd_start AND d <= today),
    (SELECT COUNT(DISTINCT animal_gingr_id) FROM res, bounds WHERE s <= today AND e >= qtd_start),
    (SELECT MIN(d) FROM vol, bounds WHERE d >= qtd_start AND d <= today)
  UNION ALL
  SELECT 'ytd',
    (SELECT COALESCE(SUM(v),0) FROM vol, bounds WHERE d >= ytd_start AND d <= today),
    (SELECT COUNT(DISTINCT animal_gingr_id) FROM res, bounds WHERE s <= today AND e >= ytd_start),
    (SELECT MIN(d) FROM vol, bounds WHERE d >= ytd_start AND d <= today)
  UNION ALL
  SELECT 'ttm',
    (SELECT COALESCE(SUM(v),0) FROM vol, bounds WHERE d >= ttm_start AND d <= today),
    (SELECT COUNT(DISTINCT animal_gingr_id) FROM res, bounds WHERE s <= today AND e >= ttm_start),
    (SELECT MIN(d) FROM vol, bounds WHERE d >= ttm_start AND d <= today)
  UNION ALL
  SELECT 'last_year',
    (SELECT COALESCE(SUM(v),0) FROM vol, bounds WHERE d >= ly_start AND d <= ly_end),
    (SELECT COUNT(DISTINCT animal_gingr_id) FROM res, bounds WHERE s <= ly_end AND e >= ly_start),
    (SELECT MIN(d) FROM vol, bounds WHERE d >= ly_start AND d <= ly_end)
  UNION ALL
  SELECT 'all',
    (SELECT COALESCE(SUM(v),0) FROM vol, bounds WHERE d <= today),
    (SELECT COUNT(DISTINCT animal_gingr_id) FROM res),
    (SELECT MIN(d) FROM vol, bounds WHERE d <= today);
$$;

GRANT EXECUTE ON FUNCTION public.incident_rate_inputs(uuid, date) TO authenticated;

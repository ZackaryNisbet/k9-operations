-- Backfill retention follow-up dates for clients who are in the retention stage
-- Follow-up date = last_res_date + applicable threshold (90 days daycare, 180 days boarding-heavy)
-- A client is "boarding-heavy" if boarding_count > 50% of total_res

WITH retention_clients AS (
  SELECT
    s.owner_gingr_id,
    s.last_res_date,
    s.total_res,
    s.boarding_count,
    s.daycare_count,
    CASE
      WHEN s.total_res > 0 AND (s.boarding_count::float / s.total_res) > 0.5
        THEN s.last_res_date::date + INTERVAL '180 days'
      ELSE s.last_res_date::date + INTERVAL '90 days'
    END AS lapse_date
  FROM get_client_stats('spurling-lake-elsinore') s
  WHERE s.last_res_date IS NOT NULL
    AND s.has_upcoming = false
    AND s.total_res > 0
)
UPDATE lite_client_lifecycle lc
SET lifecycle_data = jsonb_set(
  lc.lifecycle_data,
  '{retention,followUpDate}',
  to_jsonb(to_char(rc.lapse_date, 'YYYY-MM-DD'))
),
updated_at = NOW()
FROM retention_clients rc
WHERE lc.location_id = 'spurling-lake-elsinore'
  AND lc.gingr_id = rc.owner_gingr_id
  AND (
    lc.lifecycle_data->'retention'->>'followUpDate' IS NULL
    OR lc.lifecycle_data->'retention'->>'followUpDate' = ''
  );

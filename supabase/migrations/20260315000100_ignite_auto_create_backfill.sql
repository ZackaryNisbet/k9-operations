-- ============================================================================
-- Ignite Auto-Create Backfill
-- Creates lite_client records for existing unmatched ignite_leads
-- that don't already have a corresponding lite_client
-- ============================================================================

INSERT INTO lite_clients (
  location_id,
  first_name,
  last_name,
  phone,
  email,
  source,
  source_date,
  ignite_lead_id,
  notes,
  lifecycle_data
)
SELECT
  il.location_id::text,
  il.first_name,
  il.last_name,
  il.phone,
  il.email,
  'ignite',
  COALESCE(il.processed_at, il.created_at),
  il.id,
  'Ignite ' || CASE WHEN il.lead_type = 'phone_call' THEN 'phone call' ELSE 'web form' END || ' lead — backfilled',
  jsonb_build_object(
    'conversion', jsonb_build_object(
      'notes', '',
      'followUpDate', to_char(COALESCE(il.processed_at, il.created_at) + interval '1 day', 'YYYY-MM-DD'),
      'updates', '[]'::jsonb,
      'source', 'ignite',
      'sourceDate', COALESCE(il.processed_at, il.created_at)::text,
      'sourceReservationId', ''
    ),
    'retention', jsonb_build_object(
      'notes', '',
      'followUpDate', '',
      'updates', '[]'::jsonb
    ),
    'cold', false,
    'coldDate', '',
    'coldFrom', ''
  )
FROM ignite_leads il
WHERE il.match_status = 'no_match'
  AND NOT EXISTS (
    SELECT 1 FROM lite_clients lc WHERE lc.ignite_lead_id = il.id
  );

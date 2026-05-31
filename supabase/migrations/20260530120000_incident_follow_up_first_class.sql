-- Incidents redesign, slice 1: promote follow-ups to first-class columns.
--
-- Today an incident has no real follow-up concept. The "New Incident" flow only
-- writes metadata.source/metadata.document, and any follow-up intent that ever
-- landed did so inside the metadata jsonb blob, where it can't be indexed,
-- filtered, or shown as an overdue badge. This migration makes the follow-up a
-- first-class, queryable part of the case so the UI can drive a real
-- "needs follow-up / overdue" workflow.
--
-- NON-DESTRUCTIVE: only adds nullable columns + one partial index, and copies
-- any legacy follow-up date out of metadata into the new column WITHOUT removing
-- it from metadata. No data is dropped or rewritten destructively. Existing rows
-- (which have no follow-up today) simply get NULLs and are unaffected.
--
-- RLS: client_incident_cases already has management-scoped RLS + grants; new
-- columns inherit them, so no policy/grant changes are needed.

BEGIN;

ALTER TABLE public.client_incident_cases
  ADD COLUMN IF NOT EXISTS follow_up_at date,
  ADD COLUMN IF NOT EXISTS follow_up_note text,
  ADD COLUMN IF NOT EXISTS follow_up_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS follow_up_completed_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS follow_up_completed_by_name text;

COMMENT ON COLUMN public.client_incident_cases.follow_up_at IS
  'Date a follow-up action is due for this incident (e.g. vet recheck, owner callback). NULL = no follow-up scheduled.';
COMMENT ON COLUMN public.client_incident_cases.follow_up_completed_at IS
  'When the scheduled follow-up was marked done. NULL while still open/overdue.';

-- Carry any follow-up date that historical rows stashed in metadata into the
-- first-class column. Tolerant of either legacy key; leaves metadata untouched.
-- Only well-formed ISO dates (YYYY-MM-DD) are copied, so a malformed legacy
-- value can never abort the migration on the ::date cast.
UPDATE public.client_incident_cases
SET follow_up_at = COALESCE(
      NULLIF(metadata->>'follow_up_at', ''),
      NULLIF(metadata->>'follow_up_date', '')
    )::date
WHERE follow_up_at IS NULL
  AND COALESCE(
        NULLIF(metadata->>'follow_up_at', ''),
        NULLIF(metadata->>'follow_up_date', '')
      ) ~ '^\d{4}-\d{2}-\d{2}$';

-- Partial index for the hot path: open (uncompleted) follow-ups for a location,
-- ordered by due date. Keeps the "needs follow-up / overdue" query cheap.
CREATE INDEX IF NOT EXISTS client_incident_cases_follow_up_idx
  ON public.client_incident_cases (location_id, follow_up_at)
  WHERE follow_up_at IS NOT NULL AND follow_up_completed_at IS NULL;

COMMIT;

-- Align live operational detail tables with the DE-004 canonical parser shape.
-- The incremental GINGR sync inserts these columns from
-- supabase/functions/_shared/gingr-operational-details.ts.

ALTER TABLE public.gingr_feeding_schedules
  ADD COLUMN IF NOT EXISTS gingr_id text,
  ADD COLUMN IF NOT EXISTS amount text,
  ADD COLUMN IF NOT EXISTS frequency text,
  ADD COLUMN IF NOT EXISTS schedule_time text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.gingr_medications
  ADD COLUMN IF NOT EXISTS gingr_id text,
  ADD COLUMN IF NOT EXISTS administration_route text,
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_date date,
  ADD COLUMN IF NOT EXISTS prescribed_by text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Backfill canonical aliases from older placeholder columns where possible.
UPDATE public.gingr_feeding_schedules
SET
  amount = COALESCE(amount, feeding_amount),
  frequency = COALESCE(frequency, feeding_frequency)
WHERE amount IS NULL
   OR frequency IS NULL;

UPDATE public.gingr_medications
SET administration_route = COALESCE(administration_route, time_of_day)
WHERE administration_route IS NULL;

-- The synthetic IDs are deterministic per sync row. Keep uniqueness where the
-- sync supplies them, without blocking legacy rows that still have null IDs.
CREATE UNIQUE INDEX IF NOT EXISTS idx_gingr_feeding_schedules_location_gingr_id
  ON public.gingr_feeding_schedules(location_id, gingr_id)
  WHERE gingr_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_gingr_medications_location_gingr_id
  ON public.gingr_medications(location_id, gingr_id)
  WHERE gingr_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gingr_feeding_schedules_active
  ON public.gingr_feeding_schedules(location_id, is_active);

CREATE INDEX IF NOT EXISTS idx_gingr_medications_active
  ON public.gingr_medications(location_id, is_active);

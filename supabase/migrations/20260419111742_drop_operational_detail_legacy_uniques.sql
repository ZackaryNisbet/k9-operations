-- The operational detail sync emits one row per feeding/medication schedule.
-- Older placeholder constraints allowed only one row per animal, which blocks
-- real multi-time feeding and medication instructions.

ALTER TABLE public.gingr_feeding_schedules
  DROP CONSTRAINT IF EXISTS gingr_feeding_schedules_location_id_animal_gingr_id_key;

ALTER TABLE public.gingr_medications
  DROP CONSTRAINT IF EXISTS gingr_medications_location_id_animal_gingr_id_medication_na_key;

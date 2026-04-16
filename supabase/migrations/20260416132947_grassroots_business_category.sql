BEGIN;

ALTER TABLE public.grassroots_targets
  ADD COLUMN IF NOT EXISTS business_category text;

UPDATE public.grassroots_targets
SET business_category = drop_category
WHERE business_category IS NULL
  AND drop_category IS NOT NULL
  AND category IN ('drops', 'pet_professional_partnerships');

CREATE INDEX IF NOT EXISTS grassroots_targets_business_category_idx
  ON public.grassroots_targets (location_id, category, business_category)
  WHERE category IN ('drops', 'pet_professional_partnerships')
    AND business_category IS NOT NULL;

COMMIT;

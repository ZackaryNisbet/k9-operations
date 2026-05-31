-- Add two new grassroots/marketing categories: Local Business Partnerships and
-- Schools. The category column has a CHECK constraint enumerating the allowed
-- values, so new categories require widening it. Backward-compatible: existing rows
-- and the five existing categories are untouched.
ALTER TABLE public.grassroots_targets
  DROP CONSTRAINT IF EXISTS grassroots_targets_category_check;

ALTER TABLE public.grassroots_targets
  ADD CONSTRAINT grassroots_targets_category_check
  CHECK (category IN (
    'events',
    'drops',
    'corporate_partnerships',
    'apartments',
    'pet_professional_partnerships',
    'local_business_partnerships',
    'schools'
  ));

-- The grassroots_history table's category CHECK constraint still enumerates only
-- the original five categories. grassroots_targets was widened to also allow
-- local_business_partnerships + schools (20260531120000), but the audit triggers
-- (trg_grassroots_target_history / trg_grassroots_activity_history) copy NEW.category
-- straight into grassroots_history. Because the AFTER trigger runs in the same
-- transaction — and ON CONFLICT DO NOTHING does not swallow CHECK violations —
-- creating, editing, moving, deleting, or logging a visit against a Local Business
-- or Schools row currently aborts the whole operation. Widen the history CHECK to
-- match grassroots_targets so the Marketing History tab covers all seven categories.
ALTER TABLE public.grassroots_history
  DROP CONSTRAINT IF EXISTS grassroots_history_category_check;

ALTER TABLE public.grassroots_history
  ADD CONSTRAINT grassroots_history_category_check
  CHECK (category IN (
    'events',
    'drops',
    'corporate_partnerships',
    'apartments',
    'pet_professional_partnerships',
    'local_business_partnerships',
    'schools'
  ));

-- Make the 30/60/90-day performance reviews applicable to "Director of Resorts".
--
-- Diagnose finding: review_30_day / review_60_day / review_90_day were role-restricted
-- (labor_compliance_role_applicability, is_required = true) to Assistant Manager /
-- General Manager / Supervisor only. get_labor_compliance_board therefore omitted them
-- from Directors' requirements. Combined with the grid fabricating an "Overdue" for any
-- column cell that has no backing board requirement, a Director who had waived these
-- reviews saw "Overdue" in the cell but "Waived" in the detail.
--
-- The client guard in getCycleState (PerformanceReviewComplianceGrid) now prevents the
-- fabricated Overdue for non-applicable cells. This migration makes the reviews genuinely
-- apply to Directors so their real (waived/complete/overdue) state surfaces correctly.

BEGIN;

INSERT INTO public.labor_compliance_role_applicability (requirement_id, role_name, is_required, metadata)
SELECT r.id, 'Director of Resorts', true, jsonb_build_object('seed', 'director_review_applicability_20260529')
FROM public.labor_compliance_requirements r
WHERE r.slug IN ('review_30_day', 'review_60_day', 'review_90_day')
ON CONFLICT (requirement_id, role_name) DO UPDATE
SET is_required = EXCLUDED.is_required,
    metadata = public.labor_compliance_role_applicability.metadata || EXCLUDED.metadata,
    updated_at = now();

COMMIT;

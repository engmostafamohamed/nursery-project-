-- =============================================================================
-- Fix: parent signup submit fails with
--   "Could not find the 'gender' column of 'children' in the schema cache"
-- The parent signup form (StepChild) and the child enrollment form both collect
-- the child's gender, and ChildrenRow declares it, but no migration ever created
-- the column. Add it (idempotent, non-destructive).
--
-- The form's "department" field maps onto the existing enrollment_department
-- column (added by 20260608120000) — no second column is created for it.
-- =============================================================================

ALTER TABLE public.children ADD COLUMN IF NOT EXISTS gender text;

ALTER TABLE public.children DROP CONSTRAINT IF EXISTS children_gender_check;
ALTER TABLE public.children ADD CONSTRAINT children_gender_check
  CHECK (gender IS NULL OR gender IN ('male', 'female'));

COMMENT ON COLUMN public.children.gender IS 'Child gender as captured at signup/enrollment: male | female';

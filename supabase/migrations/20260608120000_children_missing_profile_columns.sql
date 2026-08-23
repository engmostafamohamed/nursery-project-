-- =============================================================================
-- Fix: child record page fails with "Child record not found" because the
-- children table is missing two profile columns the page selects:
--   home_address          (repo migration 016_fix_critical_gaps)
--   enrollment_department (repo migration 015_application_extended_metadata)
-- Those migrations were never applied to this database (drift), so the page's
-- SELECT 400s ("column children.home_address does not exist") and the catch-all
-- renders the not-found message. Add the columns (idempotent, non-destructive).
-- =============================================================================

ALTER TABLE public.children ADD COLUMN IF NOT EXISTS home_address text;
ALTER TABLE public.children ADD COLUMN IF NOT EXISTS enrollment_department text;

COMMENT ON COLUMN public.children.home_address IS 'Family home address - shared across siblings in same household';
COMMENT ON COLUMN public.children.enrollment_department IS 'Which department/class type child is joining (English, French, Arabic, etc)';

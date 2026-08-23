-- Task #14: Drop the deprecated single-teacher field on classes.
-- The previous follow-up migrated all reads off `classes.teacher_id` to the
-- `class_staff` join table (role=lead). The denormalized column, the trigger
-- that kept it in sync, and the sync function are no longer needed.

BEGIN;

DROP TRIGGER IF EXISTS class_staff_sync_lead ON public.class_staff;
DROP FUNCTION IF EXISTS public.sync_classes_lead_teacher();

-- CASCADE: in a clean from-scratch replay, the child-health teacher RLS policies
-- (051/052) sort before this migration and reference classes.teacher_id via a
-- join, so they depend on this column. The column is being permanently retired
-- (teacher assignment lives in class_staff now), so dropping those legacy
-- dependent policies along with it is the intended outcome.
ALTER TABLE public.classes DROP COLUMN IF EXISTS teacher_id CASCADE;

COMMIT;

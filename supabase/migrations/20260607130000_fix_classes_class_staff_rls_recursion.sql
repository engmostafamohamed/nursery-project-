-- =============================================================================
-- Fix: infinite recursion between classes <-> class_staff RLS policies.
--
-- 20260418120000_class_staff.sql step 6 redefined classes_teacher_update_assigned
-- to use a direct subquery on class_staff:
--     id IN (SELECT class_id FROM class_staff WHERE user_id = auth.uid())
-- but class_staff's own policies subquery back into classes
--     (class_id IN (SELECT id FROM classes WHERE nursery_id = ...)).
-- Planning any UPDATE on classes therefore expands classes -> class_staff ->
-- classes -> ... and Postgres raises
--     "infinite recursion detected in policy for relation classes".
--
-- Same remedy as 046_rls_recursion_policies: move the cross-table lookup into a
-- SECURITY DEFINER helper. The function body bypasses RLS, so the planner no
-- longer pulls class_staff's policies into the classes query, breaking the loop.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.current_user_class_staff_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT class_id FROM public.class_staff WHERE user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.current_user_class_staff_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_class_staff_ids() TO authenticated, service_role;

DROP POLICY IF EXISTS classes_teacher_update_assigned ON public.classes;
CREATE POLICY classes_teacher_update_assigned
  ON public.classes FOR UPDATE TO authenticated
  USING (
    public.current_user_role() = 'teacher'::public.user_role
    AND id IN (SELECT public.current_user_class_staff_ids())
  )
  WITH CHECK (
    public.current_user_role() = 'teacher'::public.user_role
    AND id IN (SELECT public.current_user_class_staff_ids())
  );

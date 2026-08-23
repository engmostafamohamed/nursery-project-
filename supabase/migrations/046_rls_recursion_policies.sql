-- Migration 046: Core table RLS (pairs with 045). Media + service_role in 047.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'attendance_records',
        'events',
        'classes',
        'surveys',
        'staff_profiles',
        'nurseries',
        'waitlist',
        'media',
        'media_children',
        'media_visibility',
        'event_attendees'
      )
      AND NOT (tablename = 'classes' AND policyname = 'classes_public_select_for_inquiry')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- attendance_records
CREATE POLICY attendance_staff_all
  ON public.attendance_records
  FOR ALL
  TO authenticated
  USING (
    public.current_user_role() IS DISTINCT FROM 'parent'::public.user_role
    AND public.rls_staff_can_access_child(child_id)
  )
  WITH CHECK (
    public.current_user_role() IS DISTINCT FROM 'parent'::public.user_role
    AND public.rls_staff_can_access_child(child_id)
  );

CREATE POLICY attendance_parent_select
  ON public.attendance_records
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_role() = 'parent'::public.user_role
    AND public.parent_can_access_child(child_id)
  );

-- events (staff policies unchanged logic; parent uses helper)
CREATE POLICY events_xo_all
  ON public.events FOR ALL TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

CREATE POLICY events_chain_all
  ON public.events FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'::public.user_role
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  )
  WITH CHECK (
    public.current_user_role() = 'chain_super_admin'::public.user_role
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  );

CREATE POLICY events_branch_all
  ON public.events FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'::public.user_role
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() = 'branch_admin'::public.user_role
    AND nursery_id = public.current_user_nursery_id()
  );

CREATE POLICY events_teacher_select
  ON public.events FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'teacher'::public.user_role
    AND nursery_id = public.current_user_nursery_id()
  );

CREATE POLICY events_parent_select
  ON public.events FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'parent'::public.user_role
    AND public.rls_parent_has_child_in_nursery(nursery_id)
  );

-- classes
CREATE POLICY classes_xo_super_admin_all
  ON public.classes FOR ALL TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

CREATE POLICY classes_chain_super_admin_all
  ON public.classes FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'::public.user_role
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  )
  WITH CHECK (
    public.current_user_role() = 'chain_super_admin'::public.user_role
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  );

CREATE POLICY classes_branch_admin_all
  ON public.classes FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'::public.user_role
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() = 'branch_admin'::public.user_role
    AND nursery_id = public.current_user_nursery_id()
  );

CREATE POLICY classes_teacher_select
  ON public.classes FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'teacher'::public.user_role
    AND nursery_id = public.current_user_nursery_id()
  );

CREATE POLICY classes_teacher_update_assigned
  ON public.classes FOR UPDATE TO authenticated
  USING (
    public.current_user_role() = 'teacher'::public.user_role
    AND teacher_id = auth.uid()
  )
  WITH CHECK (
    public.current_user_role() = 'teacher'::public.user_role
    AND teacher_id = auth.uid()
  );

CREATE POLICY classes_parent_select
  ON public.classes FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'parent'::public.user_role
    AND public.rls_parent_has_child_in_class(id)
  );

-- surveys
CREATE POLICY surveys_xo_all
  ON public.surveys FOR ALL TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

CREATE POLICY surveys_chain_all
  ON public.surveys FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'::public.user_role
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  )
  WITH CHECK (
    public.current_user_role() = 'chain_super_admin'::public.user_role
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  );

CREATE POLICY surveys_branch_all
  ON public.surveys FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'::public.user_role
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() = 'branch_admin'::public.user_role
    AND nursery_id = public.current_user_nursery_id()
  );

CREATE POLICY surveys_teacher_select
  ON public.surveys FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'teacher'::public.user_role
    AND nursery_id = public.current_user_nursery_id()
    AND target_role = 'teacher'::public.user_role
    AND status = 'published'
  );

CREATE POLICY surveys_parent_select
  ON public.surveys FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'parent'::public.user_role
    AND public.rls_parent_has_child_in_nursery(nursery_id)
    AND target_role = 'parent'::public.user_role
    AND status = 'published'
  );

-- nurseries
CREATE POLICY nurseries_xo_super_admin_all
  ON public.nurseries FOR ALL TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

CREATE POLICY nurseries_chain_super_admin_all
  ON public.nurseries FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'::public.user_role
    AND chain_id = public.current_user_chain_id()
  )
  WITH CHECK (
    public.current_user_role() = 'chain_super_admin'::public.user_role
    AND chain_id = public.current_user_chain_id()
  );

CREATE POLICY nurseries_branch_admin_all
  ON public.nurseries FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'::public.user_role
    AND id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() = 'branch_admin'::public.user_role
    AND id = public.current_user_nursery_id()
  );

CREATE POLICY nurseries_teacher_select
  ON public.nurseries FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'teacher'::public.user_role
    AND id = public.current_user_nursery_id()
  );

CREATE POLICY nurseries_parent_select
  ON public.nurseries FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'parent'::public.user_role
    AND public.rls_parent_has_child_in_nursery(id)
  );

-- waitlist
CREATE POLICY waitlist_staff_manage
  ON public.waitlist FOR ALL TO authenticated
  USING (public.rls_staff_manages_nursery(nursery_id))
  WITH CHECK (public.rls_staff_manages_nursery(nursery_id));

-- staff_profiles
CREATE POLICY staff_profiles_admin_manage
  ON public.staff_profiles FOR ALL TO authenticated
  USING (public.rls_staff_manages_nursery(nursery_id))
  WITH CHECK (public.rls_staff_manages_nursery(nursery_id));

CREATE POLICY staff_profiles_self_select
  ON public.staff_profiles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY staff_profiles_teacher_select
  ON public.staff_profiles FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'teacher'::public.user_role
    AND nursery_id = public.current_user_nursery_id()
  );

-- event_attendees
CREATE POLICY event_attendees_staff_select
  ON public.event_attendees FOR SELECT TO authenticated
  USING (public.rls_event_attendees_row_ok(event_id));

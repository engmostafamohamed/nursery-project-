-- =============================================================================
-- Migration: 20260521120200_manager_full_rls_policies
-- Depends on: 20260521120000 (enum added) + 20260521120100 (helpers added)
--
-- What the two earlier migrations already did:
--   120000 → ALTER TYPE user_role ADD VALUE 'manager'
--   120100 → ADD users.department column
--             ADD is_manager_of_nursery() helper
--             ADD users_manager_select_own_nursery policy on users table
--
-- What this migration adds:
--   1. Patch rls_staff_manages_nursery()  → manager now "manages" their nursery
--   2. Patch rls_staff_can_access_child() → manager can access children
--   3. Patch rls_authenticated_staff_sees_nursery() → manager sees nursery row
--   4. Policies on every table that was missing manager:
--      attendance_records, events, classes, surveys, nurseries,
--      broadcast_messages, daily_reports / report_reactions,
--      media / media_children / media_visibility,
--      child_health_records, child_allergies, child_chronic_conditions,
--      staff_profiles (view-only for manager)
--
-- Tables intentionally LEFT OUT (manager must never reach them):
--   staff_payroll — finance-only
--   invoices / payments / payment_attempts — finance-only
--   loyalty_program — finance-only (or HR, gated by department in app)
--   nursery_settings / nurseries UPDATE/DELETE — admin-only
--   tenant_export_jobs — admin-only
-- =============================================================================

-- =============================================================================
-- 1. Patch rls_staff_manages_nursery
--    Used by: waitlist, staff_profiles, media, and many more (via FOR ALL).
--    Adding manager here gives them write access to ALL tables that use
--    this helper — which is intentional for ops tables (attendance, events,
--    classes, media approval, broadcast).
--    Payroll and financial tables do NOT use this helper, so they are safe.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.rls_staff_manages_nursery(p_nursery_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  r public.user_role;
  u_nursery uuid;
BEGIN
  IF p_nursery_id IS NULL THEN
    RETURN false;
  END IF;
  SET LOCAL row_security = off;
  SELECT u.role, u.nursery_id INTO r, u_nursery
  FROM public.users u WHERE u.id = auth.uid();
  IF r IS NULL THEN
    RETURN false;
  END IF;
  IF r = 'xo_super_admin'::public.user_role THEN
    RETURN true;
  END IF;
  IF r = 'chain_super_admin'::public.user_role THEN
    RETURN p_nursery_id IN (SELECT public.nursery_ids_for_chain_admin());
  END IF;
  IF r = 'branch_admin'::public.user_role THEN
    RETURN p_nursery_id IS NOT DISTINCT FROM u_nursery;
  END IF;
  -- NEW: manager is scoped to their own nursery
  IF r = 'manager'::public.user_role THEN
    RETURN p_nursery_id IS NOT DISTINCT FROM u_nursery;
  END IF;
  RETURN false;
END;
$$;

-- =============================================================================
-- 2. Patch rls_staff_can_access_child
--    Used by: attendance_records policy (attendance_staff_all).
--    Manager gets same scope as branch_admin: any child in their nursery.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.rls_staff_can_access_child(p_child_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  r public.user_role;
  u_nursery uuid;
  c_nursery uuid;
  c_class uuid;
BEGIN
  IF p_child_id IS NULL THEN
    RETURN false;
  END IF;
  SET LOCAL row_security = off;
  SELECT u.role, u.nursery_id INTO r, u_nursery
  FROM public.users u WHERE u.id = auth.uid();
  IF r IS NULL THEN
    RETURN false;
  END IF;
  IF r = 'xo_super_admin'::public.user_role THEN
    RETURN true;
  END IF;
  SELECT c.nursery_id, c.class_id INTO c_nursery, c_class
  FROM public.children c WHERE c.id = p_child_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF r = 'chain_super_admin'::public.user_role THEN
    RETURN c_nursery IN (SELECT public.nursery_ids_for_chain_admin());
  END IF;
  IF r = 'branch_admin'::public.user_role THEN
    RETURN c_nursery IS NOT DISTINCT FROM u_nursery;
  END IF;
  -- NEW: manager sees all children in their nursery
  IF r = 'manager'::public.user_role THEN
    RETURN c_nursery IS NOT DISTINCT FROM u_nursery;
  END IF;
  IF r = 'teacher'::public.user_role THEN
    IF c_class IS NULL THEN
      RETURN c_nursery IS NOT DISTINCT FROM u_nursery;
    END IF;
    RETURN EXISTS (
      SELECT 1 FROM public.classes cl
      WHERE cl.id = c_class AND cl.teacher_id = auth.uid()
    );
  END IF;
  RETURN false;
END;
$$;

-- =============================================================================
-- 3. Patch rls_authenticated_staff_sees_nursery
--    Used by: events attendees, event_attendees_row_ok.
--    Manager should see events in their nursery.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.rls_authenticated_staff_sees_nursery(p_nursery_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  r public.user_role;
  u_nursery uuid;
BEGIN
  IF p_nursery_id IS NULL THEN
    RETURN false;
  END IF;
  SET LOCAL row_security = off;
  SELECT u.role, u.nursery_id INTO r, u_nursery
  FROM public.users u WHERE u.id = auth.uid();
  IF r IS NULL THEN
    RETURN false;
  END IF;
  IF r = 'xo_super_admin'::public.user_role THEN
    RETURN true;
  END IF;
  IF r = 'chain_super_admin'::public.user_role THEN
    RETURN p_nursery_id IN (SELECT public.nursery_ids_for_chain_admin());
  END IF;
  -- NEW: manager added alongside branch_admin and teacher
  IF r IN (
    'branch_admin'::public.user_role,
    'manager'::public.user_role,
    'teacher'::public.user_role
  ) THEN
    RETURN p_nursery_id IS NOT DISTINCT FROM u_nursery;
  END IF;
  RETURN false;
END;
$$;

-- =============================================================================
-- 4. events — add manager policy
--    (rls_staff_manages_nursery already updated above, but events uses
--    explicit role checks rather than the helper, so we add a policy.)
-- =============================================================================
DROP POLICY IF EXISTS events_manager_all ON public.events;
CREATE POLICY events_manager_all
  ON public.events FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'manager'::public.user_role
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() = 'manager'::public.user_role
    AND nursery_id = public.current_user_nursery_id()
  );

-- =============================================================================
-- 5. classes — add manager policy (same scope as branch_admin)
-- =============================================================================
DROP POLICY IF EXISTS classes_manager_all ON public.classes;
CREATE POLICY classes_manager_all
  ON public.classes FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'manager'::public.user_role
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() = 'manager'::public.user_role
    AND nursery_id = public.current_user_nursery_id()
  );

-- =============================================================================
-- 6. surveys — manager can read + create surveys for their nursery
--    (Cannot publish platform-wide surveys — that stays with chain/xo)
-- =============================================================================
DROP POLICY IF EXISTS surveys_manager_all ON public.surveys;
CREATE POLICY surveys_manager_all
  ON public.surveys FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'manager'::public.user_role
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() = 'manager'::public.user_role
    AND nursery_id = public.current_user_nursery_id()
  );

-- =============================================================================
-- 7. nurseries — manager can SELECT their own nursery row (read-only)
--    Cannot UPDATE/DELETE nursery settings (that is branch_admin+)
-- =============================================================================
DROP POLICY IF EXISTS nurseries_manager_select ON public.nurseries;
CREATE POLICY nurseries_manager_select
  ON public.nurseries FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'manager'::public.user_role
    AND id = public.current_user_nursery_id()
  );

-- =============================================================================
-- 8. broadcast_messages — manager can manage broadcasts for their nursery
--    (The existing teacher policy only covers class announcements.)
-- =============================================================================
DROP POLICY IF EXISTS broadcast_messages_manager_all ON public.broadcast_messages;
CREATE POLICY broadcast_messages_manager_all
  ON public.broadcast_messages FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'manager'::public.user_role
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() = 'manager'::public.user_role
    AND nursery_id = public.current_user_nursery_id()
  );

-- =============================================================================
-- 9. daily_reports — patch existing policies that hardcode role list
--    The policies in 20260328123756 use a sub-select on users.role.
--    Easiest fix: add dedicated manager policies alongside existing ones.
-- =============================================================================
DROP POLICY IF EXISTS daily_reports_manager_all ON public.daily_reports;
CREATE POLICY daily_reports_manager_all
  ON public.daily_reports FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'manager'::public.user_role
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() = 'manager'::public.user_role
    AND nursery_id = public.current_user_nursery_id()
  );

-- =============================================================================
-- 10. report_reactions — manager can moderate reactions in their nursery
-- =============================================================================
DROP POLICY IF EXISTS report_reactions_manager_all ON public.report_reactions;
CREATE POLICY report_reactions_manager_all
  ON public.report_reactions FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'manager'::public.user_role
    AND EXISTS (
      SELECT 1 FROM public.daily_reports dr
      WHERE dr.id = report_reactions.report_id
        AND dr.nursery_id = public.current_user_nursery_id()
    )
  )
  WITH CHECK (
    public.current_user_role() = 'manager'::public.user_role
    AND EXISTS (
      SELECT 1 FROM public.daily_reports dr
      WHERE dr.id = report_reactions.report_id
        AND dr.nursery_id = public.current_user_nursery_id()
    )
  );

-- =============================================================================
-- 11. child_health_records — manager SELECT only (read, not write)
--     Write stays with branch_admin / chain / xo
-- =============================================================================
DROP POLICY IF EXISTS child_health_records_manager_select ON public.child_health_records;
CREATE POLICY child_health_records_manager_select
  ON public.child_health_records FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'manager'::public.user_role
    AND public.rls_staff_can_access_child(child_id)
  );

-- =============================================================================
-- 12. child_allergies — manager SELECT only
-- =============================================================================
DROP POLICY IF EXISTS child_allergies_manager_select ON public.child_allergies;
CREATE POLICY child_allergies_manager_select
  ON public.child_allergies FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'manager'::public.user_role
    AND public.rls_staff_can_access_child(child_id)
  );

-- =============================================================================
-- 13. child_chronic_conditions — manager SELECT only
-- =============================================================================
DROP POLICY IF EXISTS child_chronic_manager_select ON public.child_chronic_conditions;
CREATE POLICY child_chronic_manager_select
  ON public.child_chronic_conditions FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'manager'::public.user_role
    AND public.rls_staff_can_access_child(child_id)
  );

-- =============================================================================
-- 14. staff_profiles — manager SELECT only (directory view, cannot hire/fire)
--     The existing staff_profiles_admin_manage uses rls_staff_manages_nursery
--     which now includes manager — but that would give manager INSERT/UPDATE
--     on staff_profiles (HR data). We need to EXCLUDE manager from that helper
--     for this one table by adding an explicit deny-override pattern.
--
--     Strategy: drop + recreate staff_profiles_admin_manage to exclude manager,
--     then add manager-specific SELECT-only policy.
-- =============================================================================
DROP POLICY IF EXISTS staff_profiles_admin_manage ON public.staff_profiles;
CREATE POLICY staff_profiles_admin_manage
  ON public.staff_profiles FOR ALL TO authenticated
  USING (
    -- manager explicitly excluded from write access to staff_profiles
    public.current_user_role() != 'manager'::public.user_role
    AND public.rls_staff_manages_nursery(nursery_id)
  )
  WITH CHECK (
    public.current_user_role() != 'manager'::public.user_role
    AND public.rls_staff_manages_nursery(nursery_id)
  );

DROP POLICY IF EXISTS staff_profiles_manager_select ON public.staff_profiles;
CREATE POLICY staff_profiles_manager_select
  ON public.staff_profiles FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'manager'::public.user_role
    AND nursery_id = public.current_user_nursery_id()
  );

-- =============================================================================
-- 15. waitlist — manager can manage waitlist (same as branch_admin via helper)
--     Already covered by rls_staff_manages_nursery update above.
--     No extra policy needed — the existing waitlist_staff_manage policy
--     will now include manager automatically.
-- =============================================================================

-- =============================================================================
-- 16. Verify GRANTS are in place for the patched helpers
-- =============================================================================
REVOKE ALL ON FUNCTION public.rls_staff_manages_nursery(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rls_staff_can_access_child(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rls_authenticated_staff_sees_nursery(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.rls_staff_manages_nursery(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rls_staff_can_access_child(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rls_authenticated_staff_sees_nursery(uuid) TO authenticated, service_role;
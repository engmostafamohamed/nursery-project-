-- =============================================================================
-- Migration: 20260601100000_manager_hr_staff_writes
--
-- User feedback: Manager HR should be able to add/update/change status of staff
-- in their own nursery. Currently only branch_admin / chain_super_admin /
-- xo_super_admin can write to staff_profiles. Manager (regardless of dept) was
-- entirely blocked.
--
-- We restrict the new write access to managers whose users.department='hr'
-- (the HR specialisation). Manager Finance does NOT get staff write access —
-- they manage money, not people.
--
-- Also extends users(write) so manager_hr can change a staff member's status
-- (active/inactive) — the existing useStaff hook flips users.status when
-- deactivating staff.
-- =============================================================================

BEGIN;

-- Helper: true when the current caller is a manager with department='hr'
CREATE OR REPLACE FUNCTION public.is_manager_hr()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
     WHERE u.id = auth.uid()
       AND u.role = 'manager'::public.user_role
       AND u.department = 'hr'::public.user_department
  );
$$;
REVOKE ALL ON FUNCTION public.is_manager_hr() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_manager_hr() TO authenticated, service_role;

-- 1. staff_profiles — manager_hr can FULL CRUD on rows in their own nursery.
DROP POLICY IF EXISTS staff_profiles_manager_hr_all ON public.staff_profiles;
CREATE POLICY staff_profiles_manager_hr_all
  ON public.staff_profiles FOR ALL TO authenticated
  USING (
    public.is_manager_hr()
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.is_manager_hr()
    AND nursery_id = public.current_user_nursery_id()
  );

-- 2. users — manager_hr can SELECT all users in their nursery (so the staff
--    list query works) and UPDATE status / contact fields.
DROP POLICY IF EXISTS users_manager_hr_select ON public.users;
CREATE POLICY users_manager_hr_select
  ON public.users FOR SELECT TO authenticated
  USING (
    public.is_manager_hr()
    AND nursery_id = public.current_user_nursery_id()
  );

DROP POLICY IF EXISTS users_manager_hr_update ON public.users;
CREATE POLICY users_manager_hr_update
  ON public.users FOR UPDATE TO authenticated
  USING (
    public.is_manager_hr()
    AND nursery_id = public.current_user_nursery_id()
    -- Explicit safety: never let manager_hr modify branch_admin or higher.
    AND role NOT IN ('branch_admin'::public.user_role,
                     'chain_super_admin'::public.user_role,
                     'xo_super_admin'::public.user_role)
  )
  WITH CHECK (
    public.is_manager_hr()
    AND nursery_id = public.current_user_nursery_id()
    AND role NOT IN ('branch_admin'::public.user_role,
                     'chain_super_admin'::public.user_role,
                     'xo_super_admin'::public.user_role)
  );

-- 3. staff_schedules — needed so onboarding-form's work-schedule inserts succeed.
DROP POLICY IF EXISTS staff_schedules_manager_hr_all ON public.staff_schedules;
CREATE POLICY staff_schedules_manager_hr_all
  ON public.staff_schedules FOR ALL TO authenticated
  USING (
    public.is_manager_hr()
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.is_manager_hr()
    AND nursery_id = public.current_user_nursery_id()
  );

-- 4. staff_national_ids — same.
DROP POLICY IF EXISTS staff_national_ids_manager_hr_all ON public.staff_national_ids;
CREATE POLICY staff_national_ids_manager_hr_all
  ON public.staff_national_ids FOR ALL TO authenticated
  USING (
    public.is_manager_hr()
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.is_manager_hr()
    AND nursery_id = public.current_user_nursery_id()
  );

COMMIT;

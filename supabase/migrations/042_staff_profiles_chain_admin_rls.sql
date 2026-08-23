-- Migration 042: Split staff_profiles admin policy so chain_super_admin can manage
-- staff in any nursery in their chain (not only current_user_nursery_id()).
-- Prerequisite: 031_rls_helpers_bypass_row_security.sql (helpers must bypass RLS on public.users).

DROP POLICY IF EXISTS staff_profiles_admin_all ON public.staff_profiles;

CREATE POLICY staff_profiles_branch_admin_all
  ON public.staff_profiles
  FOR ALL
  TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  );

CREATE POLICY chain_admin_can_manage_chain_staff
  ON public.staff_profiles
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      INNER JOIN public.nurseries n ON n.chain_id = u.chain_id
      WHERE u.id = auth.uid()
        AND u.role = 'chain_super_admin'::public.user_role
        AND n.id = staff_profiles.nursery_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users u
      INNER JOIN public.nurseries n ON n.chain_id = u.chain_id
      WHERE u.id = auth.uid()
        AND u.role = 'chain_super_admin'::public.user_role
        AND n.id = staff_profiles.nursery_id
    )
  );

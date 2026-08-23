-- Migration 043: Non-recursive RLS on public.children
--
-- Prerequisite: 031_rls_helpers_bypass_row_security.sql — current_user_role(),
-- current_user_nursery_id(), nursery_ids_for_chain_admin(), is_xo_super_admin()
-- must use plpgsql + SET LOCAL row_security = off (no recursion via public.users).
--
-- Drops all existing children policies, then replaces them with:
-- 1) Parent SELECT via parent_children only (no users table in the policy expression).
-- 2) Staff / super-admin access via helpers only (no direct SELECT from public.users in policies).
-- 3) service_role explicit ALL (Supabase service key; USING (true) replaces fragile JWT checks on TO authenticated).

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'children'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.children', r.policyname);
  END LOOP;
END $$;

-- Parents: linked rows only (subquery touches parent_children, not users)
CREATE POLICY children_parents_select
  ON public.children
  FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT pc.child_id
      FROM public.parent_children pc
      WHERE pc.parent_id = auth.uid()
    )
  );

-- XO / chain / branch / teacher: helpers bypass RLS on users; explicit roles so parents with
-- nursery_id set cannot match nursery_id = current_user_nursery_id() for all children.
CREATE POLICY children_admins_all
  ON public.children
  FOR ALL
  TO authenticated
  USING (
    public.is_xo_super_admin()
    OR (
      public.current_user_role() = 'chain_super_admin'::public.user_role
      AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
    )
    OR (
      public.current_user_role() IN (
        'branch_admin'::public.user_role,
        'teacher'::public.user_role
      )
      AND nursery_id = public.current_user_nursery_id()
    )
  )
  WITH CHECK (
    public.is_xo_super_admin()
    OR (
      public.current_user_role() = 'chain_super_admin'::public.user_role
      AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
    )
    OR (
      public.current_user_role() IN (
        'branch_admin'::public.user_role,
        'teacher'::public.user_role
      )
      AND nursery_id = public.current_user_nursery_id()
    )
  );

CREATE POLICY children_service_all
  ON public.children
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE children IS 'Migration 043: Non-recursive RLS using helpers from 031';;

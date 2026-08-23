-- Runtime fix: eliminate children policy recursion by avoiding RLS-dependent lookups in policy expressions.
-- This migration is timestamped to ensure it applies on remote even when numbered files were skipped.

CREATE OR REPLACE FUNCTION public.get_my_access_scope()
RETURNS TABLE(role public.user_role, nursery_id uuid, chain_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT u.role, u.nursery_id, u.chain_id
  FROM public.users u
  WHERE u.id = auth.uid()
$$;

COMMENT ON FUNCTION public.get_my_access_scope IS
'SECURITY DEFINER access-scope helper for RLS policies to avoid recursion through users/children policy chains';

DROP POLICY IF EXISTS children_xo_super_admin_all ON public.children;
DROP POLICY IF EXISTS children_branch_admin_all ON public.children;
DROP POLICY IF EXISTS children_chain_super_admin_all ON public.children;
DROP POLICY IF EXISTS children_teacher_select ON public.children;
DROP POLICY IF EXISTS children_parent_select ON public.children;
DROP POLICY IF EXISTS children_admin_select ON public.children;
DROP POLICY IF EXISTS children_parents_select ON public.children;
DROP POLICY IF EXISTS children_admins_all ON public.children;
DROP POLICY IF EXISTS children_service_all ON public.children;
DROP POLICY IF EXISTS children_service_role_all ON public.children;

ALTER TABLE public.children ENABLE ROW LEVEL SECURITY;

CREATE POLICY children_xo_super_admin_all
  ON public.children
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.get_my_access_scope() s
      WHERE s.role = 'xo_super_admin'::public.user_role
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.get_my_access_scope() s
      WHERE s.role = 'xo_super_admin'::public.user_role
    )
  );

CREATE POLICY children_chain_super_admin_all
  ON public.children
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.get_my_access_scope() s
      JOIN public.nurseries n ON n.id = public.children.nursery_id
      WHERE s.role = 'chain_super_admin'::public.user_role
        AND s.chain_id IS NOT NULL
        AND n.chain_id = s.chain_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.get_my_access_scope() s
      JOIN public.nurseries n ON n.id = public.children.nursery_id
      WHERE s.role = 'chain_super_admin'::public.user_role
        AND s.chain_id IS NOT NULL
        AND n.chain_id = s.chain_id
    )
  );

CREATE POLICY children_branch_admin_all
  ON public.children
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.get_my_access_scope() s
      WHERE s.role = 'branch_admin'::public.user_role
        AND s.nursery_id = public.children.nursery_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.get_my_access_scope() s
      WHERE s.role = 'branch_admin'::public.user_role
        AND s.nursery_id = public.children.nursery_id
    )
  );

CREATE POLICY children_teacher_select
  ON public.children
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.get_my_access_scope() s
      JOIN public.classes cl ON cl.id = public.children.class_id
      WHERE s.role = 'teacher'::public.user_role
        AND s.nursery_id = public.children.nursery_id
        AND cl.teacher_id = auth.uid()
    )
  );

CREATE POLICY children_parent_select
  ON public.children
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.get_my_access_scope() s
      WHERE s.role = 'parent'::public.user_role
        AND public.parent_can_access_child(public.children.id)
    )
  );

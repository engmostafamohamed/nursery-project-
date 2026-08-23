-- =============================================================================
-- Migration: 20260531100000_users_admin_select_policies
--
-- public.users RLS is currently too restrictive. The existing policies only
-- allow:
--   - users_select_own              (id = auth.uid())
--   - users_manager_select_own_nursery (manager sees own nursery users)
--   - users_service_role_all        (service role bypass)
--
-- That means xo_super_admin, branch_admin, and chain_super_admin can ONLY see
-- their own row when querying the users table — which broke the Staff Directory
-- (and any other admin UI that joins/lists users).
--
-- This migration adds three permissive SELECT policies so admin roles see the
-- users they're supposed to manage:
--   1. users_xo_select_all          — xo_super_admin sees every user
--   2. users_branch_admin_select    — branch_admin sees users in their nursery
--   3. users_chain_admin_select     — chain_super_admin sees users in their chain
--
-- WRITE policies (INSERT / UPDATE / DELETE) are intentionally NOT touched here.
-- =============================================================================

BEGIN;

DROP POLICY IF EXISTS users_xo_select_all ON public.users;
CREATE POLICY users_xo_select_all
  ON public.users FOR SELECT TO authenticated
  USING (public.is_xo_super_admin());

DROP POLICY IF EXISTS users_branch_admin_select ON public.users;
CREATE POLICY users_branch_admin_select
  ON public.users FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'::public.user_role
    AND nursery_id = public.current_user_nursery_id()
  );

DROP POLICY IF EXISTS users_chain_admin_select ON public.users;
CREATE POLICY users_chain_admin_select
  ON public.users FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'::public.user_role
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  );

COMMIT;

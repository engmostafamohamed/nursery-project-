-- =============================================================================
-- Migration: 20260529100000_rbac_phase6_xo_only_writes
--
-- Phase 0 RLS allowed branch_admin (via rls_staff_manages_nursery) to CRUD
-- roles/positions/role_features for their own nursery. That's now considered
-- a footgun — branch admins were able to overwrite seed roles or grant
-- themselves powers via the Roles UI.
--
-- Phase 6 locks WRITE access on the four RBAC tables to xo_super_admin only.
-- READ stays open to authenticated so the Staff Onboarding form's Position
-- dropdown (and any other consumer) keeps working.
--
-- Tables affected:
--   public.features         — already xo-only; recreated for cleanliness
--   public.roles            — drop the branch-admin clause from manage policy
--   public.role_features    — same
--   public.positions        — same
-- =============================================================================

BEGIN;

-- features: SELECT open, ALL gated to xo_super_admin
DROP POLICY IF EXISTS features_select    ON public.features;
DROP POLICY IF EXISTS features_xo_manage ON public.features;
CREATE POLICY features_select    ON public.features FOR SELECT TO authenticated USING (true);
CREATE POLICY features_xo_manage ON public.features FOR ALL    TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

-- roles: SELECT open, ALL gated to xo_super_admin (no more branch-admin write)
DROP POLICY IF EXISTS roles_select  ON public.roles;
DROP POLICY IF EXISTS roles_manage  ON public.roles;
CREATE POLICY roles_select ON public.roles FOR SELECT TO authenticated USING (true);
CREATE POLICY roles_manage ON public.roles FOR ALL    TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

-- role_features: SELECT open, ALL gated to xo_super_admin
DROP POLICY IF EXISTS role_features_select  ON public.role_features;
DROP POLICY IF EXISTS role_features_manage  ON public.role_features;
CREATE POLICY role_features_select ON public.role_features FOR SELECT TO authenticated USING (true);
CREATE POLICY role_features_manage ON public.role_features FOR ALL    TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

-- positions: SELECT open, ALL gated to xo_super_admin
DROP POLICY IF EXISTS positions_select  ON public.positions;
DROP POLICY IF EXISTS positions_manage  ON public.positions;
CREATE POLICY positions_select ON public.positions FOR SELECT TO authenticated USING (true);
CREATE POLICY positions_manage ON public.positions FOR ALL    TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

COMMIT;

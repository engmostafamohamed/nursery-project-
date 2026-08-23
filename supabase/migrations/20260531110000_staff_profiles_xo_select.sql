-- =============================================================================
-- Migration: 20260531110000_staff_profiles_xo_select
--
-- Companion to 20260531100000 (which added admin SELECT policies on users).
-- staff_profiles has no policy that lets xo_super_admin read all rows —
-- so the Staff Directory page shows position/department/etc. as "—" for
-- everyone when an XO admin loads it (the user row joins succeed, but the
-- staff_profiles join returns 0 rows due to RLS).
--
-- This adds a permissive SELECT policy for xo_super_admin (full visibility).
-- Existing branch_admin / chain_super_admin / teacher / self policies untouched.
-- =============================================================================

DROP POLICY IF EXISTS staff_profiles_xo_select ON public.staff_profiles;
CREATE POLICY staff_profiles_xo_select
  ON public.staff_profiles FOR SELECT TO authenticated
  USING (public.is_xo_super_admin());

DROP POLICY IF EXISTS staff_profiles_xo_manage ON public.staff_profiles;
CREATE POLICY staff_profiles_xo_manage
  ON public.staff_profiles FOR ALL TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

-- Migration: Manager department + RLS helpers/policies
-- Date: 2026-05-21
--
-- Adds the department specialisation for the new `manager` role (the "Finance"
-- and "HR" columns in the Feature/Roles matrix) and the RLS plumbing so a
-- manager is treated like a scoped branch admin within their own nursery.

-- 1. Department enum (matches the `Department` TS type) ------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_department') THEN
    CREATE TYPE public.user_department AS ENUM ('finance', 'hr', 'operations');
  END IF;
END $$;

-- 2. Column on users -----------------------------------------------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS department public.user_department;

COMMENT ON COLUMN public.users.department IS
  'Specialisation for the manager role. finance -> finance dashboards/reports/loyalty; hr -> staff. NULL for non-managers.';

-- Only managers may carry a department.
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_department_role_ck;
ALTER TABLE public.users
  ADD CONSTRAINT users_department_role_ck CHECK (
    department IS NULL OR role = 'manager'
  );

-- 3. RLS helper functions ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_department()
RETURNS public.user_department
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT u.department
  FROM public.users u
  WHERE u.id = auth.uid();
$$;

-- True when the current user is a manager scoped to the given nursery.
CREATE OR REPLACE FUNCTION public.is_manager_of_nursery(target_nursery uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role = 'manager'::public.user_role
      AND u.nursery_id = target_nursery
  );
$$;

-- 4. Example policy ------------------------------------------------------------
-- Managers can read users in their own nursery (mirrors the branch_admin scope).
-- Repeat this pattern (USING public.is_manager_of_nursery(nursery_id)) on the
-- other nursery-scoped tables you want managers to reach (children, classes,
-- attendance_records, events, media, …). Department-level gating (finance/hr)
-- is enforced in the app via the permission matrix; tighten in SQL later if
-- you need hard DB guarantees.
DROP POLICY IF EXISTS users_manager_select_own_nursery ON public.users;
CREATE POLICY users_manager_select_own_nursery
  ON public.users
  FOR SELECT
  USING (
    public.current_user_role() = 'manager'
    AND nursery_id = public.current_user_nursery_id()
  );

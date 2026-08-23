-- =============================================================================
-- Migration: 20260531120000_staff_hr_dept_derive
--
-- Today the Edge Function `staff-onboarding-complete` maps the staff position
-- string to a StaffDepartment via a hard-coded switch in
-- supabase/functions/staff-onboarding-complete/mapStaffProfile.ts:
--   admin    -> admin
--   kitchen  -> kitchen
--   cleaner  -> maintenance
--   security -> security
--   driver   -> driver
--   default  -> teaching
--
-- Custom positions (e.g. "Manager Teacher") fall through to the default
-- 'teaching' bucket, which doesn't fit a managerial role.
--
-- This migration adds a BEFORE INSERT/UPDATE trigger on `staff_profiles` that
-- smart-derives `department` from the position's linked role.base_role when:
--   (a) the row references a real position_id (set by trg_derive_position_id),
--   (b) the caller didn't explicitly override department to a non-'teaching'
--       value (so manual edits via the Edit Profile dialog win).
--
-- Mapping:
--   role.base_role IN ('branch_admin','chain_super_admin','manager')  -> 'admin'
--   role.base_role = 'teacher'                                        -> 'teaching'
--   (no role / no position_id)                                        -> leave as-is
-- =============================================================================

CREATE OR REPLACE FUNCTION public.derive_staff_hr_department()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base_role public.user_role;
  v_role_key  text;
  v_role_name text;
BEGIN
  IF NEW.position_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Skip if the caller explicitly set a non-default department.
  IF TG_OP = 'INSERT' AND NEW.department IS NOT NULL AND NEW.department <> 'teaching' THEN
    RETURN NEW;
  END IF;

  -- On UPDATE, only override when position_id actually changed.
  IF TG_OP = 'UPDATE' AND NEW.position_id IS NOT DISTINCT FROM OLD.position_id THEN
    RETURN NEW;
  END IF;

  SELECT r.base_role, lower(r.key), lower(r.name_en)
    INTO v_base_role, v_role_key, v_role_name
    FROM public.positions p
    JOIN public.roles r ON r.id = p.role_id
    WHERE p.id = NEW.position_id;

  IF v_base_role IS NULL THEN
    RETURN NEW;
  END IF;

  -- HR-admin signals: base_role variant OR managerial keyword in role key/name.
  -- This handles "Manager Teacher"-style roles where RLS scope is teacher
  -- but the person logically sits in the admin HR bucket.
  IF v_base_role IN ('branch_admin'::public.user_role,
                     'chain_super_admin'::public.user_role,
                     'manager'::public.user_role)
     OR v_role_key  ~ '(manager|admin|supervisor|head|lead|director|principal)'
     OR v_role_name ~ '(manager|admin|supervisor|head|lead|director|principal)'
  THEN
    NEW.department := 'admin';
  ELSIF v_base_role = 'teacher'::public.user_role THEN
    IF NEW.department IS NULL OR NEW.department = 'teaching' THEN
      NEW.department := 'teaching';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_derive_staff_hr_department ON public.staff_profiles;
CREATE TRIGGER trg_derive_staff_hr_department
  BEFORE INSERT OR UPDATE OF position_id, position ON public.staff_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.derive_staff_hr_department();

-- Backfill existing rows so any "manager_*" / "admin_*" custom positions
-- pick up the smart mapping immediately.
UPDATE public.staff_profiles sp
SET department = 'admin'
FROM public.positions p
JOIN public.roles r ON r.id = p.role_id
WHERE sp.position_id = p.id
  AND sp.department = 'teaching'
  AND (
    r.base_role IN ('branch_admin'::public.user_role,
                    'chain_super_admin'::public.user_role,
                    'manager'::public.user_role)
    OR lower(r.key)     ~ '(manager|admin|supervisor|head|lead|director|principal)'
    OR lower(r.name_en) ~ '(manager|admin|supervisor|head|lead|director|principal)'
  );

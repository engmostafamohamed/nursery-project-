-- =============================================================================
-- Migration: 20260530120000_check_staff_identity_exists
--
-- Adds a SECURITY DEFINER function that lets the staff onboarding form check
-- whether the would-be auth user already exists, without exposing actual user
-- rows. The function returns a boolean per check.
--
-- The Edge Function `staff-onboarding-complete` derives a placeholder email
-- from the mobile when no email is supplied:
--   `<digits-of-mobile>@staff.placeholder.xo`
-- This function performs the same normalisation so the UI can warn the user
-- on the identity step instead of after Submit (which produced the cryptic
-- "Edge Function returned a non-2xx status code" toast).
--
-- Security: returns boolean only — no row data leaks. Reuses `auth.uid()`
-- enforcement to ensure only signed-in users (i.e. admins running the form)
-- can call it; xo_super_admin / branch_admin / chain_super_admin / manager
-- all qualify.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.check_staff_identity_exists(
  p_email  text DEFAULT NULL,
  p_mobile text DEFAULT NULL
)
RETURNS TABLE (email_taken boolean, mobile_taken boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_normalised_mobile text;
  v_placeholder_email text;
BEGIN
  -- Caller must be authenticated
  IF auth.uid() IS NULL THEN
    RETURN QUERY SELECT false, false;
    RETURN;
  END IF;

  -- Caller must be admin-level (matches Edge Function gate)
  IF NOT EXISTS (
    SELECT 1 FROM public.users u
     WHERE u.id = auth.uid()
       AND u.role IN ('xo_super_admin', 'chain_super_admin', 'branch_admin', 'manager')
  ) THEN
    RETURN QUERY SELECT false, false;
    RETURN;
  END IF;

  -- Normalise: digits only for the mobile placeholder lookup
  v_normalised_mobile := regexp_replace(COALESCE(p_mobile, ''), '\D', '', 'g');
  v_placeholder_email := CASE WHEN v_normalised_mobile <> ''
                              THEN v_normalised_mobile || '@staff.placeholder.xo'
                              ELSE NULL END;

  RETURN QUERY
  SELECT
    -- email_taken: only true when caller actually passed a non-empty email
    (p_email IS NOT NULL AND p_email <> '' AND EXISTS (
       SELECT 1 FROM auth.users au WHERE lower(au.email) = lower(p_email)
    )) AS email_taken,
    -- mobile_taken: matches the placeholder email derived from the mobile
    (v_placeholder_email IS NOT NULL AND EXISTS (
       SELECT 1 FROM auth.users au WHERE lower(au.email) = lower(v_placeholder_email)
    )) AS mobile_taken;
END;
$$;

REVOKE ALL ON FUNCTION public.check_staff_identity_exists(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_staff_identity_exists(text, text)
  TO authenticated, service_role;

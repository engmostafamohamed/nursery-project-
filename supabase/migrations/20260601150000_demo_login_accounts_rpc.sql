-- =============================================================================
-- Migration: 20260601150000_demo_login_accounts_rpc
--
-- Powers the **dynamic Demo Accounts panel** on the login page. Returns every
-- user who can be auto-logged-in for demo / dev:
--   - all `@xonursery.com` seed demo accounts (demo-xo-admin, etc.)
--   - all `@staff.placeholder.xo` placeholder-email staff (created via Staff
--     Onboarding when no real email is provided)
-- For each, we surface the role and position labels so the panel can show
-- meaningful tags.
--
-- Real-email staff (those onboarded with their own email) are NOT included —
-- they have a random password they need to set themselves via email recovery.
--
-- The function is SECURITY DEFINER and callable by **anon** so the login page
-- can call it before sign-in.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_demo_login_accounts()
RETURNS TABLE (
  email          text,
  name_en        text,
  name_ar        text,
  auth_role      public.user_role,
  custom_role    text,
  position_name  text,
  hr_department  text,
  is_seed_demo   boolean
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    u.email,
    u.name_en,
    u.name_ar,
    u.role         AS auth_role,
    -- Trim any stray whitespace at render time so the UI is clean.
    btrim(coalesce(r.name_en, '')) AS custom_role,
    p.name_en                      AS position_name,
    sp.department                  AS hr_department,
    (u.email LIKE '%@xonursery.com') AS is_seed_demo
  FROM public.users u
  LEFT JOIN public.roles          r  ON r.id = u.role_id
  LEFT JOIN public.staff_profiles sp ON sp.user_id = u.id
  LEFT JOIN public.positions      p  ON p.id = sp.position_id
  WHERE u.status = 'active'
    AND (
      u.email LIKE '%@xonursery.com'
      OR u.email LIKE '%@staff.placeholder.xo'
    )
  ORDER BY u.email;
$$;

REVOKE ALL ON FUNCTION public.get_demo_login_accounts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_demo_login_accounts()
  TO anon, authenticated, service_role;

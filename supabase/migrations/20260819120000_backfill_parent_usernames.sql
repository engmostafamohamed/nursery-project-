-- =============================================================================
-- Give the parents who registered before usernames existed one too.
--
-- Their auth email is their real address, not the <username>@parents.xo.local
-- form new signups mint, so the login screen cannot derive the address from the
-- username by string templating alone. auth_email_for_username() below closes
-- that gap and works for both generations of account.
-- =============================================================================

-- Derive a handle from the email local part, keeping only characters the signup
-- form's username pattern allows, then pad/trim it to the 4..32 it requires.
CREATE OR REPLACE FUNCTION public.suggest_username_from_email(p_email text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT left(
    CASE WHEN length(base) < 4 THEN rpad(base, 4, '0') ELSE base END,
    32
  )
  FROM (
    SELECT COALESCE(
      NULLIF(regexp_replace(lower(split_part(COALESCE(p_email, ''), '@', 1)), '[^a-z0-9._-]', '', 'g'), ''),
      'parent'
    ) AS base
  ) s;
$$;

-- Assign in a stable order and suffix collisions, so re-running is a no-op.
WITH candidates AS (
  SELECT
    u.id,
    public.suggest_username_from_email(u.email) AS base,
    row_number() OVER (
      PARTITION BY public.suggest_username_from_email(u.email)
      ORDER BY u.created_at, u.id
    ) AS occurrence
  FROM public.users u
  WHERE u.role = 'parent' AND u.username IS NULL
)
UPDATE public.users u
SET username = CASE
  WHEN c.occurrence = 1 THEN c.base
  ELSE left(c.base, 32 - length(c.occurrence::text)) || c.occurrence::text
END
FROM candidates c
WHERE u.id = c.id
  AND NOT EXISTS (
    SELECT 1 FROM public.users taken
    WHERE lower(taken.username) = lower(
      CASE WHEN c.occurrence = 1 THEN c.base
           ELSE left(c.base, 32 - length(c.occurrence::text)) || c.occurrence::text END
    )
  );

/**
 * Resolves a username to the address its account actually authenticates with.
 *
 * Old accounts authenticate with their real email; new ones with a synthetic
 * <username>@parents.xo.local. The sign-in screen needs whichever applies before
 * it can call signInWithPassword, and that call happens in the browser, so the
 * lookup has to be reachable by anon. It returns nothing but the address, only
 * for parents, and only on an exact username match.
 */
CREATE OR REPLACE FUNCTION public.auth_email_for_username(p_username text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT au.email
  FROM public.users u
  JOIN auth.users au ON au.id = u.id
  WHERE u.role = 'parent'
    AND u.username IS NOT NULL
    AND lower(u.username) = lower(trim(p_username))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.auth_email_for_username(text) FROM public;
GRANT EXECUTE ON FUNCTION public.auth_email_for_username(text) TO anon, authenticated;

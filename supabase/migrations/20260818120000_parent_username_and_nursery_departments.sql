-- =============================================================================
-- Two additions for the reworked parent registration:
--
-- 1. users.username — parents now sign in with a username instead of an email.
--    Supabase Auth still requires an email, so signup mints a synthetic one
--    (<username>@parents.xo.local) and the login screen resolves a typed
--    username back to it. The real email stays on the row as contact detail.
--
-- 2. nurseries.departments — the signup form's "Department" list has been a
--    hardcoded English/French pair; nothing recorded which departments a
--    nursery actually offers. XO sets this when creating a nursery.
-- =============================================================================

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS username text;

-- Case-insensitive uniqueness: usernames are matched lowercased at sign-in.
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_key
  ON public.users (lower(username))
  WHERE username IS NOT NULL;

COMMENT ON COLUMN public.users.username IS 'Parent sign-in handle; auth email is <username>@parents.xo.local';

ALTER TABLE public.nurseries ADD COLUMN IF NOT EXISTS departments text[];

COMMENT ON COLUMN public.nurseries.departments IS 'Departments this nursery offers, shown in the parent signup form';

-- Existing nurseries keep the pair the form used to hardcode, so the dropdown
-- is never empty for a nursery created before this column existed.
UPDATE public.nurseries
SET departments = ARRAY['English', 'French']
WHERE departments IS NULL AND deleted_at IS NULL;

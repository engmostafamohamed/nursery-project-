-- Migration 032: Ensure users can ALWAYS read their own profile without recursion
-- This policy has HIGHEST priority and uses ONLY auth.uid() - no helper functions
-- Drop existing users_self_select and recreate it to ensure it's evaluated first

DROP POLICY IF EXISTS users_self_select ON public.users;

-- Recreate with explicit priority (Postgres evaluates policies in order)
-- This policy MUST succeed for profile lookups to work
CREATE POLICY users_self_select
  ON public.users
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Add comment
COMMENT ON POLICY users_self_select ON public.users IS 'Allow users to read their own profile - uses ONLY auth.uid() to avoid recursion';;

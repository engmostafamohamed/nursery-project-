-- =============================================================================
-- Fix: row_security GUC leak from RLS helper functions.
--
-- Several SECURITY DEFINER helpers run `SET LOCAL row_security = off` in their
-- body. Because row_security was NOT part of each function's SET clause, that
-- SET LOCAL was scoped to the whole transaction (not the function), so after the
-- first call row_security stayed OFF for the rest of the PostgREST request. A
-- later statement on an RLS table run by the non-bypass `authenticated` role
-- then failed with:
--     "query would be affected by row-level security policy for table users".
--
-- Adding `row_security = off` to each function's SET clause makes Postgres apply
-- it on entry and RESTORE the caller's value on exit, containing it to the
-- function and eliminating the leak. (The helpers are owned by postgres /
-- rolbypassrls, so they still read their tables without RLS as before.)
--
-- current_user_role / current_user_nursery_id are additionally rewritten to drop
-- the now-redundant in-body SET LOCAL.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  r public.user_role;
BEGIN
  SELECT u.role INTO r
  FROM public.users u
  WHERE u.id = auth.uid();
  RETURN r;
END;
$$;

CREATE OR REPLACE FUNCTION public.current_user_nursery_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  nid uuid;
BEGIN
  SELECT u.nursery_id INTO nid
  FROM public.users u
  WHERE u.id = auth.uid();
  RETURN nid;
END;
$$;

-- Contain the leak in every remaining helper without rewriting their bodies.
ALTER FUNCTION public.bootstrap_nursery_for_current_user(text, text, text, text, text, text) SET row_security = off;
ALTER FUNCTION public.current_user_chain_id() SET row_security = off;
ALTER FUNCTION public.is_xo_super_admin() SET row_security = off;
ALTER FUNCTION public.nursery_ids_for_chain_admin() SET row_security = off;
ALTER FUNCTION public.parent_accessible_class_ids() SET row_security = off;
ALTER FUNCTION public.parent_accessible_nursery_ids() SET row_security = off;
ALTER FUNCTION public.rls_authenticated_staff_sees_nursery(uuid) SET row_security = off;
ALTER FUNCTION public.rls_event_attendees_row_ok(uuid) SET row_security = off;
ALTER FUNCTION public.rls_media_parent_may_view(uuid) SET row_security = off;
ALTER FUNCTION public.rls_media_staff_media_row_ok(uuid) SET row_security = off;
ALTER FUNCTION public.rls_parent_has_child_in_class(uuid) SET row_security = off;
ALTER FUNCTION public.rls_parent_has_child_in_nursery(uuid) SET row_security = off;
ALTER FUNCTION public.rls_staff_can_access_child(uuid) SET row_security = off;
ALTER FUNCTION public.rls_staff_manages_nursery(uuid) SET row_security = off;
ALTER FUNCTION public.teacher_assigned_class_ids() SET row_security = off;
ALTER FUNCTION public.user_has_feature(text) SET row_security = off;

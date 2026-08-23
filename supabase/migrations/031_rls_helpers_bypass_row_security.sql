-- Migration 031: Stop RLS recursion via helper functions reading public.users / public.nurseries
--
-- Root cause: LANGUAGE sql SECURITY DEFINER helpers still evaluate RLS as the invoker for those
-- tables in this environment. Policies on public.users (e.g. users_branch_admin_all) call
-- current_user_role() and current_user_nursery_id(), which SELECT public.users again → infinite
-- recursion. SELECT on public.children triggers children_branch_admin_all → same helpers → users
-- policies → helpers → ... Postgres often reports "relation children" because that is the outer
-- query's table.
--
-- Fix: Same pattern as 029 (parent_can_access_child): plpgsql + SET LOCAL row_security = off
-- around the trusted reads only.

CREATE OR REPLACE FUNCTION public.is_xo_super_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  SET LOCAL row_security = off;
  RETURN EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role = 'xo_super_admin'::public.user_role
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  r public.user_role;
BEGIN
  SET LOCAL row_security = off;
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
STABLE
AS $$
DECLARE
  nid uuid;
BEGIN
  SET LOCAL row_security = off;
  SELECT u.nursery_id INTO nid
  FROM public.users u
  WHERE u.id = auth.uid();
  RETURN nid;
END;
$$;

CREATE OR REPLACE FUNCTION public.current_user_chain_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  cid uuid;
BEGIN
  SET LOCAL row_security = off;
  SELECT u.chain_id INTO cid
  FROM public.users u
  WHERE u.id = auth.uid();
  RETURN cid;
END;
$$;

CREATE OR REPLACE FUNCTION public.nursery_ids_for_chain_admin()
RETURNS SETOF uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  SET LOCAL row_security = off;
  RETURN QUERY
  SELECT n.id
  FROM public.nurseries n
  WHERE n.chain_id = (
    SELECT u.chain_id
    FROM public.users u
    WHERE u.id = auth.uid()
  );
END;
$$;

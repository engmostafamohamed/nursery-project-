-- Migration 044: Break children ↔ parent_children RLS recursion
--
-- Problem: children_parents_select (043) used an inline subquery on parent_children.
-- Evaluating parent_children RLS re-entered children via EXISTS(...) policies on parent_children.
--
-- Fix: Drop that policy, add SECURITY DEFINER helper with SET LOCAL row_security = off
-- (same pattern as 029 parent_can_access_child), then recreate children_parents_select
-- to call only the helper — no RLS during parent_children / users / children reads inside the helper.

DROP POLICY IF EXISTS children_parents_select ON public.children;

CREATE OR REPLACE FUNCTION public.user_can_access_child(p_child_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  user_role public.user_role;
BEGIN
  SET LOCAL row_security = off;

  SELECT u.role INTO user_role
  FROM public.users u
  WHERE u.id = auth.uid();

  IF user_role IS NULL THEN
    RETURN false;
  END IF;

  -- Parents: link via parent_children (RLS bypassed above)
  IF user_role = 'parent'::public.user_role THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.parent_children pc
      WHERE pc.parent_id = auth.uid()
        AND pc.child_id = p_child_id
    );
  END IF;

  -- Branch admin: same nursery as child (single EXISTS; no policy re-entry)
  IF user_role = 'branch_admin'::public.user_role THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.children c
      INNER JOIN public.users u ON u.id = auth.uid()
      WHERE c.id = p_child_id
        AND c.nursery_id = u.nursery_id
    );
  END IF;

  IF user_role = 'xo_super_admin'::public.user_role THEN
    RETURN true;
  END IF;

  -- Chain admin: child in any nursery of the chain (aligns with children_admins_all)
  IF user_role = 'chain_super_admin'::public.user_role THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.children c
      WHERE c.id = p_child_id
        AND c.nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
    );
  END IF;

  -- Teacher / other: this policy does not grant; children_admins_all covers staff
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.user_can_access_child(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_access_child(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_access_child(uuid) TO service_role;

CREATE POLICY children_parents_select
  ON public.children
  FOR SELECT
  TO authenticated
  USING (public.user_can_access_child(id));

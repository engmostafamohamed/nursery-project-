-- Migration 044: Break children ↔ parent_children recursion cycle
-- Replaces inline parent_children query with SECURITY DEFINER helper that bypasses RLS

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

COMMENT ON FUNCTION public.user_can_access_child IS 'SECURITY DEFINER helper with RLS bypass - prevents children ↔ parent_children recursion';
COMMENT ON POLICY children_parents_select ON children IS 'Uses helper function to avoid RLS recursion with parent_children table';;

-- Migration: Fix children RLS using SECURITY DEFINER helper (final fix)

-- Create a simple helper that gets user's role and nursery WITHOUT querying children
CREATE OR REPLACE FUNCTION get_user_access_scope()
RETURNS TABLE(role user_role, nursery_id uuid, chain_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  -- Disable RLS for this function
  SELECT u.role, u.nursery_id, u.chain_id
  FROM users u
  WHERE u.id = auth.uid();
$$;

-- Drop and recreate children policies
DROP POLICY IF EXISTS children_staff_all ON children;
DROP POLICY IF EXISTS children_parents_select ON children;

-- Staff policy using the helper
CREATE POLICY children_staff_all
  ON children
  FOR ALL
  TO authenticated
  USING (
    -- Use the helper to get user scope
    CASE (SELECT role FROM get_user_access_scope())
      WHEN 'xo_super_admin' THEN true
      WHEN 'chain_super_admin' THEN 
        nursery_id IN (
          SELECT n.id FROM nurseries n
          INNER JOIN get_user_access_scope() u ON n.chain_id = u.chain_id
        )
      WHEN 'branch_admin' THEN
        nursery_id = (SELECT nursery_id FROM get_user_access_scope())
      WHEN 'teacher' THEN
        nursery_id = (SELECT nursery_id FROM get_user_access_scope())
      ELSE false
    END
  )
  WITH CHECK (
    -- Same logic for inserts/updates
    CASE (SELECT role FROM get_user_access_scope())
      WHEN 'xo_super_admin' THEN true
      WHEN 'chain_super_admin' THEN 
        nursery_id IN (
          SELECT n.id FROM nurseries n
          INNER JOIN get_user_access_scope() u ON n.chain_id = u.chain_id
        )
      WHEN 'branch_admin' THEN
        nursery_id = (SELECT nursery_id FROM get_user_access_scope())
      WHEN 'teacher' THEN
        nursery_id = (SELECT nursery_id FROM get_user_access_scope())
      ELSE false
    END
  );

-- Parent policy (already non-recursive)
CREATE POLICY children_parents_select
  ON children
  FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM get_user_access_scope()) = 'parent'
    AND EXISTS (
      SELECT 1 FROM parent_children pc
      WHERE pc.child_id = children.id AND pc.parent_id = auth.uid()
    )
  );

COMMENT ON FUNCTION get_user_access_scope() IS 
'SECURITY DEFINER helper to get current user role/nursery/chain without RLS recursion';

COMMENT ON POLICY children_staff_all ON children IS 
'Non-recursive multi-tenant RLS using SECURITY DEFINER helper';

COMMENT ON POLICY children_parents_select ON children IS 
'Non-recursive parent access via direct parent_children join';;

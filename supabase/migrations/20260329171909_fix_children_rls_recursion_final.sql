-- Migration: Fix infinite recursion in children table RLS
-- The recursion happens when policies call functions that query children again

-- Drop ALL existing children policies
DROP POLICY IF EXISTS children_staff_all ON children;
DROP POLICY IF EXISTS children_parents_select ON children;
DROP POLICY IF EXISTS children_service_all ON children;

-- Create non-recursive staff policy using direct EXISTS checks
CREATE POLICY children_staff_all
  ON children
  FOR ALL
  TO authenticated
  USING (
    -- XO super admin can see all
    (SELECT role FROM users WHERE id = auth.uid()) = 'xo_super_admin'
    OR
    -- Chain super admin can see children in their chain
    (
      (SELECT role FROM users WHERE id = auth.uid()) = 'chain_super_admin'
      AND nursery_id IN (
        SELECT n.id FROM nurseries n
        WHERE n.chain_id = (SELECT chain_id FROM users WHERE id = auth.uid())
      )
    )
    OR
    -- Branch admin and teacher can see children in their nursery
    (
      (SELECT role FROM users WHERE id = auth.uid()) IN ('branch_admin', 'teacher')
      AND nursery_id = (SELECT nursery_id FROM users WHERE id = auth.uid())
    )
  )
  WITH CHECK (
    -- XO super admin can modify all
    (SELECT role FROM users WHERE id = auth.uid()) = 'xo_super_admin'
    OR
    -- Chain super admin can modify children in their chain
    (
      (SELECT role FROM users WHERE id = auth.uid()) = 'chain_super_admin'
      AND nursery_id IN (
        SELECT n.id FROM nurseries n
        WHERE n.chain_id = (SELECT chain_id FROM users WHERE id = auth.uid())
      )
    )
    OR
    -- Branch admin and teacher can modify children in their nursery
    (
      (SELECT role FROM users WHERE id = auth.uid()) IN ('branch_admin', 'teacher')
      AND nursery_id = (SELECT nursery_id FROM users WHERE id = auth.uid())
    )
  );

-- Create non-recursive parent policy using direct parent_children join
CREATE POLICY children_parents_select
  ON children
  FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid()) = 'parent'
    AND EXISTS (
      SELECT 1
      FROM parent_children pc
      WHERE pc.child_id = children.id
        AND pc.parent_id = auth.uid()
    )
  );

-- Service role gets full access
CREATE POLICY children_service_all
  ON children
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Add comments
COMMENT ON POLICY children_staff_all ON children IS 
'Non-recursive multi-tenant RLS: Staff can access children in their scope using direct user table queries (no helper functions).';

COMMENT ON POLICY children_parents_select ON children IS 
'Non-recursive parent access: Parents can only see their own children via direct parent_children join.';;

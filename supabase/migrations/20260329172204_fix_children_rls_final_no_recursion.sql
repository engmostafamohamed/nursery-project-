-- Migration: FINAL fix for children RLS - completely remove all recursion

-- Drop ALL policies first
DROP POLICY IF EXISTS children_staff_all ON children;
DROP POLICY IF EXISTS children_parents_select ON children;
DROP POLICY IF EXISTS children_service_all ON children;

-- Drop the helper function that might still cause issues
DROP FUNCTION IF EXISTS get_user_access_scope();

-- Create completely non-recursive policies using auth.uid() and direct subqueries
CREATE POLICY children_staff_all
  ON children
  FOR ALL
  TO authenticated
  USING (
    -- Bypass RLS for non-parents by checking role directly from users table
    auth.uid() IN (
      SELECT u.id FROM users u
      WHERE u.id = auth.uid()
      AND u.role != 'parent'
      AND (
        -- XO super admin sees all
        u.role = 'xo_super_admin'
        OR
        -- Chain super admin sees children in their chain
        (u.role = 'chain_super_admin' AND nursery_id IN (
          SELECT n.id FROM nurseries n WHERE n.chain_id = u.chain_id
        ))
        OR
        -- Branch admin/teacher sees children in their nursery
        ((u.role = 'branch_admin' OR u.role = 'teacher') AND nursery_id = u.nursery_id)
      )
    )
  )
  WITH CHECK (
    auth.uid() IN (
      SELECT u.id FROM users u
      WHERE u.id = auth.uid()
      AND u.role != 'parent'
      AND (
        u.role = 'xo_super_admin'
        OR
        (u.role = 'chain_super_admin' AND nursery_id IN (
          SELECT n.id FROM nurseries n WHERE n.chain_id = u.chain_id
        ))
        OR
        ((u.role = 'branch_admin' OR u.role = 'teacher') AND nursery_id = u.nursery_id)
      )
    )
  );

-- Parent policy - simple parent_children join
CREATE POLICY children_parents_select
  ON children
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT u.id FROM users u
      WHERE u.id = auth.uid() AND u.role = 'parent'
    )
    AND id IN (
      SELECT child_id FROM parent_children WHERE parent_id = auth.uid()
    )
  );

-- Service role bypass
CREATE POLICY children_service_all
  ON children
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON POLICY children_staff_all ON children IS
'Multi-tenant RLS: Staff access using direct subqueries - no helper functions';

COMMENT ON POLICY children_parents_select ON children IS  
'Parent access via direct parent_children join - no helper functions';;

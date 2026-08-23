-- FINAL FIX: Children policies should use helper functions, NOT direct user subqueries
-- Helper functions already have SET LOCAL row_security = off so they break the recursion

-- Drop current policies that directly query users table
DROP POLICY IF EXISTS children_branch_admin ON children;
DROP POLICY IF EXISTS children_chain_admin ON children;
DROP POLICY IF EXISTS children_parent ON children;
DROP POLICY IF EXISTS children_teacher ON children;
DROP POLICY IF EXISTS children_xo_admin ON children;
DROP POLICY IF EXISTS children_service ON children;

-- Create policies using helper functions (current_user_role, etc)
-- These helpers have SET LOCAL row_security = off so NO recursion

-- XO Super Admin sees all
CREATE POLICY children_xo_admin ON children
  FOR ALL
  TO authenticated
  USING (is_xo_super_admin())
  WITH CHECK (is_xo_super_admin());

-- Chain super admin sees children in their chain
CREATE POLICY children_chain_admin ON children
  FOR ALL
  TO authenticated
  USING (
    current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT nursery_ids_for_chain_admin())
  )
  WITH CHECK (
    current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT nursery_ids_for_chain_admin())
  );

-- Branch admin sees children in their nursery
CREATE POLICY children_branch_admin ON children
  FOR ALL
  TO authenticated
  USING (
    current_user_role() = 'branch_admin'
    AND nursery_id = current_user_nursery_id()
  )
  WITH CHECK (
    current_user_role() = 'branch_admin'
    AND nursery_id = current_user_nursery_id()
  );

-- Teacher sees children in their classes
CREATE POLICY children_teacher ON children
  FOR SELECT
  TO authenticated
  USING (
    current_user_role() = 'teacher'
    AND class_id IN (
      SELECT cl.id FROM classes cl
      WHERE cl.teacher_id = auth.uid()
        AND cl.nursery_id = children.nursery_id
    )
  );

-- Parent sees their own children
CREATE POLICY children_parent ON children
  FOR SELECT
  TO authenticated
  USING (
    current_user_role() = 'parent'
    AND id IN (
      SELECT pc.child_id FROM parent_children pc
      WHERE pc.parent_id = auth.uid()
    )
  );

-- Service role bypass
CREATE POLICY children_service ON children
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON POLICY children_xo_admin ON children IS 
'XO admin using is_xo_super_admin() helper - no recursion';

COMMENT ON POLICY children_branch_admin ON children IS 
'Branch admin using current_user_role() and current_user_nursery_id() helpers - no recursion';;

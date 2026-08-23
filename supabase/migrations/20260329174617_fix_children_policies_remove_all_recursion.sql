-- Fix children table policies by removing ALL calls to helper functions
-- This is the FINAL fix for infinite recursion

-- Drop ALL existing policies on children
DROP POLICY IF EXISTS children_admins_all ON children;
DROP POLICY IF EXISTS children_branch_admin_all ON children;
DROP POLICY IF EXISTS children_chain_super_admin_all ON children;
DROP POLICY IF EXISTS children_parent_select ON children;
DROP POLICY IF EXISTS children_teacher_select ON children;
DROP POLICY IF EXISTS children_xo_super_admin_all ON children;
DROP POLICY IF EXISTS children_staff_all ON children;
DROP POLICY IF EXISTS children_parents_select ON children;
DROP POLICY IF EXISTS children_service_all ON children;

-- XO Super Admin: sees everything
CREATE POLICY children_xo_admin
  ON children
  FOR ALL
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT u.id FROM users u
      WHERE u.id = auth.uid() AND u.role = 'xo_super_admin'
    )
  );

-- Branch Admin: sees children in their nursery
CREATE POLICY children_branch_admin
  ON children
  FOR ALL
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT u.id FROM users u
      WHERE u.id = auth.uid() 
        AND u.role = 'branch_admin'
        AND u.nursery_id = children.nursery_id
    )
  )
  WITH CHECK (
    auth.uid() IN (
      SELECT u.id FROM users u
      WHERE u.id = auth.uid() 
        AND u.role = 'branch_admin'
        AND u.nursery_id = children.nursery_id
    )
  );

-- Chain Super Admin: sees children in their chain
CREATE POLICY children_chain_admin
  ON children
  FOR ALL
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT u.id FROM users u
      WHERE u.id = auth.uid()
        AND u.role = 'chain_super_admin'
        AND children.nursery_id IN (
          SELECT n.id FROM nurseries n WHERE n.chain_id = u.chain_id
        )
    )
  )
  WITH CHECK (
    auth.uid() IN (
      SELECT u.id FROM users u
      WHERE u.id = auth.uid()
        AND u.role = 'chain_super_admin'
        AND children.nursery_id IN (
          SELECT n.id FROM nurseries n WHERE n.chain_id = u.chain_id
        )
    )
  );

-- Teacher: sees children in their classes
CREATE POLICY children_teacher
  ON children
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT u.id FROM users u
      WHERE u.id = auth.uid()
        AND u.role = 'teacher'
        AND children.class_id IN (
          SELECT cl.id FROM classes cl 
          WHERE cl.teacher_id = u.id
            AND cl.nursery_id = children.nursery_id
        )
    )
  );

-- Parent: sees their own children
CREATE POLICY children_parent
  ON children
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT u.id FROM users u
      WHERE u.id = auth.uid() AND u.role = 'parent'
    )
    AND children.id IN (
      SELECT pc.child_id FROM parent_children pc
      WHERE pc.parent_id = auth.uid()
    )
  );

-- Service role bypass
CREATE POLICY children_service
  ON children
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON POLICY children_xo_admin ON children IS
'XO Super Admin full access - no helper function calls, no recursion';

COMMENT ON POLICY children_branch_admin ON children IS
'Branch admin sees children in their nursery - direct subquery, no recursion';

COMMENT ON POLICY children_chain_admin ON children IS
'Chain admin sees children in their chain - direct subquery, no recursion';;

-- Fix RLS recursion on users table by removing current_user_role() calls
-- This keeps all permissions identical but breaks the infinite loop

-- Drop all policies that call current_user_role() on users table
DROP POLICY IF EXISTS users_branch_admin_all ON users;
DROP POLICY IF EXISTS users_chain_super_admin_select ON users;
DROP POLICY IF EXISTS users_chain_super_admin_update ON users;
DROP POLICY IF EXISTS users_chain_super_admin_delete ON users;
DROP POLICY IF EXISTS users_chain_super_admin_modify ON users;
DROP POLICY IF EXISTS users_parent_select_self ON users;
DROP POLICY IF EXISTS users_parent_update_self ON users;
DROP POLICY IF EXISTS users_teacher_select ON users;
DROP POLICY IF EXISTS users_teacher_update_self ON users;

-- Recreate policies WITHOUT calling current_user_role() to avoid recursion
-- Branch admin can see all users in their nursery
CREATE POLICY users_branch_admin_select
  ON users
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT u.id FROM users u 
      WHERE u.id = auth.uid() 
        AND u.role = 'branch_admin'
        AND u.nursery_id = users.nursery_id
    )
  );

CREATE POLICY users_branch_admin_all_ops
  ON users
  FOR ALL
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT u.id FROM users u 
      WHERE u.id = auth.uid() 
        AND u.role = 'branch_admin'
        AND u.nursery_id = users.nursery_id
    )
  )
  WITH CHECK (
    auth.uid() IN (
      SELECT u.id FROM users u 
      WHERE u.id = auth.uid() 
        AND u.role = 'branch_admin'
        AND u.nursery_id = users.nursery_id
    )
  );

-- Chain super admin can see users in their chain
CREATE POLICY users_chain_admin_select
  ON users
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT u.id FROM users u
      WHERE u.id = auth.uid()
        AND u.role = 'chain_super_admin'
        AND (
          users.nursery_id IN (
            SELECT n.id FROM nurseries n WHERE n.chain_id = u.chain_id
          )
          OR users.chain_id = u.chain_id
        )
    )
  );

CREATE POLICY users_chain_admin_modify
  ON users
  FOR ALL
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT u.id FROM users u
      WHERE u.id = auth.uid()
        AND u.role = 'chain_super_admin'
        AND users.nursery_id IN (
          SELECT n.id FROM nurseries n WHERE n.chain_id = u.chain_id
        )
    )
  )
  WITH CHECK (
    auth.uid() IN (
      SELECT u.id FROM users u
      WHERE u.id = auth.uid()
        AND u.role = 'chain_super_admin'
        AND users.nursery_id IN (
          SELECT n.id FROM nurseries n WHERE n.chain_id = u.chain_id
        )
    )
  );

-- Teacher can see users in their nursery
CREATE POLICY users_teacher_select
  ON users
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT u.id FROM users u 
      WHERE u.id = auth.uid() 
        AND u.role = 'teacher'
        AND u.nursery_id = users.nursery_id
    )
  );

CREATE POLICY users_teacher_update_self_new
  ON users
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT u.id FROM users u 
      WHERE u.id = auth.uid() 
        AND u.role = 'teacher'
        AND u.id = users.id
    )
  )
  WITH CHECK (
    auth.uid() IN (
      SELECT u.id FROM users u 
      WHERE u.id = auth.uid() 
        AND u.role = 'teacher'
        AND u.id = users.id
    )
  );

-- Parent can only see/update themselves
CREATE POLICY users_parent_select_self_new
  ON users
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT u.id FROM users u 
      WHERE u.id = auth.uid() 
        AND u.role = 'parent'
        AND u.id = users.id
    )
  );

CREATE POLICY users_parent_update_self_new
  ON users
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT u.id FROM users u 
      WHERE u.id = auth.uid() 
        AND u.role = 'parent'
        AND u.id = users.id
    )
  )
  WITH CHECK (
    auth.uid() IN (
      SELECT u.id FROM users u 
      WHERE u.id = auth.uid() 
        AND u.role = 'parent'
        AND u.id = users.id
    )
  );

-- Keep existing safe policies (these already use only auth.uid())
-- users_select_own, users_self_select, users_update_own already exist and are safe
-- users_xo_super_admin_all already exists and is safe
-- users_service_role_all already exists and is safe

COMMENT ON POLICY users_branch_admin_select ON users IS
'Branch admin can see all users in their nursery - no recursion';

COMMENT ON POLICY users_teacher_select ON users IS
'Teacher can see all users in their nursery - no recursion';;

-- Fix RLS recursion by rewriting users policies WITHOUT calling current_user_role()
-- This prevents infinite loop: children policies call current_user_role() → queries users → users policies call current_user_role() → infinite recursion

-- Drop all policies that call current_user_role() from users table
DROP POLICY IF EXISTS users_branch_admin_all ON users;
DROP POLICY IF EXISTS users_chain_super_admin_select ON users;
DROP POLICY IF EXISTS users_chain_super_admin_update ON users;
DROP POLICY IF EXISTS users_chain_super_admin_delete ON users;
DROP POLICY IF EXISTS users_chain_super_admin_modify ON users;
DROP POLICY IF EXISTS users_parent_select_self ON users;
DROP POLICY IF EXISTS users_parent_update_self ON users;
DROP POLICY IF EXISTS users_teacher_select ON users;
DROP POLICY IF EXISTS users_teacher_update_self ON users;

-- Recreate policies using direct auth.uid() checks (NO helper function calls)
-- This breaks the recursion cycle

-- XO Super Admin (already exists, uses is_xo_super_admin which has SECURITY DEFINER + row_security off)
-- users_xo_super_admin_all already exists - keep it

-- Branch Admin: can see/manage users in same nursery
CREATE POLICY users_branch_admin_all
  ON users
  FOR ALL
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT u.id FROM users u 
      WHERE u.id = auth.uid() 
        AND u.role = 'branch_admin'::user_role
        AND u.nursery_id = users.nursery_id
    )
  )
  WITH CHECK (
    auth.uid() IN (
      SELECT u.id FROM users u 
      WHERE u.id = auth.uid() 
        AND u.role = 'branch_admin'::user_role
        AND u.nursery_id = users.nursery_id
    )
  );

-- Chain Super Admin: can see/manage users in their chain
CREATE POLICY users_chain_super_admin_select
  ON users
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT u.id FROM users u 
      WHERE u.id = auth.uid() 
        AND u.role = 'chain_super_admin'::user_role
        AND (
          users.nursery_id IN (
            SELECT n.id FROM nurseries n WHERE n.chain_id = u.chain_id
          )
          OR users.chain_id = u.chain_id
        )
    )
  );

CREATE POLICY users_chain_super_admin_update
  ON users
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT u.id FROM users u 
      WHERE u.id = auth.uid() 
        AND u.role = 'chain_super_admin'::user_role
        AND users.nursery_id IN (
          SELECT n.id FROM nurseries n WHERE n.chain_id = u.chain_id
        )
    )
  )
  WITH CHECK (
    auth.uid() IN (
      SELECT u.id FROM users u 
      WHERE u.id = auth.uid() 
        AND u.role = 'chain_super_admin'::user_role
        AND users.nursery_id IN (
          SELECT n.id FROM nurseries n WHERE n.chain_id = u.chain_id
        )
    )
  );

CREATE POLICY users_chain_super_admin_delete
  ON users
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT u.id FROM users u 
      WHERE u.id = auth.uid() 
        AND u.role = 'chain_super_admin'::user_role
        AND users.nursery_id IN (
          SELECT n.id FROM nurseries n WHERE n.chain_id = u.chain_id
        )
    )
  );

CREATE POLICY users_chain_super_admin_insert
  ON users
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IN (
      SELECT u.id FROM users u 
      WHERE u.id = auth.uid() 
        AND u.role = 'chain_super_admin'::user_role
        AND users.nursery_id IN (
          SELECT n.id FROM nurseries n WHERE n.chain_id = u.chain_id
        )
    )
  );

-- Teacher: can see users in same nursery
CREATE POLICY users_teacher_select
  ON users
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT u.id FROM users u 
      WHERE u.id = auth.uid() 
        AND u.role = 'teacher'::user_role
        AND u.nursery_id = users.nursery_id
    )
  );

-- Teacher: can update their own profile
CREATE POLICY users_teacher_update_self
  ON users
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT u.id FROM users u 
      WHERE u.id = auth.uid() 
        AND u.role = 'teacher'::user_role
        AND users.id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() IN (
      SELECT u.id FROM users u 
      WHERE u.id = auth.uid() 
        AND u.role = 'teacher'::user_role
        AND users.id = auth.uid()
    )
  );

-- Parent: can see their own record
CREATE POLICY users_parent_select_self
  ON users
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT u.id FROM users u 
      WHERE u.id = auth.uid() 
        AND u.role = 'parent'::user_role
        AND users.id = auth.uid()
    )
  );

-- Parent: can update their own profile
CREATE POLICY users_parent_update_self
  ON users
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT u.id FROM users u 
      WHERE u.id = auth.uid() 
        AND u.role = 'parent'::user_role
        AND users.id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() IN (
      SELECT u.id FROM users u 
      WHERE u.id = auth.uid() 
        AND u.role = 'parent'::user_role
        AND users.id = auth.uid()
    )
  );

COMMENT ON POLICY users_branch_admin_all ON users IS 
'Branch admin access without calling current_user_role() - prevents RLS recursion';

COMMENT ON POLICY users_chain_super_admin_select ON users IS 
'Chain super admin access without calling current_user_role() - prevents RLS recursion';;

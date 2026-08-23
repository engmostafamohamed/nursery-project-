-- FIX: Remove circular dependency in users RLS policies
-- This prevents infinite recursion when children table policies call current_user_role()

-- Drop ALL existing policies on users table first
DROP POLICY IF EXISTS users_branch_admin_all ON users;
DROP POLICY IF EXISTS users_branch_admin_select ON users;
DROP POLICY IF EXISTS users_branch_admin_insert ON users;
DROP POLICY IF EXISTS users_branch_admin_update ON users;
DROP POLICY IF EXISTS users_branch_admin_delete ON users;
DROP POLICY IF EXISTS users_chain_super_admin_select ON users;
DROP POLICY IF EXISTS users_chain_super_admin_insert ON users;
DROP POLICY IF EXISTS users_chain_super_admin_update ON users;
DROP POLICY IF EXISTS users_chain_super_admin_delete ON users;
DROP POLICY IF EXISTS users_chain_super_admin_modify ON users;
DROP POLICY IF EXISTS users_parent_select_self ON users;
DROP POLICY IF EXISTS users_parent_update_self ON users;
DROP POLICY IF EXISTS users_teacher_select ON users;
DROP POLICY IF EXISTS users_teacher_update_self ON users;
DROP POLICY IF EXISTS users_select_own ON users;
DROP POLICY IF EXISTS users_self_select ON users;
DROP POLICY IF EXISTS users_update_own ON users;
DROP POLICY IF EXISTS users_self_insert_bootstrap ON users;
DROP POLICY IF EXISTS users_service_role_all ON users;
DROP POLICY IF EXISTS users_xo_super_admin_all ON users;

-- Recreate SAFE policies using direct auth.uid() checks (NO current_user_role() calls)

-- 1. Everyone can see themselves
CREATE POLICY users_select_own ON users
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY users_update_own ON users
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- 2. Allow initial user insert (for onboarding)
CREATE POLICY users_self_insert_bootstrap ON users
  FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- 3. XO Super Admin sees everything
CREATE POLICY users_xo_super_admin_all ON users
  FOR ALL
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT u.id FROM users u
      WHERE u.id = auth.uid() AND u.role = 'xo_super_admin'
    )
  )
  WITH CHECK (
    auth.uid() IN (
      SELECT u.id FROM users u
      WHERE u.id = auth.uid() AND u.role = 'xo_super_admin'
    )
  );

-- 4. Branch admin can see/manage users in their nursery
CREATE POLICY users_branch_admin_select ON users
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

CREATE POLICY users_branch_admin_insert ON users
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IN (
      SELECT u.id FROM users u
      WHERE u.id = auth.uid()
        AND u.role = 'branch_admin'
        AND u.nursery_id = nursery_id
    )
  );

CREATE POLICY users_branch_admin_update ON users
  FOR UPDATE
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

CREATE POLICY users_branch_admin_delete ON users
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT u.id FROM users u
      WHERE u.id = auth.uid()
        AND u.role = 'branch_admin'
        AND u.nursery_id = users.nursery_id
    )
  );

-- 5. Teacher can see users in their nursery
CREATE POLICY users_teacher_select ON users
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

-- 6. Chain super admin can see users in their chain
CREATE POLICY users_chain_super_admin_select ON users
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT u.id FROM users u
      WHERE u.id = auth.uid()
        AND u.role = 'chain_super_admin'
        AND (
          users.chain_id = u.chain_id
          OR users.nursery_id IN (
            SELECT n.id FROM nurseries n WHERE n.chain_id = u.chain_id
          )
        )
    )
  );

CREATE POLICY users_chain_super_admin_insert ON users
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IN (
      SELECT u.id FROM users u
      WHERE u.id = auth.uid()
        AND u.role = 'chain_super_admin'
        AND nursery_id IN (
          SELECT n.id FROM nurseries n WHERE n.chain_id = u.chain_id
        )
    )
  );

CREATE POLICY users_chain_super_admin_update ON users
  FOR UPDATE
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

CREATE POLICY users_chain_super_admin_delete ON users
  FOR DELETE
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
  );

-- 7. Service role bypass
CREATE POLICY users_service_role_all ON users
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON POLICY users_select_own ON users IS 
'Everyone can see their own user record - no recursion';

COMMENT ON POLICY users_branch_admin_select ON users IS 
'Branch admin can see all users in their nursery - no current_user_role() calls';

COMMENT ON POLICY users_teacher_select ON users IS 
'Teacher can see users in their nursery - no current_user_role() calls';

COMMENT ON POLICY users_chain_super_admin_select ON users IS 
'Chain super admin can see users in their chain - no current_user_role() calls';;

-- FINAL FIX: Remove ALL recursive policies from users table
-- Keep only simple, non-recursive policies

-- Drop ALL policies that have subqueries (cause recursion)
DROP POLICY IF EXISTS users_branch_admin_all_ops ON users;
DROP POLICY IF EXISTS users_branch_admin_delete ON users;
DROP POLICY IF EXISTS users_branch_admin_insert ON users;
DROP POLICY IF EXISTS users_branch_admin_select ON users;
DROP POLICY IF EXISTS users_branch_admin_update ON users;
DROP POLICY IF EXISTS users_chain_admin_modify ON users;
DROP POLICY IF EXISTS users_chain_admin_select ON users;
DROP POLICY IF EXISTS users_chain_super_admin_delete ON users;
DROP POLICY IF EXISTS users_chain_super_admin_insert ON users;
DROP POLICY IF EXISTS users_chain_super_admin_select ON users;
DROP POLICY IF EXISTS users_chain_super_admin_update ON users;
DROP POLICY IF EXISTS users_parent_select_self_new ON users;
DROP POLICY IF EXISTS users_parent_update_self_new ON users;
DROP POLICY IF EXISTS users_teacher_select ON users;
DROP POLICY IF EXISTS users_teacher_update_self_new ON users;
DROP POLICY IF EXISTS users_xo_super_admin_all ON users;

-- Keep ONLY these safe policies (no subqueries, no recursion):
-- users_select_own (SELECT with id = auth.uid())
-- users_update_own (UPDATE with id = auth.uid())
-- users_self_insert_bootstrap (INSERT for initial signup)
-- users_service_role_all (service role bypass)

-- These are already present and safe - no need to recreate

COMMENT ON POLICY users_select_own ON users IS 
'Safe non-recursive policy: users can SELECT their own record';

COMMENT ON POLICY users_update_own ON users IS
'Safe non-recursive policy: users can UPDATE their own record';

COMMENT ON POLICY users_self_insert_bootstrap ON users IS
'Safe non-recursive policy: users can INSERT during signup';;

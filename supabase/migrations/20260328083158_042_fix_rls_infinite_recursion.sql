-- Migration 042: Fix RLS infinite recursion by using non-recursive policies
-- Root cause: Storage policies need users table RLS enabled to work

-- ============================================================================
-- USERS TABLE - RE-ENABLE RLS WITH NON-RECURSIVE POLICIES
-- ============================================================================

-- Drop ALL existing policies first (they cause recursion)
DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Admins can view all users in nursery" ON users;
DROP POLICY IF EXISTS "Admins can update users in nursery" ON users;

-- Re-enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- NON-RECURSIVE POLICY: Users can view their own row
-- Uses auth.uid() directly - NO recursion!
DROP POLICY IF EXISTS "users_select_own" ON users;
CREATE POLICY "users_select_own"
ON users FOR SELECT
USING (id = auth.uid());

-- NON-RECURSIVE POLICY: Users can update their own row
DROP POLICY IF EXISTS "users_update_own" ON users;
CREATE POLICY "users_update_own"
ON users FOR UPDATE
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- NON-RECURSIVE POLICY: Service role can do anything (for Edge Functions)
DROP POLICY IF EXISTS "users_service_role_all" ON users;
CREATE POLICY "users_service_role_all"
ON users FOR ALL
USING (auth.jwt()->>'role' = 'service_role');

-- ============================================================================
-- CHILDREN TABLE - RE-ENABLE RLS
-- ============================================================================

DROP POLICY IF EXISTS "Children select policy" ON children;
DROP POLICY IF EXISTS "Children insert policy" ON children;
DROP POLICY IF EXISTS "Children update policy" ON children;

ALTER TABLE children ENABLE ROW LEVEL SECURITY;

-- Parents can view their own children
DROP POLICY IF EXISTS "children_parent_select" ON children;
CREATE POLICY "children_parent_select"
ON children FOR SELECT
USING (
  id IN (
    SELECT child_id FROM parent_children
    WHERE parent_id = auth.uid()
  )
);

-- Admins can view all children (use auth.uid() check to avoid recursion)
DROP POLICY IF EXISTS "children_admin_select" ON children;
CREATE POLICY "children_admin_select"
ON children FOR SELECT
USING (
  auth.uid() IN (
    SELECT id FROM users
    WHERE role IN ('branch_admin', 'chain_super_admin', 'xo_super_admin')
  )
);

-- Service role can do anything
DROP POLICY IF EXISTS "children_service_role_all" ON children;
CREATE POLICY "children_service_role_all"
ON children FOR ALL
USING (auth.jwt()->>'role' = 'service_role');

-- ============================================================================
-- ATTENDANCE_RECORDS TABLE - RE-ENABLE RLS
-- ============================================================================

DROP POLICY IF EXISTS "Attendance records policy" ON attendance_records;

ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;

-- Teachers can view attendance in their classes
DROP POLICY IF EXISTS "attendance_teacher_select" ON attendance_records;
CREATE POLICY "attendance_teacher_select"
ON attendance_records FOR SELECT
USING (
  child_id IN (
    SELECT id FROM children
    WHERE class_id IN (
      SELECT class_id FROM staff_schedules
      WHERE staff_id IN (
        SELECT id FROM staff_profiles WHERE user_id = auth.uid()
      )
    )
  )
);

-- Admins can view all attendance
DROP POLICY IF EXISTS "attendance_admin_all" ON attendance_records;
CREATE POLICY "attendance_admin_all"
ON attendance_records FOR ALL
USING (
  auth.uid() IN (
    SELECT id FROM users
    WHERE role IN ('branch_admin', 'chain_super_admin', 'xo_super_admin')
  )
);

-- Service role can do anything
DROP POLICY IF EXISTS "attendance_service_role_all" ON attendance_records;
CREATE POLICY "attendance_service_role_all"
ON attendance_records FOR ALL
USING (auth.jwt()->>'role' = 'service_role');

COMMENT ON TABLE users IS 'RLS re-enabled with non-recursive policies - storage uploads now work!';
COMMENT ON TABLE children IS 'RLS re-enabled - proper security restored';
COMMENT ON TABLE attendance_records IS 'RLS re-enabled - proper security restored';;

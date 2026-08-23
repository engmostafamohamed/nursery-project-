-- Migration 042: Fix Chain Admin RLS on staff_profiles
-- Prerequisite: 031_rls_helpers_bypass_row_security.sql must be applied
-- Fixes: Chain admins couldn't update staff_profiles after onboarding

-- Drop old combined policy
DROP POLICY IF EXISTS "staff_profiles_admin_all" ON staff_profiles;

-- Separate policy for branch admins (single nursery)
CREATE POLICY "staff_profiles_branch_admin_all"
ON staff_profiles FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid()
    AND u.role = 'branch_admin'
    AND u.nursery_id = staff_profiles.nursery_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid()
    AND u.role = 'branch_admin'
    AND u.nursery_id = staff_profiles.nursery_id
  )
);

-- Separate policy for chain admins (multi-nursery)
CREATE POLICY "chain_admin_can_manage_chain_staff"
ON staff_profiles FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM users u
    JOIN nurseries n ON u.chain_id = n.chain_id
    WHERE u.id = auth.uid()
    AND u.role = 'chain_super_admin'
    AND n.id = staff_profiles.nursery_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users u
    JOIN nurseries n ON u.chain_id = n.chain_id
    WHERE u.id = auth.uid()
    AND u.role = 'chain_super_admin'
    AND n.id = staff_profiles.nursery_id
  )
);

-- XO Super Admin policy (unchanged)
CREATE POLICY "staff_profiles_xo_admin_all"
ON staff_profiles FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid()
    AND u.role = 'xo_super_admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid()
    AND u.role = 'xo_super_admin'
  )
);

COMMENT ON POLICY "staff_profiles_branch_admin_all" ON staff_profiles IS 'Branch admins can manage staff in their nursery only';
COMMENT ON POLICY "chain_admin_can_manage_chain_staff" ON staff_profiles IS 'Chain admins can manage staff across all nurseries in their chain';
COMMENT ON POLICY "staff_profiles_xo_admin_all" ON staff_profiles IS 'XO super admins can manage all staff platform-wide';;

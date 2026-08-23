-- CRITICAL SECURITY FIX: Enable RLS on children table
-- This table contains the core tenant data and MUST have RLS enabled

-- Enable RLS
ALTER TABLE children ENABLE ROW LEVEL SECURITY;

-- Add comprehensive RLS policies for children table

-- XO Super Admin: Full access
CREATE POLICY "children_xo_super_admin_all"
ON children
FOR ALL
TO authenticated
USING (is_xo_super_admin());

-- Branch Admin: Full access to their nursery's children
CREATE POLICY "children_branch_admin_all"
ON children
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

-- Chain Super Admin: Full access to children in their chain's nurseries
CREATE POLICY "children_chain_super_admin_all"
ON children
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

-- Teachers: Read-only access to children in their classes
CREATE POLICY "children_teacher_select"
ON children
FOR SELECT
TO authenticated
USING (
  current_user_role() = 'teacher'
  AND EXISTS (
    SELECT 1 FROM classes cl
    WHERE cl.id = children.class_id
      AND cl.teacher_id = auth.uid()
      AND cl.nursery_id = children.nursery_id
  )
);

-- Parents: Read-only access to their own children only
CREATE POLICY "children_parent_select"
ON children
FOR SELECT
TO authenticated
USING (
  current_user_role() = 'parent'
  AND EXISTS (
    SELECT 1 FROM parent_children pc
    WHERE pc.child_id = children.id
      AND pc.parent_id = auth.uid()
  )
);

COMMENT ON POLICY "children_xo_super_admin_all" ON children IS 
'Security: XO Super Admins have full access to all children across all nurseries';

COMMENT ON POLICY "children_branch_admin_all" ON children IS 
'Security: Branch Admins can only access children in their assigned nursery - TENANT ISOLATION';

COMMENT ON POLICY "children_chain_super_admin_all" ON children IS 
'Security: Chain Super Admins can only access children in nurseries within their chain - TENANT ISOLATION';

COMMENT ON POLICY "children_teacher_select" ON children IS 
'Security: Teachers can only view children in their assigned classes within their nursery - TENANT ISOLATION';

COMMENT ON POLICY "children_parent_select" ON children IS 
'Security: Parents can only view their own children - TENANT ISOLATION';;

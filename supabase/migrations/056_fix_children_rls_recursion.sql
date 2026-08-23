-- Migration 056: Fix infinite recursion in children RLS
-- Drop the problematic policy that causes recursion
DROP POLICY IF EXISTS children_parents_select ON children;

-- Recreate it without using the recursive function
CREATE POLICY children_parents_select
  ON children
  FOR SELECT
  TO authenticated
  USING (
    current_user_role() = 'parent'::user_role 
    AND EXISTS (
      SELECT 1
      FROM parent_children pc
      WHERE pc.child_id = children.id
        AND pc.parent_id = auth.uid()
    )
  );

-- Update user_can_access_child to be truly non-recursive
CREATE OR REPLACE FUNCTION user_can_access_child(p_child_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM parent_children pc
    WHERE pc.parent_id = auth.uid()
      AND pc.child_id = p_child_id
  )
$$;

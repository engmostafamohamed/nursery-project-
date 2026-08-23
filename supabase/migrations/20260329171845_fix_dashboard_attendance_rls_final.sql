-- Migration: Final fix for dashboard attendance visibility across multi-tenant setup
-- This ensures attendance_records are visible to admins/teachers regardless of child status

-- First, let's ensure the helper functions are non-recursive and efficient
CREATE OR REPLACE FUNCTION rls_staff_can_access_child(p_child_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  c_nursery uuid;
  u_role user_role;
  u_nursery uuid;
  u_chain uuid;
BEGIN
  IF p_child_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Disable RLS for this function's queries to avoid recursion
  SET LOCAL row_security = off;
  
  -- Get user's role, nursery, and chain
  SELECT role, nursery_id, chain_id 
  INTO u_role, u_nursery, u_chain 
  FROM users 
  WHERE id = auth.uid();
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- Get child's nursery
  SELECT nursery_id 
  INTO c_nursery 
  FROM children 
  WHERE id = p_child_id;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- XO super admin can access all
  IF u_role = 'xo_super_admin' THEN
    RETURN true;
  END IF;
  
  -- Chain super admin can access all nurseries in their chain
  IF u_role = 'chain_super_admin' THEN
    RETURN EXISTS (
      SELECT 1 FROM nurseries 
      WHERE id = c_nursery AND chain_id = u_chain
    );
  END IF;
  
  -- Branch admin and teacher can access children in their nursery
  IF u_role IN ('branch_admin', 'teacher') THEN
    RETURN c_nursery = u_nursery;
  END IF;
  
  RETURN false;
END;
$$;

-- Now recreate the attendance_records policy with the fixed function
DROP POLICY IF EXISTS attendance_staff_all ON attendance_records;

CREATE POLICY attendance_staff_all
  ON attendance_records
  FOR ALL
  TO authenticated
  USING (
    current_user_role() != 'parent' 
    AND rls_staff_can_access_child(child_id)
  )
  WITH CHECK (
    current_user_role() != 'parent' 
    AND rls_staff_can_access_child(child_id)
  );

-- Add a comment explaining the fix
COMMENT ON POLICY attendance_staff_all ON attendance_records IS 
'Multi-tenant RLS: Staff (admin/teacher) can access attendance for children in their scope (nursery/chain). Uses SECURITY DEFINER function with row_security=off to prevent recursion.';;

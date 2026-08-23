-- Migration 029: Fix infinite recursion in children RLS
DROP POLICY IF EXISTS children_parent_select ON public.children;
DROP POLICY IF EXISTS pickups_parent_select ON public.authorized_pickups;
DROP POLICY IF EXISTS attendance_parent_select ON public.attendance_records;
DROP POLICY IF EXISTS health_parent_select ON public.health_records;
DROP POLICY IF EXISTS milestones_parent_select ON public.milestones;
DROP POLICY IF EXISTS perm_parent_all ON public.permissions;
DROP POLICY IF EXISTS reports_parent_select ON public.daily_reports;
DROP POLICY IF EXISTS batt_parent_select ON public.bus_attendance;

DROP FUNCTION IF EXISTS public.parent_can_access_child(UUID);

CREATE OR REPLACE FUNCTION public.parent_can_access_child(p_child_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  SET LOCAL row_security = off;
  RETURN EXISTS (
    SELECT 1 
    FROM public.parent_children pc
    WHERE pc.child_id = p_child_id 
    AND pc.parent_id = auth.uid()
  );
END;
$$;

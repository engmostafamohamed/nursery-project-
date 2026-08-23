-- Migration 030: Restore parent RLS policies dropped by CASCADE when
-- parent_can_access_child was recreated (029). Recreates the same logic as
-- 001_foundation + 002_batch2 + 004_batch4, with reports/milestones taking
-- the later definitions from 020_daily_reports and 021_milestones.

DROP POLICY IF EXISTS children_parent_select ON public.children;
CREATE POLICY children_parent_select
  ON public.children
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND public.parent_can_access_child(children.id)
  );

DROP POLICY IF EXISTS pickups_parent_select ON public.authorized_pickups;
CREATE POLICY pickups_parent_select
  ON public.authorized_pickups
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND public.parent_can_access_child(authorized_pickups.child_id)
  );

DROP POLICY IF EXISTS attendance_parent_select ON public.attendance_records;
CREATE POLICY attendance_parent_select
  ON public.attendance_records FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND public.parent_can_access_child(attendance_records.child_id)
  );

DROP POLICY IF EXISTS health_parent_select ON public.health_records;
CREATE POLICY health_parent_select
  ON public.health_records FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND public.parent_can_access_child(health_records.child_id)
  );

DROP POLICY IF EXISTS milestones_parent_select ON public.milestones;
CREATE POLICY milestones_parent_select
  ON public.milestones FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND milestones.shared_with_parent = true
    AND public.parent_can_access_child(milestones.child_id)
  );

DROP POLICY IF EXISTS perm_parent_all ON public.permissions;
CREATE POLICY perm_parent_all
  ON public.permissions FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND public.parent_can_access_child(permissions.child_id)
  )
  WITH CHECK (
    public.current_user_role() = 'parent'
    AND public.parent_can_access_child(permissions.child_id)
  );

DROP POLICY IF EXISTS reports_parent_select ON public.daily_reports;
CREATE POLICY reports_parent_select
  ON public.daily_reports FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND status = 'published'
    AND public.parent_can_access_child(daily_reports.child_id)
  );

DROP POLICY IF EXISTS batt_parent_select ON public.bus_attendance;
CREATE POLICY batt_parent_select
  ON public.bus_attendance FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND public.parent_can_access_child(bus_attendance.child_id)
  );

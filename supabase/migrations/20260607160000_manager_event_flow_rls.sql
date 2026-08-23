-- =============================================================================
-- Manager write access for the event-publish → parent flow.
--
-- The `manager` role had no write RLS on events / permissions / notifications,
-- so when a manager publishes an event, createPermissionsForEventScope() and
-- notifyParentsEventPublished() are silently blocked by RLS — parents never get
-- the permission request or notification. These policies mirror the existing
-- branch_admin policies (nursery-scoped) using the leak-safe SECURITY DEFINER
-- helpers; none reference their own table, so there is no policy recursion.
-- =============================================================================

BEGIN;

-- events: manager manages events in their own nursery (mirrors events_branch_all)
DROP POLICY IF EXISTS events_manager_all ON public.events;
CREATE POLICY events_manager_all
  ON public.events
  FOR ALL
  TO authenticated
  USING (
    public.current_user_role() = 'manager'::public.user_role
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() = 'manager'::public.user_role
    AND nursery_id = public.current_user_nursery_id()
  );

-- children: manager may read/manage children in their nursery. Needed both for
-- the event "Selected children" picker AND so the perm_manager_all WITH CHECK
-- (which does EXISTS over children) can see the child. (mirrors branch_admin)
DROP POLICY IF EXISTS children_manager_all ON public.children;
CREATE POLICY children_manager_all
  ON public.children
  FOR ALL
  TO authenticated
  USING (
    public.current_user_role() = 'manager'::public.user_role
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() = 'manager'::public.user_role
    AND nursery_id = public.current_user_nursery_id()
  );

-- permissions: manager may write permission rows for children in their nursery
-- (mirrors perm_branch_all).
DROP POLICY IF EXISTS perm_manager_all ON public.permissions;
CREATE POLICY perm_manager_all
  ON public.permissions
  FOR ALL
  TO authenticated
  USING (
    public.current_user_role() = 'manager'::public.user_role
    AND EXISTS (
      SELECT 1 FROM public.children c
      WHERE c.id = permissions.child_id
        AND c.nursery_id = public.current_user_nursery_id()
    )
  )
  WITH CHECK (
    public.current_user_role() = 'manager'::public.user_role
    AND EXISTS (
      SELECT 1 FROM public.children c
      WHERE c.id = permissions.child_id
        AND c.nursery_id = public.current_user_nursery_id()
    )
  );

-- notifications: manager may send notifications within their nursery
-- (mirrors notif_branch_all).
DROP POLICY IF EXISTS notif_manager_all ON public.notifications;
CREATE POLICY notif_manager_all
  ON public.notifications
  FOR ALL
  TO authenticated
  USING (
    public.current_user_role() = 'manager'::public.user_role
    AND (nursery_id IS NULL OR nursery_id = public.current_user_nursery_id())
  )
  WITH CHECK (
    public.current_user_role() = 'manager'::public.user_role
    AND (nursery_id IS NULL OR nursery_id = public.current_user_nursery_id())
  );

COMMIT;

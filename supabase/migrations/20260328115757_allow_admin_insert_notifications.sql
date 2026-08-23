-- Allow branch_admin and chain_super_admin to insert notifications for their nursery
-- This enables the "Send Reminder" feature in event details page

CREATE POLICY "admins_can_insert_notifications_for_their_nursery"
ON notifications
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
      AND users.role IN ('branch_admin', 'chain_super_admin')
      AND (
        users.nursery_id = notifications.nursery_id
        OR notifications.nursery_id IS NULL
      )
  )
);

COMMENT ON POLICY "admins_can_insert_notifications_for_their_nursery" ON notifications IS
'Allows branch and chain admins to create notifications for users in their nursery. Required for event reminders and broadcast messages.';;

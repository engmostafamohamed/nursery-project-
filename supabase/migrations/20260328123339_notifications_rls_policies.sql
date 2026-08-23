-- RLS policies for notifications table
-- Users can read their own notifications
-- Users can update their own notifications (mark as read)

-- SELECT policy: Users can read their own notifications
CREATE POLICY "users_can_read_own_notifications"
ON notifications
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- UPDATE policy: Users can update their own notifications (mark as read)
CREATE POLICY "users_can_update_own_notifications"
ON notifications
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_id_read 
ON notifications(user_id, read);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id_sent_at 
ON notifications(user_id, sent_at DESC);

COMMENT ON POLICY "users_can_read_own_notifications" ON notifications IS
'Allows users to read notifications addressed to them';

COMMENT ON POLICY "users_can_update_own_notifications" ON notifications IS
'Allows users to mark their notifications as read';;

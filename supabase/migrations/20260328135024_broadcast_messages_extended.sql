-- Migration 050: Extended broadcast messages system
-- Adds audience scoping, multi-channel delivery, scheduling, and delivery tracking

-- Extend broadcast_messages table
ALTER TABLE broadcast_messages
ADD COLUMN IF NOT EXISTS audience_scope text CHECK (audience_scope IN ('all_parents', 'class', 'role')),
ADD COLUMN IF NOT EXISTS class_id uuid REFERENCES classes(id),
ADD COLUMN IF NOT EXISTS channels text[] DEFAULT ARRAY['in_app']::text[],
ADD COLUMN IF NOT EXISTS scheduled_for timestamptz,
ADD COLUMN IF NOT EXISTS delivery_status text DEFAULT 'draft' CHECK (delivery_status IN ('draft', 'scheduled', 'sending', 'sent', 'failed')),
ADD COLUMN IF NOT EXISTS recipient_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS read_count integer DEFAULT 0;

-- Make sent_at nullable (only set when actually sent)
ALTER TABLE broadcast_messages ALTER COLUMN sent_at DROP NOT NULL;

-- Extend notifications table to link to broadcasts
ALTER TABLE notifications
ADD COLUMN IF NOT EXISTS related_broadcast_id uuid REFERENCES broadcast_messages(id);

-- Update RLS policies for broadcast_messages

-- Parents can only read class-scoped broadcasts if they have a child in that class
DROP POLICY IF EXISTS "parents_can_read_class_broadcasts" ON broadcast_messages;
CREATE POLICY "parents_can_read_class_broadcasts"
ON broadcast_messages
FOR SELECT
TO authenticated
USING (
  audience_scope = 'class' AND
  class_id IN (
    SELECT c.class_id FROM children c
    JOIN parent_children pc ON pc.child_id = c.id
    WHERE pc.parent_id = auth.uid()
  )
);

-- Teachers can insert/update broadcasts for their own class
DROP POLICY IF EXISTS "teachers_can_manage_class_broadcasts" ON broadcast_messages;
CREATE POLICY "teachers_can_manage_class_broadcasts"
ON broadcast_messages
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users u
    JOIN classes cl ON cl.teacher_id = u.id
    WHERE u.id = auth.uid()
      AND u.role = 'teacher'
      AND cl.id = broadcast_messages.class_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users u
    JOIN classes cl ON cl.teacher_id = u.id
    WHERE u.id = auth.uid()
      AND u.role = 'teacher'
      AND cl.id = broadcast_messages.class_id
  )
);

-- Teachers can insert class_announcement notifications for parents in their class
DROP POLICY IF EXISTS "teachers_can_insert_class_announcement_notifications" ON notifications;
CREATE POLICY "teachers_can_insert_class_announcement_notifications"
ON notifications
FOR INSERT
TO authenticated
WITH CHECK (
  type = 'class_announcement' AND
  EXISTS (
    SELECT 1 FROM users u
    JOIN classes cl ON cl.teacher_id = u.id
    JOIN broadcast_messages bm ON bm.id = notifications.related_broadcast_id
    JOIN children c ON c.class_id = cl.id
    JOIN parent_children pc ON pc.child_id = c.id
    WHERE u.id = auth.uid()
      AND u.role = 'teacher'
      AND pc.parent_id = notifications.user_id
      AND bm.class_id = cl.id
  )
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_broadcast_messages_class_id 
ON broadcast_messages(class_id) WHERE class_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_broadcast_messages_delivery_status 
ON broadcast_messages(delivery_status, scheduled_for);

CREATE INDEX IF NOT EXISTS idx_notifications_related_broadcast_id 
ON notifications(related_broadcast_id) WHERE related_broadcast_id IS NOT NULL;

COMMENT ON COLUMN broadcast_messages.audience_scope IS 
'Defines who receives this broadcast: all_parents, specific class, or specific role';

COMMENT ON COLUMN broadcast_messages.channels IS 
'Delivery channels: in_app, whatsapp, sms, email';

COMMENT ON COLUMN broadcast_messages.scheduled_for IS 
'If set, broadcast will be sent at this time instead of immediately';

COMMENT ON COLUMN broadcast_messages.delivery_status IS 
'Tracks delivery state: draft, scheduled, sending, sent, failed';;

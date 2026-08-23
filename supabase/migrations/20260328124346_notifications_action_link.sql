-- Add action_link column to notifications table
-- This allows notifications to deep-link to specific pages

ALTER TABLE notifications
ADD COLUMN IF NOT EXISTS action_link text;

COMMENT ON COLUMN notifications.action_link IS 
'Optional deep link for the notification (e.g., /parent/events/123). Only /parent/* and /admin/* paths allowed for security.';;

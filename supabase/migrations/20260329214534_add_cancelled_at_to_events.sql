-- Add cancelled_at column to events table for better cancellation tracking
ALTER TABLE events
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE;

-- Add comment explaining the column
COMMENT ON COLUMN events.cancelled_at IS 'Timestamp when the event was cancelled (if status = cancelled)';;

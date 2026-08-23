-- Allow dispatch logs for SMS and Email channels.
ALTER TABLE public.notifications
DROP CONSTRAINT IF EXISTS notifications_channel_ck;

ALTER TABLE public.notifications
ADD CONSTRAINT notifications_channel_ck
CHECK (channel IN ('in_app', 'whatsapp', 'push', 'sms', 'email'));

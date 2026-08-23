-- Optional thumbnail/photo on a notification (used by pickup confirmations to
-- show the parent who picked up their child).
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS image_url text;

COMMENT ON COLUMN public.notifications.image_url IS
  'Optional image to render alongside the notification body (e.g. pickup person photo on attendance_checkout).';

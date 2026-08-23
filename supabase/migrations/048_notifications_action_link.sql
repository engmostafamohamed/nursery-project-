-- Optional in-app navigation target for notification center (internal paths only; enforced in app).
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS action_link text;

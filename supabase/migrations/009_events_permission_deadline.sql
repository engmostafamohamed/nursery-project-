ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS permission_deadline timestamptz;

ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS is_urgent boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_events_nursery_urgent
ON public.events (nursery_id, is_urgent, starts_at DESC);

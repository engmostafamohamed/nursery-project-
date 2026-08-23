-- Migration 012: Events cancellation tracking
ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

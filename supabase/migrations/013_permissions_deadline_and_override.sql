-- Migration 013: Permissions deadline and admin override
ALTER TABLE public.permissions 
ADD COLUMN IF NOT EXISTS deadline TIMESTAMPTZ;

ALTER TABLE public.permissions 
ADD COLUMN IF NOT EXISTS admin_note TEXT;

CREATE INDEX IF NOT EXISTS idx_permissions_deadline ON public.permissions(deadline);

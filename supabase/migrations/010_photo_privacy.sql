ALTER TABLE public.children 
ADD COLUMN IF NOT EXISTS photo_privacy_restricted BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.children.photo_privacy_restricted IS 'If true, admin must verify explicit consent before sharing this child in event photos or media gallery';

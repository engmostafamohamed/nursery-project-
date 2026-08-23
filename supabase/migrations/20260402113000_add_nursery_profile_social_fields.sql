-- Add editable nursery profile + social links for admin settings
ALTER TABLE public.nurseries
ADD COLUMN IF NOT EXISTS address_ar text,
ADD COLUMN IF NOT EXISTS address_en text,
ADD COLUMN IF NOT EXISTS about_ar text,
ADD COLUMN IF NOT EXISTS about_en text,
ADD COLUMN IF NOT EXISTS website_url text,
ADD COLUMN IF NOT EXISTS facebook_url text,
ADD COLUMN IF NOT EXISTS instagram_url text,
ADD COLUMN IF NOT EXISTS tiktok_url text;

COMMENT ON COLUMN public.nurseries.address_ar IS 'Nursery address in Arabic';
COMMENT ON COLUMN public.nurseries.address_en IS 'Nursery address in English';
COMMENT ON COLUMN public.nurseries.about_ar IS 'Nursery about/description in Arabic';
COMMENT ON COLUMN public.nurseries.about_en IS 'Nursery about/description in English';
COMMENT ON COLUMN public.nurseries.website_url IS 'Official nursery website URL';
COMMENT ON COLUMN public.nurseries.facebook_url IS 'Nursery Facebook page URL';
COMMENT ON COLUMN public.nurseries.instagram_url IS 'Nursery Instagram profile URL';
COMMENT ON COLUMN public.nurseries.tiktok_url IS 'Nursery TikTok profile URL';


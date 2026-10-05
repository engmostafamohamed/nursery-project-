-- Custom pickup QRs for a national ID now carry both sides of the card: the existing
-- pickup_identity_image_path holds the front, this column the back. Passports and other
-- IDs keep a single image, and QRs issued before this change have no back image.

alter table public.qr_tokens
  add column if not exists pickup_identity_back_image_path text;

comment on column public.qr_tokens.pickup_identity_back_image_path is
  'Storage ref (bucket:path) of the back of the pickup person''s national ID card; null for passports and other IDs.';

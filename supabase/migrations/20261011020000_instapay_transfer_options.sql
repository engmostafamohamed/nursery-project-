alter table public.nursery_settings
  add column if not exists instapay_account_name text,
  add column if not exists instapay_account_number text,
  add column if not exists instapay_qr_image_url text;

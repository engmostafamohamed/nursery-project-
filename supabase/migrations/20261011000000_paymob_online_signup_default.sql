ALTER TABLE public.nursery_settings
  ALTER COLUMN payment_methods_enabled SET DEFAULT '["paymob"]'::jsonb;

ALTER TABLE public.payment_attempts
  ADD COLUMN IF NOT EXISTS paymob_intention_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS payment_attempts_paymob_intention_id_uidx
  ON public.payment_attempts (paymob_intention_id)
  WHERE paymob_intention_id IS NOT NULL;

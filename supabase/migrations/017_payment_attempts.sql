-- Migration 017: Payment attempts + optional nursery bank details
ALTER TABLE public.nurseries
ADD COLUMN IF NOT EXISTS bank_account_details JSONB;

CREATE TABLE IF NOT EXISTS public.payment_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  parent_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  nursery_id UUID NOT NULL REFERENCES public.nurseries(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  payment_method TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending_confirmation', 'confirmed', 'failed', 'cancelled')),
  proof_url TEXT,
  paymob_transaction_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  confirmed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  notes TEXT
);

ALTER TABLE public.payment_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parents can insert their own payment attempts"
ON public.payment_attempts FOR INSERT
WITH CHECK (
  parent_id = auth.uid()
  AND nursery_id IN (SELECT nursery_id FROM public.users WHERE id = auth.uid())
);

CREATE POLICY "Parents can view their own payment attempts"
ON public.payment_attempts FOR SELECT
USING (parent_id = auth.uid());

CREATE POLICY "Admins can view payment attempts for their nursery"
ON public.payment_attempts FOR SELECT
USING (
  nursery_id IN (
    SELECT nursery_id
    FROM public.users
    WHERE id = auth.uid() AND role IN ('branch_admin', 'chain_super_admin', 'xo_super_admin')
  )
);

CREATE POLICY "Admins can update payment attempts for their nursery"
ON public.payment_attempts FOR UPDATE
USING (
  nursery_id IN (
    SELECT nursery_id
    FROM public.users
    WHERE id = auth.uid() AND role IN ('branch_admin', 'chain_super_admin', 'xo_super_admin')
  )
)
WITH CHECK (
  status IN ('confirmed', 'cancelled')
  AND nursery_id IN (
    SELECT nursery_id
    FROM public.users
    WHERE id = auth.uid() AND role IN ('branch_admin', 'chain_super_admin', 'xo_super_admin')
  )
);

CREATE INDEX IF NOT EXISTS idx_payment_attempts_invoice_id ON public.payment_attempts(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_parent_id ON public.payment_attempts(parent_id);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_nursery_id ON public.payment_attempts(nursery_id);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_status ON public.payment_attempts(status);

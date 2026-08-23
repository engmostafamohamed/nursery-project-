-- Phase 11 Feature 1: Parent Loyalty & Rewards Program

CREATE TABLE IF NOT EXISTS public.loyalty_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nursery_id uuid NOT NULL REFERENCES public.nurseries (id) ON DELETE CASCADE,
  parent_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  transaction_type text NOT NULL,
  points integer NOT NULL,
  source text NOT NULL,
  reference_id uuid,
  description text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT loyalty_transactions_type_ck CHECK (transaction_type IN ('earned', 'redeemed', 'expired', 'bonus')),
  CONSTRAINT loyalty_transactions_source_ck CHECK (source IN ('payment', 'referral', 'review', 'birthday', 'bonus', 'manual'))
);

CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_nursery ON public.loyalty_transactions (nursery_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_parent ON public.loyalty_transactions (parent_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_created ON public.loyalty_transactions (created_at);

ALTER TABLE public.loyalty_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS loyalty_transactions_parent_select_own ON public.loyalty_transactions;
CREATE POLICY loyalty_transactions_parent_select_own
  ON public.loyalty_transactions FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND parent_id = auth.uid()
  );

DROP POLICY IF EXISTS loyalty_transactions_admin_all ON public.loyalty_transactions;
CREATE POLICY loyalty_transactions_admin_all
  ON public.loyalty_transactions FOR ALL TO authenticated
  USING (
    public.current_user_role() IN ('branch_admin', 'chain_super_admin')
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() IN ('branch_admin', 'chain_super_admin')
    AND nursery_id = public.current_user_nursery_id()
  );

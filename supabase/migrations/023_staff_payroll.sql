-- Phase 7 Feature 2: Staff Payroll (simplified)

CREATE TABLE IF NOT EXISTS public.staff_payroll (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff_profiles (id) ON DELETE CASCADE,
  nursery_id uuid NOT NULL REFERENCES public.nurseries (id) ON DELETE CASCADE,
  pay_period_start date NOT NULL,
  pay_period_end date NOT NULL,
  base_salary numeric(12, 2) NOT NULL DEFAULT 0,
  bonuses numeric(12, 2) NOT NULL DEFAULT 0,
  deductions numeric(12, 2) NOT NULL DEFAULT 0,
  total_amount numeric(12, 2) GENERATED ALWAYS AS (base_salary + bonuses - deductions) STORED,
  payment_method text NOT NULL DEFAULT 'bank_transfer',
  payment_date date,
  payment_status text NOT NULL DEFAULT 'pending',
  notes text,
  payslip_url text,
  created_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  paid_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT staff_payroll_method_ck CHECK (payment_method IN ('cash', 'bank_transfer', 'check')),
  CONSTRAINT staff_payroll_status_ck CHECK (payment_status IN ('pending', 'paid'))
);

CREATE INDEX IF NOT EXISTS idx_staff_payroll_nursery_id ON public.staff_payroll (nursery_id);
CREATE INDEX IF NOT EXISTS idx_staff_payroll_staff_id ON public.staff_payroll (staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_payroll_period ON public.staff_payroll (pay_period_start, pay_period_end);
CREATE INDEX IF NOT EXISTS idx_staff_payroll_status ON public.staff_payroll (payment_status);

ALTER TABLE public.staff_payroll ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_payroll_admin_all ON public.staff_payroll;
CREATE POLICY staff_payroll_admin_all
  ON public.staff_payroll FOR ALL TO authenticated
  USING (
    public.current_user_role() IN ('branch_admin', 'chain_super_admin')
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() IN ('branch_admin', 'chain_super_admin')
    AND nursery_id = public.current_user_nursery_id()
  );

DROP POLICY IF EXISTS staff_payroll_staff_select ON public.staff_payroll;
CREATE POLICY staff_payroll_staff_select
  ON public.staff_payroll FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.staff_profiles sp
      WHERE sp.id = staff_payroll.staff_id
        AND sp.user_id = auth.uid()
    )
  );

-- Let finance/HR managers write and read the payment ledger rows that power
-- financial reports and parent payment history.

DROP POLICY IF EXISTS payments_finance_manager_select ON public.payments;
CREATE POLICY payments_finance_manager_select
  ON public.payments FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'manager'
    AND public.current_user_department() IN ('finance', 'hr')
    AND EXISTS (
      SELECT 1
      FROM public.invoices i
      WHERE i.id = payments.invoice_id
        AND i.nursery_id = public.current_user_nursery_id()
    )
  );

DROP POLICY IF EXISTS payments_finance_manager_insert ON public.payments;
CREATE POLICY payments_finance_manager_insert
  ON public.payments FOR INSERT TO authenticated
  WITH CHECK (
    status IN ('pending', 'completed', 'failed', 'refunded')
    AND public.current_user_role() = 'manager'
    AND public.current_user_department() IN ('finance', 'hr')
    AND EXISTS (
      SELECT 1
      FROM public.invoices i
      WHERE i.id = payments.invoice_id
        AND i.nursery_id = public.current_user_nursery_id()
    )
  );

DROP POLICY IF EXISTS payments_finance_manager_update ON public.payments;
CREATE POLICY payments_finance_manager_update
  ON public.payments FOR UPDATE TO authenticated
  USING (
    public.current_user_role() = 'manager'
    AND public.current_user_department() IN ('finance', 'hr')
    AND EXISTS (
      SELECT 1
      FROM public.invoices i
      WHERE i.id = payments.invoice_id
        AND i.nursery_id = public.current_user_nursery_id()
    )
  )
  WITH CHECK (
    status IN ('pending', 'completed', 'failed', 'refunded')
    AND public.current_user_role() = 'manager'
    AND public.current_user_department() IN ('finance', 'hr')
    AND EXISTS (
      SELECT 1
      FROM public.invoices i
      WHERE i.id = payments.invoice_id
        AND i.nursery_id = public.current_user_nursery_id()
    )
  );

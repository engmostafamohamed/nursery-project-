-- =============================================================================
-- Migration: 20260612000000_finance_manager_payments_and_xo_audit
--
-- Goal: let a FINANCE / HR manager accept or reject parent payments, and let
-- the XO super admin read the full payment audit across all nurseries.
--
-- Background: 20260521120200_manager_full_rls_policies intentionally left
-- invoices / payment_attempts as "finance-only" with NO manager policies, and
-- payment_attempts has no xo-wide SELECT policy (its admin policy is scoped by
-- the caller's own nursery_id, which is NULL for xo_super_admin). This migration
-- adds the missing finance/HR-manager and xo policies.
--
-- Gating: manager access is restricted to department IN ('finance','hr'); the
-- app permission matrix already gates the UI, this enforces it at the DB layer.
-- =============================================================================

-- Track which staff member confirmed/rejected the attempt (audit trail).
-- (confirmed_by already exists from migration 017; this is defensive.)
ALTER TABLE public.payment_attempts
  ADD COLUMN IF NOT EXISTS confirmed_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- -----------------------------------------------------------------------------
-- payment_attempts — XO super admin can read every nursery's attempts (audit).
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS payment_attempts_xo_select ON public.payment_attempts;
CREATE POLICY payment_attempts_xo_select
  ON public.payment_attempts FOR SELECT TO authenticated
  USING (public.is_xo_super_admin());

-- -----------------------------------------------------------------------------
-- payment_attempts — finance/HR manager can read + confirm/reject for their
-- own nursery.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS payment_attempts_finance_manager_select ON public.payment_attempts;
CREATE POLICY payment_attempts_finance_manager_select
  ON public.payment_attempts FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'manager'
    AND public.current_user_department() IN ('finance', 'hr')
    AND nursery_id = public.current_user_nursery_id()
  );

DROP POLICY IF EXISTS payment_attempts_finance_manager_update ON public.payment_attempts;
CREATE POLICY payment_attempts_finance_manager_update
  ON public.payment_attempts FOR UPDATE TO authenticated
  USING (
    public.current_user_role() = 'manager'
    AND public.current_user_department() IN ('finance', 'hr')
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    status IN ('confirmed', 'cancelled')
    AND public.current_user_role() = 'manager'
    AND public.current_user_department() IN ('finance', 'hr')
    AND nursery_id = public.current_user_nursery_id()
  );

-- -----------------------------------------------------------------------------
-- invoices — finance/HR manager can read + mark paid for their own nursery.
-- (Needed for the finance dashboards and to confirm payments.)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS invoices_finance_manager_select ON public.invoices;
CREATE POLICY invoices_finance_manager_select
  ON public.invoices FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'manager'
    AND public.current_user_department() IN ('finance', 'hr')
    AND nursery_id = public.current_user_nursery_id()
  );

DROP POLICY IF EXISTS invoices_finance_manager_update ON public.invoices;
CREATE POLICY invoices_finance_manager_update
  ON public.invoices FOR UPDATE TO authenticated
  USING (
    public.current_user_role() = 'manager'
    AND public.current_user_department() IN ('finance', 'hr')
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() = 'manager'
    AND public.current_user_department() IN ('finance', 'hr')
    AND nursery_id = public.current_user_nursery_id()
  );

-- -----------------------------------------------------------------------------
-- notifications — finance/HR manager can notify users in their nursery
-- (so confirming a payment can notify the parent). Mirrors the existing
-- admins_can_insert_notifications_for_their_nursery policy.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS finance_manager_insert_notifications ON public.notifications;
CREATE POLICY finance_manager_insert_notifications
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'manager'
    AND public.current_user_department() IN ('finance', 'hr')
    AND (
      notifications.nursery_id = public.current_user_nursery_id()
      OR notifications.nursery_id IS NULL
    )
  );

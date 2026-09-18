-- Admission package billing periods and manual approval after finance confirms.

BEGIN;

DROP FUNCTION IF EXISTS public.select_application_payment_package(uuid, uuid);
DROP FUNCTION IF EXISTS public.select_application_payment_package(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.select_application_payment_package(
  p_application_id uuid,
  p_package_id uuid,
  p_billing_period text DEFAULT 'monthly'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role public.user_role;
  v_user_nursery_id uuid;
  v_user_chain_id uuid;
  v_app public.applications%ROWTYPE;
  v_pkg public.packages%ROWTYPE;
  v_invoice public.invoices%ROWTYPE;
  v_paid numeric := 0;
  v_due_days integer := 7;
  v_invoice_id uuid;
  v_line_items jsonb;
  v_billing_period text := COALESCE(NULLIF(p_billing_period, ''), 'monthly');
  v_billing_months integer := 1;
  v_total numeric := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT u.role, u.nursery_id, u.chain_id
    INTO v_role, v_user_nursery_id, v_user_chain_id
  FROM public.users u
  WHERE u.id = v_uid;

  SELECT *
    INTO v_app
  FROM public.applications
  WHERE id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found' USING ERRCODE = '42704';
  END IF;

  IF v_app.parent_id IS NULL THEN
    RAISE EXCEPTION 'Application must be linked to a parent before selecting a package' USING ERRCODE = '22023';
  END IF;

  IF v_role = 'parent'::public.user_role THEN
    IF v_app.parent_id IS DISTINCT FROM v_uid OR v_app.status IN ('approved', 'rejected') THEN
      RAISE EXCEPTION 'Cannot change this application package' USING ERRCODE = '42501';
    END IF;
  ELSIF v_role IN ('branch_admin'::public.user_role, 'manager'::public.user_role) THEN
    IF v_user_nursery_id IS DISTINCT FROM v_app.nursery_id THEN
      RAISE EXCEPTION 'Cannot change applications outside your nursery' USING ERRCODE = '42501';
    END IF;
  ELSIF v_role = 'chain_super_admin'::public.user_role THEN
    IF v_user_chain_id IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public.nurseries n
      WHERE n.id = v_app.nursery_id
        AND n.chain_id = v_user_chain_id
    ) THEN
      RAISE EXCEPTION 'Cannot change applications outside your chain' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT public.is_xo_super_admin() THEN
    RAISE EXCEPTION 'Cannot select application package' USING ERRCODE = '42501';
  END IF;

  SELECT *
    INTO v_pkg
  FROM public.packages
  WHERE id = p_package_id
    AND nursery_id = v_app.nursery_id
    AND active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Package not found' USING ERRCODE = '42704';
  END IF;

  v_billing_period := CASE v_billing_period
    WHEN 'monthly' THEN 'monthly'
    WHEN 'quarterly' THEN 'quarterly'
    WHEN 'half_annual' THEN 'half_annual'
    WHEN 'annual' THEN 'annual'
    ELSE 'monthly'
  END;

  v_billing_months := CASE v_billing_period
    WHEN 'quarterly' THEN 3
    WHEN 'half_annual' THEN 6
    WHEN 'annual' THEN 12
    ELSE 1
  END;
  v_total := v_pkg.price * v_billing_months;

  SELECT *
    INTO v_invoice
  FROM public.invoices i
  WHERE i.nursery_id = v_app.nursery_id
    AND i.parent_id = v_app.parent_id
    AND i.line_items_json->>'application_id' = p_application_id::text
  ORDER BY i.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    SELECT COALESCE(SUM(p.amount), 0)
      INTO v_paid
    FROM public.payments p
    WHERE p.invoice_id = v_invoice.id
      AND p.status = 'completed';

    IF v_paid > 0 THEN
      RAISE EXCEPTION 'Cannot change package after payment has started' USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT COALESCE(ns.invoice_due_days, 7)
    INTO v_due_days
  FROM public.nursery_settings ns
  WHERE ns.nursery_id = v_app.nursery_id;

  v_line_items := jsonb_build_object(
    'application_id', p_application_id,
    'application_payment', true,
    'package_id', p_package_id,
    'package_name_ar', v_pkg.name_ar,
    'package_name_en', v_pkg.name_en,
    'coverage_type', v_pkg.coverage_type,
    'included_hours', v_pkg.included_hours,
    'billing_period', v_billing_period,
    'billing_months', v_billing_months,
    'monthly_price', v_pkg.price,
    'items', jsonb_build_array(
      jsonb_build_object(
        'description', COALESCE(NULLIF(v_pkg.name_en, ''), NULLIF(v_pkg.name_ar, ''), 'Admission package'),
        'quantity', v_billing_months,
        'unitPrice', v_pkg.price,
        'unit_price', v_pkg.price,
        'total', v_total
      )
    ),
    'notes', 'Admission package selected before approval'
  );

  IF v_invoice.id IS NOT NULL THEN
    UPDATE public.invoices
       SET amount = v_total,
           due_date = (CURRENT_DATE + v_due_days),
           status = 'pending',
           invoice_type = 'monthly',
           line_items_json = v_line_items,
           payment_method = NULL,
           paid_at = NULL,
           updated_at = now()
     WHERE id = v_invoice.id
     RETURNING id INTO v_invoice_id;
  ELSE
    INSERT INTO public.invoices (
      nursery_id,
      parent_id,
      amount,
      due_date,
      status,
      invoice_type,
      line_items_json
    )
    VALUES (
      v_app.nursery_id,
      v_app.parent_id,
      v_total,
      (CURRENT_DATE + v_due_days),
      'pending',
      'monthly',
      v_line_items
    )
    RETURNING id INTO v_invoice_id;
  END IF;

  RETURN v_invoice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.select_application_payment_package(uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.confirm_invoice_payment_attempt(p_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role public.user_role;
  v_user_nursery_id uuid;
  v_user_chain_id uuid;
  v_user_department text;
  v_attempt public.payment_attempts%ROWTYPE;
  v_invoice public.invoices%ROWTYPE;
  v_already_paid numeric := 0;
  v_confirmed_amount numeric := 0;
  v_total_paid numeric := 0;
  v_fully_paid boolean := false;
  v_payment_id uuid;
  v_application_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT u.role, u.nursery_id, u.chain_id, COALESCE(u.department::text, '')
    INTO v_role, v_user_nursery_id, v_user_chain_id, v_user_department
  FROM public.users u
  WHERE u.id = v_uid;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'User profile not found' USING ERRCODE = '42704';
  END IF;

  SELECT *
    INTO v_attempt
  FROM public.payment_attempts
  WHERE id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment attempt not found' USING ERRCODE = '42704';
  END IF;

  IF v_role IN ('branch_admin'::public.user_role, 'manager'::public.user_role) THEN
    IF v_user_nursery_id IS DISTINCT FROM v_attempt.nursery_id THEN
      RAISE EXCEPTION 'Cannot confirm payment outside your nursery' USING ERRCODE = '42501';
    END IF;
    IF v_role = 'manager'::public.user_role AND v_user_department NOT IN ('finance', 'hr') THEN
      RAISE EXCEPTION 'Only finance or HR managers can confirm payments' USING ERRCODE = '42501';
    END IF;
  ELSIF v_role = 'chain_super_admin'::public.user_role THEN
    IF v_user_chain_id IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public.nurseries n
      WHERE n.id = v_attempt.nursery_id
        AND n.chain_id = v_user_chain_id
    ) THEN
      RAISE EXCEPTION 'Cannot confirm payment outside your chain' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT public.is_xo_super_admin() THEN
    RAISE EXCEPTION 'Only admins can confirm payments' USING ERRCODE = '42501';
  END IF;

  SELECT *
    INTO v_invoice
  FROM public.invoices
  WHERE id = v_attempt.invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found' USING ERRCODE = '42704';
  END IF;

  IF v_invoice.nursery_id IS DISTINCT FROM v_attempt.nursery_id
    OR v_invoice.parent_id IS DISTINCT FROM v_attempt.parent_id THEN
    RAISE EXCEPTION 'Payment attempt does not match invoice' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(SUM(p.amount), 0)
    INTO v_already_paid
  FROM public.payments p
  WHERE p.invoice_id = v_invoice.id
    AND p.status = 'completed';

  IF v_attempt.status = 'pending_confirmation' THEN
    v_confirmed_amount := LEAST(v_attempt.amount, GREATEST(0, v_invoice.amount - v_already_paid));

    IF v_confirmed_amount > 0 THEN
      INSERT INTO public.payments (invoice_id, amount, method, status, paid_at)
      VALUES (v_invoice.id, v_confirmed_amount, v_attempt.payment_method, 'completed', now())
      RETURNING id INTO v_payment_id;
    END IF;

    UPDATE public.payment_attempts
       SET status = 'confirmed',
           confirmed_at = now(),
           confirmed_by = v_uid
     WHERE id = v_attempt.id;
  END IF;

  v_total_paid := v_already_paid + v_confirmed_amount;
  v_fully_paid := v_total_paid + 0.005 >= v_invoice.amount;

  UPDATE public.invoices
     SET status = CASE WHEN v_fully_paid THEN 'paid' ELSE 'pending' END,
         paid_at = CASE WHEN v_fully_paid THEN COALESCE(v_invoice.paid_at, now()) ELSE NULL END,
         payment_method = v_attempt.payment_method,
         updated_at = now()
   WHERE id = v_invoice.id;

  IF v_attempt.status = 'pending_confirmation' AND v_confirmed_amount > 0 THEN
    INSERT INTO public.notifications (
      nursery_id,
      user_id,
      type,
      title_ar,
      title_en,
      body_ar,
      body_en,
      channel,
      read,
      sent_at
    )
    VALUES (
      v_invoice.nursery_id,
      v_invoice.parent_id,
      'invoice_paid',
      'Invoice payment confirmed',
      'Invoice payment confirmed',
      'Payment confirmed for invoice ' || COALESCE(v_invoice.generated_invoice_number, v_invoice.id::text) || '.',
      'Payment confirmed for invoice ' || COALESCE(v_invoice.generated_invoice_number, v_invoice.id::text) || '.',
      'push',
      false,
      now()
    );
  END IF;

  BEGIN
    v_application_id := NULLIF(v_invoice.line_items_json->>'application_id', '')::uuid;
  EXCEPTION WHEN others THEN
    v_application_id := NULL;
  END;

  IF v_application_id IS NOT NULL AND v_attempt.status = 'pending_confirmation' AND v_confirmed_amount > 0 THEN
    INSERT INTO public.notifications (
      nursery_id,
      user_id,
      type,
      title_ar,
      title_en,
      body_ar,
      body_en,
      channel,
      read,
      action_link,
      sent_at
    )
    SELECT
      v_invoice.nursery_id,
      u.id,
      'application_payment_confirmed',
      'Application payment confirmed',
      'Application payment confirmed',
      'A package payment was confirmed. The application is ready for admin approval.',
      'A package payment was confirmed. The application is ready for admin approval.',
      'in_app',
      false,
      '/admin/applications/' || v_application_id::text,
      now()
    FROM public.users u
    WHERE u.nursery_id = v_invoice.nursery_id
      AND u.role IN ('branch_admin'::public.user_role, 'chain_super_admin'::public.user_role);
  END IF;

  RETURN jsonb_build_object(
    'invoiceId', v_invoice.id,
    'paymentId', v_payment_id,
    'confirmedAmount', v_confirmed_amount,
    'paidAmount', v_total_paid,
    'invoiceStatus', CASE WHEN v_fully_paid THEN 'paid' ELSE 'pending' END,
    'applicationId', v_application_id,
    'approval', NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_invoice_payment_attempt(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.confirm_invoice_payment_attempt(uuid) TO authenticated;

COMMIT;

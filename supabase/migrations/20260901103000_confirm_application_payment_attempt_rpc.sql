-- Confirm a parent payment attempt atomically.
-- For application package invoices, confirmation also approves the application
-- and activates/links the child through approve_application_enrollment().

BEGIN;

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
  v_application_status text;
  v_approval jsonb;
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
      'تم تأكيد سداد الفاتورة',
      'Invoice payment confirmed',
      'تم تأكيد دفعة على الفاتورة ' || COALESCE(v_invoice.generated_invoice_number, v_invoice.id::text) || '.',
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

  IF v_application_id IS NOT NULL THEN
    SELECT a.status
      INTO v_application_status
    FROM public.applications a
    WHERE a.id = v_application_id;

    IF v_application_status IN ('submitted', 'under_review', 'documents_pending') AND v_total_paid > 0 THEN
      v_approval := public.approve_application_enrollment(v_application_id, v_invoice.nursery_id, true);

      INSERT INTO public.notifications (
        nursery_id,
        user_id,
        type,
        title_ar,
        title_en,
        body_ar,
        body_en,
        channel,
        urgency,
        read,
        action_link,
        sent_at
      )
      VALUES (
        v_invoice.nursery_id,
        v_invoice.parent_id,
        'application_approved',
        'تم قبول طلب التسجيل',
        'Application approved',
        'تم قبول طلب طفلك وتفعيل ملفه في لوحة ولي الأمر.',
        'Your child application was approved and the child profile is now visible on your dashboard.',
        'in_app',
        'normal',
        false,
        '/parent/applications/' || v_application_id::text,
        now()
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'invoiceId', v_invoice.id,
    'paymentId', v_payment_id,
    'confirmedAmount', v_confirmed_amount,
    'paidAmount', v_total_paid,
    'invoiceStatus', CASE WHEN v_fully_paid THEN 'paid' ELSE 'pending' END,
    'applicationId', v_application_id,
    'approval', v_approval
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_invoice_payment_attempt(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.confirm_invoice_payment_attempt(uuid) TO authenticated;

COMMIT;

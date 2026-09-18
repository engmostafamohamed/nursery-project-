-- A paid application goes straight to 'under_review'.
--
-- 'submitted' only ever meant "waiting for an admin to press Start review". Since the
-- payment is the submission, the parent should see the application under nursery
-- review immediately, without depending on an admin opening it first.

BEGIN;

CREATE OR REPLACE FUNCTION public.submit_application_for_review(p_application_id uuid, p_reason text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_app public.applications%ROWTYPE;
  v_parent_name text;
BEGIN
  SELECT * INTO v_app FROM public.applications WHERE id = p_application_id FOR UPDATE;
  IF NOT FOUND OR v_app.status NOT IN ('draft', 'submitted') THEN
    RETURN false;
  END IF;
  IF NOT COALESCE(v_app.terms_accepted, false) THEN
    RETURN false;
  END IF;
  IF NOT public.application_has_required_documents(v_app.id) THEN
    RETURN false;
  END IF;

  UPDATE public.applications
     SET status = 'under_review',
         submitted_at = COALESCE(submitted_at, now())
   WHERE id = v_app.id;

  -- Already-submitted rows are only being promoted; admins were notified before.
  IF v_app.status = 'submitted' THEN
    RETURN true;
  END IF;

  -- The parent's own reminders about this application are no longer actionable.
  UPDATE public.notifications
     SET read = true
   WHERE user_id = v_app.parent_id
     AND read = false
     AND action_link = '/parent/applications/' || v_app.id::text;

  SELECT COALESCE(
           NULLIF(v_app.parent_info_json->>'full_name', ''),
           NULLIF(u.name_ar, ''),
           NULLIF(u.name_en, ''),
           'Parent'
         )
    INTO v_parent_name
  FROM public.users u
  WHERE u.id = v_app.parent_id;
  v_parent_name := COALESCE(v_parent_name, NULLIF(v_app.parent_info_json->>'full_name', ''), 'Parent');

  INSERT INTO public.notifications (
    nursery_id, user_id, type, title_ar, title_en, body_ar, body_en, channel, read, action_link, sent_at
  )
  SELECT
    v_app.nursery_id,
    u.id,
    'application_submitted',
    'طلب تسجيل جديد',
    'New application submitted',
    'طلب جديد من ' || v_parent_name || COALESCE(' (' || p_reason || ')', '') || '.',
    'New application from ' || v_parent_name || COALESCE(' (' || p_reason || ')', '') || '.',
    'push',
    false,
    '/admin/admissions/applications/' || v_app.id::text,
    now()
  FROM public.users u
  WHERE u.nursery_id = v_app.nursery_id
    AND u.role IN ('branch_admin'::public.user_role, 'chain_super_admin'::public.user_role);

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_application_for_review(uuid, text) FROM public;

-- Promote applications that were auto-submitted before this change.
DO $$
DECLARE
  v_id uuid;
BEGIN
  FOR v_id IN
    SELECT DISTINCT a.id
    FROM public.applications a
    JOIN public.invoices i
      ON i.line_items_json->>'application_id' = a.id::text
     AND i.status <> 'cancelled'
    JOIN public.payment_attempts pa
      ON pa.invoice_id = i.id
     AND pa.status IN ('pending_confirmation', 'confirmed')
    WHERE a.status = 'submitted'
  LOOP
    PERFORM public.submit_application_for_review(v_id, 'payment submitted');
  END LOOP;
END;
$$;

COMMIT;

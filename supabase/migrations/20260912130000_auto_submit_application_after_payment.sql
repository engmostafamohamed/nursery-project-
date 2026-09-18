-- Send an application for review as soon as the parent submits a package payment.
--
-- The parent flow is: complete information -> choose package -> pay all or part.
-- Requiring a separate "Submit" click after paying left complete, paid applications
-- sitting in draft where admissions never saw them. The payment attempt is now the
-- submission: once one exists for the application invoice and the application is
-- complete (terms accepted, required documents uploaded), it moves to 'submitted'
-- and nursery admins are notified, exactly as the manual submit did.

BEGIN;

-- The parent-edit guard raised for sessions without auth.uid() (backend jobs, this
-- migration) because NULL <> 'parent' is not true. Only parents are subject to it.
CREATE OR REPLACE FUNCTION public.prevent_parent_reviewed_application_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.current_user_role() IS DISTINCT FROM 'parent' THEN
    RETURN NEW;
  END IF;

  IF OLD.parent_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Parents may only edit their own application';
  END IF;

  IF OLD.status = 'draft' THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'documents_pending' THEN
    IF (to_jsonb(NEW) - 'status' - 'submitted_at' - 'updated_at') IS DISTINCT FROM
       (to_jsonb(OLD) - 'status' - 'submitted_at' - 'updated_at') THEN
      RAISE EXCEPTION 'Reviewed application data is locked';
    END IF;

    IF NEW.status NOT IN ('documents_pending', 'submitted') THEN
      RAISE EXCEPTION 'Parents can only resubmit requested documents';
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Reviewed application data is locked';
END;
$$;

-- True when every mandatory admission document has a file (same list the
-- before-submit trigger enforces).
CREATE OR REPLACE FUNCTION public.application_has_required_documents(p_application_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM unnest(ARRAY['birth_certificate', 'vaccination_card', 'parent_id', 'proof_of_address']) AS required_doc
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.application_documents d
      WHERE d.application_id = p_application_id
        AND d.document_type = required_doc
        AND coalesce(d.file_url, '') <> ''
    )
  );
$$;

-- Moves a draft application to 'submitted' and notifies the nursery admins.
-- Returns true when it did so.
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
  IF NOT FOUND OR v_app.status <> 'draft' THEN
    RETURN false;
  END IF;
  IF NOT COALESCE(v_app.terms_accepted, false) THEN
    RETURN false;
  END IF;
  IF NOT public.application_has_required_documents(v_app.id) THEN
    RETURN false;
  END IF;

  UPDATE public.applications
     SET status = 'submitted',
         submitted_at = COALESCE(submitted_at, now())
   WHERE id = v_app.id;

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

-- A parent's payment attempt on an application invoice submits the application.
CREATE OR REPLACE FUNCTION public.submit_application_after_payment_attempt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_line_items jsonb;
  v_application_id uuid;
BEGIN
  IF NEW.status NOT IN ('pending_confirmation', 'confirmed') THEN
    RETURN NEW;
  END IF;

  SELECT i.line_items_json INTO v_line_items FROM public.invoices i WHERE i.id = NEW.invoice_id;
  BEGIN
    v_application_id := NULLIF(v_line_items->>'application_id', '')::uuid;
  EXCEPTION WHEN others THEN
    v_application_id := NULL;
  END;
  IF v_application_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM public.submit_application_for_review(v_application_id, 'payment submitted');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_submit_application_after_payment_attempt ON public.payment_attempts;
CREATE TRIGGER trg_submit_application_after_payment_attempt
AFTER INSERT ON public.payment_attempts
FOR EACH ROW
EXECUTE FUNCTION public.submit_application_after_payment_attempt();

-- Backfill: drafts that already have a payment on their application invoice.
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
    WHERE a.status = 'draft'
  LOOP
    PERFORM public.submit_application_for_review(v_id, 'payment submitted');
  END LOOP;
END;
$$;

COMMIT;

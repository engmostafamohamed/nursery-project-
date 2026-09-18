-- A paid application is 'submitted'; it becomes 'under_review' only when a nursery
-- admin opens it (the admin application page does that). Reverts the direct-to-
-- 'under_review' behaviour from 20260912140000 so the parent can tell the difference
-- between "waiting for the nursery" and "the nursery is looking at it".

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

COMMIT;

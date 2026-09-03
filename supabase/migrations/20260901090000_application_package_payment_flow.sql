-- Admission package payment flow:
-- - parents can see active packages for their nursery
-- - parents select one package, which creates/updates an application invoice
-- - admins can approve only after at least one confirmed package payment exists

BEGIN;

CREATE INDEX IF NOT EXISTS idx_invoices_application_payment
  ON public.invoices ((line_items_json->>'application_id'))
  WHERE line_items_json ? 'application_id';

DROP POLICY IF EXISTS packages_parent_select ON public.packages;
CREATE POLICY packages_parent_select
  ON public.packages FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND active = true
    AND nursery_id = public.current_user_nursery_id()
  );

CREATE OR REPLACE FUNCTION public.select_application_payment_package(
  p_application_id uuid,
  p_package_id uuid
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
    'items', jsonb_build_array(
      jsonb_build_object(
        'description', COALESCE(NULLIF(v_pkg.name_en, ''), NULLIF(v_pkg.name_ar, ''), 'Admission package'),
        'quantity', 1,
        'unitPrice', v_pkg.price,
        'unit_price', v_pkg.price,
        'total', v_pkg.price
      )
    ),
    'notes', 'Admission package selected before approval'
  );

  IF v_invoice.id IS NOT NULL THEN
    UPDATE public.invoices
       SET amount = v_pkg.price,
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
      v_pkg.price,
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

GRANT EXECUTE ON FUNCTION public.select_application_payment_package(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_application_enrollment(
  p_application_id uuid,
  p_nursery_id uuid,
  p_auto_generate_first_invoice boolean DEFAULT true
)
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
  v_app public.applications%ROWTYPE;
  v_parent_info jsonb;
  v_child_info jsonb;
  v_parent_id uuid;
  v_child_id uuid;
  v_class_id uuid;
  v_preferred_class text;
  v_parent_email text;
  v_child_name_ar text;
  v_child_name_en text;
  v_child_dob date;
  v_gender text;
  v_school_preference text;
  v_has_siblings boolean;
  v_daily_care jsonb;
  v_emergency_contacts jsonb;
  v_application_invoice_id uuid;
  v_selected_package_id uuid;
  v_confirmed_paid numeric := 0;
  v_photo_privacy boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT u.role, u.nursery_id, u.chain_id
    INTO v_role, v_user_nursery_id, v_user_chain_id
  FROM public.users u
  WHERE u.id = v_uid;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'User profile not found' USING ERRCODE = '42704';
  END IF;

  IF v_role IN ('branch_admin'::public.user_role, 'manager'::public.user_role) THEN
    IF v_user_nursery_id IS DISTINCT FROM p_nursery_id THEN
      RAISE EXCEPTION 'Cannot approve applications outside your nursery' USING ERRCODE = '42501';
    END IF;
  ELSIF v_role = 'chain_super_admin'::public.user_role THEN
    IF v_user_chain_id IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public.nurseries n
      WHERE n.id = p_nursery_id
        AND n.chain_id = v_user_chain_id
    ) THEN
      RAISE EXCEPTION 'Cannot approve applications outside your chain' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT public.is_xo_super_admin() THEN
    RAISE EXCEPTION 'Only admins may approve applications' USING ERRCODE = '42501';
  END IF;

  SELECT *
    INTO v_app
  FROM public.applications
  WHERE id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found' USING ERRCODE = '42704';
  END IF;

  IF v_app.nursery_id IS DISTINCT FROM p_nursery_id THEN
    RAISE EXCEPTION 'Application nursery mismatch' USING ERRCODE = '22023';
  END IF;

  v_parent_info := COALESCE(v_app.parent_info_json, '{}'::jsonb);
  v_child_info := COALESCE(v_app.child_info_json, '{}'::jsonb);
  v_parent_id := v_app.parent_id;
  v_child_id := v_app.child_id;

  IF v_parent_id IS NULL THEN
    v_parent_email := COALESCE(
      NULLIF(v_parent_info->>'email', ''),
      NULLIF(v_parent_info#>>'{mother,email}', ''),
      NULLIF(v_parent_info#>>'{father,email}', '')
    );

    IF v_parent_email IS NOT NULL THEN
      SELECT u.id
        INTO v_parent_id
      FROM public.users u
      WHERE u.nursery_id = p_nursery_id
        AND u.role = 'parent'::public.user_role
        AND lower(u.email) = lower(v_parent_email)
      ORDER BY u.created_at
      LIMIT 1;
    END IF;
  END IF;

  SELECT i.id, NULLIF(i.line_items_json->>'package_id', '')::uuid
    INTO v_application_invoice_id, v_selected_package_id
  FROM public.invoices i
  WHERE i.nursery_id = p_nursery_id
    AND i.parent_id = v_parent_id
    AND i.line_items_json->>'application_id' = p_application_id::text
    AND i.status <> 'cancelled'
  ORDER BY i.created_at DESC
  LIMIT 1;

  IF v_application_invoice_id IS NULL THEN
    RAISE EXCEPTION 'Application package invoice must be created before approval' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(SUM(p.amount), 0)
    INTO v_confirmed_paid
  FROM public.payments p
  WHERE p.invoice_id = v_application_invoice_id
    AND p.status = 'completed';

  IF v_confirmed_paid <= 0 THEN
    RAISE EXCEPTION 'Confirm at least one application package payment before approval' USING ERRCODE = '22023';
  END IF;

  IF v_child_id IS NULL THEN
    v_preferred_class := NULLIF(COALESCE(v_child_info->>'preferred_class', v_child_info->>'class'), '');

    IF v_preferred_class IS NOT NULL THEN
      SELECT c.id
        INTO v_class_id
      FROM public.classes c
      WHERE c.nursery_id = p_nursery_id
        AND lower(COALESCE(c.name_ar, '') || ' ' || COALESCE(c.name_en, '')) LIKE '%' || lower(v_preferred_class) || '%'
      ORDER BY c.created_at
      LIMIT 1;
    END IF;

    IF v_class_id IS NULL THEN
      SELECT c.id
        INTO v_class_id
      FROM public.classes c
      WHERE c.nursery_id = p_nursery_id
      ORDER BY c.created_at
      LIMIT 1;
    END IF;

    v_child_name_ar := COALESCE(
      NULLIF(v_child_info->>'full_name_ar', ''),
      NULLIF(v_child_info->>'full_name', ''),
      NULLIF(v_child_info->>'full_name_en', ''),
      'New Child'
    );
    v_child_name_en := COALESCE(
      NULLIF(v_child_info->>'full_name_en', ''),
      NULLIF(v_child_info->>'full_name', ''),
      v_child_name_ar
    );

    BEGIN
      v_child_dob := COALESCE(NULLIF(v_child_info->>'dob', '')::date, CURRENT_DATE);
    EXCEPTION WHEN others THEN
      v_child_dob := CURRENT_DATE;
    END;

    v_gender := NULLIF(v_child_info->>'gender', '');
    IF v_gender NOT IN ('male', 'female') THEN
      v_gender := NULL;
    END IF;

    v_school_preference := NULLIF(v_child_info->>'school_preference', '');
    IF v_school_preference NOT IN ('british', 'american', 'national', 'ib', 'french', 'canadian', 'other') THEN
      v_school_preference := NULL;
    END IF;

    BEGIN
      v_has_siblings := (v_child_info->>'has_siblings')::boolean;
    EXCEPTION WHEN others THEN
      v_has_siblings := NULL;
    END;

    v_photo_privacy := lower(COALESCE(v_child_info->>'photo_privacy', 'false')) IN ('true', '1', 'yes');

    v_daily_care := CASE
      WHEN jsonb_typeof(v_child_info->'daily_care_preferences') = 'object' THEN v_child_info->'daily_care_preferences'
      ELSE NULL
    END;

    v_emergency_contacts := CASE
      WHEN jsonb_typeof(v_child_info->'emergency_contacts') = 'array' THEN v_child_info->'emergency_contacts'
      ELSE NULL
    END;

    INSERT INTO public.children (
      nursery_id,
      class_id,
      full_name_ar,
      full_name_en,
      first_name,
      middle_name,
      last_name,
      nickname,
      dob,
      gender,
      nationality,
      enrollment_department,
      school_preference,
      school_admissions_plan,
      academic_year,
      has_siblings,
      sibling_ages,
      daily_care_preferences,
      emergency_contacts,
      home_address,
      enrollment_date,
      status,
      photo_privacy_restricted,
      avatar_url,
      enrollment_extended_json
    )
    VALUES (
      p_nursery_id,
      v_class_id,
      v_child_name_ar,
      v_child_name_en,
      NULLIF(v_child_info->>'first_name', ''),
      NULLIF(v_child_info->>'middle_name', ''),
      NULLIF(v_child_info->>'last_name', ''),
      NULLIF(v_child_info->>'nickname', ''),
      v_child_dob,
      v_gender,
      NULLIF(v_child_info->>'nationality', ''),
      NULLIF(v_child_info->>'department', ''),
      v_school_preference,
      NULLIF(v_child_info->>'school_admissions_plan', ''),
      NULLIF(v_child_info->>'academic_year', ''),
      v_has_siblings,
      NULLIF(v_child_info->>'sibling_ages', ''),
      v_daily_care,
      v_emergency_contacts,
      COALESCE(NULLIF(v_child_info->>'home_address', ''), NULLIF(v_parent_info#>>'{family,address}', '')),
      CURRENT_DATE,
      'active',
      v_photo_privacy,
      NULLIF(v_child_info->>'avatar_url', ''),
      jsonb_build_object(
        'family', COALESCE(v_parent_info->'family', '{}'::jsonb),
        'parents', jsonb_build_object('father', v_parent_info->'father', 'mother', v_parent_info->'mother'),
        'source_application_id', p_application_id,
        'application_invoice_id', v_application_invoice_id,
        'selected_package_id', v_selected_package_id
      )
    )
    RETURNING id INTO v_child_id;
  ELSE
    UPDATE public.children
       SET status = 'active',
           updated_at = now()
     WHERE id = v_child_id
       AND nursery_id = p_nursery_id
    RETURNING id INTO v_child_id;

    IF v_child_id IS NULL THEN
      RAISE EXCEPTION 'Linked child not found in application nursery' USING ERRCODE = '42704';
    END IF;
  END IF;

  IF v_parent_id IS NOT NULL AND v_child_id IS NOT NULL THEN
    INSERT INTO public.parent_children (parent_id, child_id, relationship)
    VALUES (
      v_parent_id,
      v_child_id,
      CASE
        WHEN jsonb_typeof(v_parent_info->'mother') = 'object' THEN 'mother'
        WHEN jsonb_typeof(v_parent_info->'father') = 'object' THEN 'father'
        ELSE 'guardian'
      END
    )
    ON CONFLICT (parent_id, child_id) DO NOTHING;
  END IF;

  IF v_selected_package_id IS NOT NULL AND v_child_id IS NOT NULL THEN
    UPDATE public.child_packages
       SET status = 'cancelled'
     WHERE child_id = v_child_id
       AND status = 'active';

    INSERT INTO public.child_packages (package_id, child_id, nursery_id, status)
    VALUES (v_selected_package_id, v_child_id, p_nursery_id, 'active')
    ON CONFLICT DO NOTHING;
  END IF;

  UPDATE public.applications
     SET status = 'approved',
         reviewed_by = v_uid,
         reviewed_at = now(),
         parent_id = v_parent_id,
         child_id = v_child_id,
         rejection_reason = NULL
   WHERE id = p_application_id;

  RETURN jsonb_build_object(
    'childId', v_child_id,
    'parentId', v_parent_id,
    'invoiceId', v_application_invoice_id,
    'paidAmount', v_confirmed_paid
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_application_enrollment(uuid, uuid, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.approve_application_enrollment(uuid, uuid, boolean) TO authenticated;

COMMIT;

-- Atomic admin approval for admission applications.
--
-- The browser used to update the application, child, parent_children link, and
-- invoice in separate RLS-protected requests. If any later request failed or
-- was blocked, the parent dashboard would not get an active child even though
-- the admin clicked Approve. Keep the state transition together server-side.

BEGIN;

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
  v_existing_invoice_id uuid;
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
        'source_application_id', p_application_id
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

  IF p_auto_generate_first_invoice AND v_parent_id IS NOT NULL THEN
    SELECT i.id
      INTO v_existing_invoice_id
    FROM public.invoices i
    WHERE i.nursery_id = p_nursery_id
      AND i.parent_id = v_parent_id
      AND i.invoice_type = 'other'
      AND i.line_items_json::text LIKE '%Enrollment fee (placeholder)%'
    ORDER BY i.created_at
    LIMIT 1;

    IF v_existing_invoice_id IS NULL THEN
      INSERT INTO public.invoices (
        nursery_id,
        parent_id,
        amount,
        status,
        invoice_type,
        due_date,
        line_items_json
      )
      VALUES (
        p_nursery_id,
        v_parent_id,
        0,
        'pending',
        'other',
        (CURRENT_DATE + 7),
        jsonb_build_object(
          'items',
          jsonb_build_array(
            jsonb_build_object(
              'description', 'Enrollment fee (placeholder)',
              'quantity', 1,
              'unit_price', 0,
              'total', 0
            )
          )
        )
      );
    END IF;
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
    'parentId', v_parent_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_application_enrollment(uuid, uuid, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.approve_application_enrollment(uuid, uuid, boolean) TO authenticated;

COMMIT;

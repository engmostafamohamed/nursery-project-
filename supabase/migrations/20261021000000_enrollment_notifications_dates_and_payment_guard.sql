-- Admissions → class: who is told what, on which day, and when a parent may pay.
--
-- 1. The parent is told their child was accepted by the database, the moment the application
--    becomes 'approved'. Before, the admin's browser inserted that notification after
--    approve_application_enrollment() returned, so a closed tab or a dropped connection lost it.
-- 2. A class's lead and backup teachers are told when a child joins it: at enrollment with a
--    class, and when staff move a child into a class later. Children created in bulk (imports)
--    are not announced one by one.
-- 3. approve_application_enrollment() dates the enrollment and the tuition subscription with
--    the nursery's own calendar day (its timezone) instead of the server's UTC date. The rest of
--    its body is unchanged from 20261017000100_class_backup_teacher_and_enrollment_class.sql.
-- 4. A parent cannot pay an admission invoice while its application is a draft without the
--    terms or the four required documents: the money was recorded but the application could
--    never be sent for review. Signup already checked this in its function and the new-child
--    wizard in the browser; the invoice payment page did not. Staff recording a payment
--    (admin_record_invoice_payment) write payments directly and are not affected.

begin;

-- 1. The parent hears about the approval from the database -----------------------------------

create or replace function public.notify_parent_application_approved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.parent_id is not null then
    perform public.notify_users(
      array[new.parent_id], new.nursery_id, 'application_approved', 'application_approved', '{}'::jsonb,
      '/parent/applications/' || new.id::text, 'normal', null
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_parent_application_approved on public.applications;
create trigger trg_notify_parent_application_approved
  after update of status on public.applications
  for each row
  when (new.status = 'approved' and old.status is distinct from 'approved')
  execute function public.notify_parent_application_approved();

-- 2. The class's teachers hear about a new child ------------------------------------------------

-- The lead and backup teachers of the class, with the child's and the class's names.
create or replace function public.notify_class_staff_child_added(p_child_id uuid, p_class_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  select coalesce((
    select public.notify_users(
      array(select cs.user_id from public.class_staff cs where cs.class_id = cl.id),
      c.nursery_id, 'class_child_added', 'class_child_added',
      jsonb_build_object(
        'child', public.i18n_names(c.full_name_ar, c.full_name_en),
        'class', public.i18n_names(cl.name_ar, cl.name_en)
      ),
      '/teacher/classes', 'normal', null
    )
    from public.children c
    join public.classes cl on cl.id = p_class_id and cl.deleted_at is null
    where c.id = p_child_id
  ), 0)
$$;

create or replace function public.children_notify_class_staff()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'active' then
    perform public.notify_class_staff_child_added(new.id, new.class_id);
  end if;
  return new;
end;
$$;

-- Only moves into a class: a child inserted with a class (enrollment, imports) is not announced
-- here; approve_application_enrollment() announces its own.
drop trigger if exists trg_children_notify_class_staff on public.children;
create trigger trg_children_notify_class_staff
  after update of class_id on public.children
  for each row
  when (new.class_id is not null and new.class_id is distinct from old.class_id)
  execute function public.children_notify_class_staff();

revoke all on function public.notify_parent_application_approved() from public, anon, authenticated;
revoke all on function public.notify_class_staff_child_added(uuid, uuid) from public, anon, authenticated;
revoke all on function public.children_notify_class_staff() from public, anon, authenticated;

-- 3. Enrollment on the nursery's calendar day ---------------------------------------------------

CREATE OR REPLACE FUNCTION public.approve_application_enrollment(
  p_application_id uuid,
  p_nursery_id uuid,
  p_auto_generate_first_invoice boolean DEFAULT true,
  p_class_id uuid DEFAULT NULL
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
  v_application_invoice_amount numeric;
  v_application_invoice_line_items jsonb;
  v_selected_tuition_package_id uuid;
  v_selected_extra_hours_package_id uuid;
  v_confirmed_paid numeric := 0;
  v_photo_privacy boolean := false;
  v_billing_period text;
  v_billing_months integer;
  v_locked_price numeric;
  v_tuition_package_name_ar text;
  v_tuition_package_name_en text;
  v_today date;
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

  IF p_class_id IS NOT NULL THEN
    SELECT c.id
      INTO v_class_id
    FROM public.classes c
    WHERE c.id = p_class_id
      AND c.nursery_id = p_nursery_id
      AND c.deleted_at IS NULL;

    IF v_class_id IS NULL THEN
      RAISE EXCEPTION 'enrollment_class_not_found' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- The nursery's own calendar day, not the server's UTC date: enrollment and the first tuition
  -- period start on it (an approval just after midnight in Cairo was dated the day before).
  SELECT (now() AT TIME ZONE COALESCE(ns.timezone, 'Africa/Cairo'))::date
    INTO v_today
  FROM public.nursery_settings ns
  WHERE ns.nursery_id = p_nursery_id;
  v_today := COALESCE(v_today, (now() AT TIME ZONE 'Africa/Cairo')::date);

  v_parent_info := COALESCE(v_app.parent_info_json, '{}'::jsonb);
  v_child_info := COALESCE(v_app.child_info_json, '{}'::jsonb);
  v_parent_id := v_app.parent_id;
  v_child_id := v_app.child_id;
  v_selected_extra_hours_package_id := v_app.extra_hours_package_id;

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

  SELECT i.id, i.line_items_json, NULLIF(i.line_items_json->>'package_id', '')::uuid, i.amount
    INTO v_application_invoice_id, v_application_invoice_line_items, v_selected_tuition_package_id, v_application_invoice_amount
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

  v_billing_period := COALESCE(NULLIF(v_application_invoice_line_items->>'billing_period', ''), 'monthly');
  v_billing_months := COALESCE(NULLIF(v_application_invoice_line_items->>'billing_months', '')::integer, 1);
  v_tuition_package_name_ar := COALESCE(v_application_invoice_line_items->>'package_name_ar', '');
  v_tuition_package_name_en := COALESCE(v_application_invoice_line_items->>'package_name_en', '');
  -- The ongoing subscription must bill the real (pre-discount) period price — a deal only ever
  -- discounts this one admission invoice. `subtotal` is only present on invoices created after
  -- deals shipped; older invoices never had a discount to begin with, so `amount` is correct there.
  v_locked_price := COALESCE(NULLIF(v_application_invoice_line_items->>'subtotal', '')::numeric, v_application_invoice_amount);

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

    IF v_class_id IS NULL AND v_preferred_class IS NOT NULL THEN
      SELECT c.id
        INTO v_class_id
      FROM public.classes c
      WHERE c.nursery_id = p_nursery_id
        AND c.deleted_at IS NULL
        AND lower(COALESCE(c.name_ar, '') || ' ' || COALESCE(c.name_en, '')) LIKE '%' || lower(v_preferred_class) || '%'
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
      v_child_dob := COALESCE(NULLIF(v_child_info->>'dob', '')::date, v_today);
    EXCEPTION WHEN others THEN
      v_child_dob := v_today;
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
      v_today,
      'active',
      v_photo_privacy,
      NULLIF(v_child_info->>'avatar_url', ''),
      jsonb_build_object(
        'family', COALESCE(v_parent_info->'family', '{}'::jsonb),
        'parents', jsonb_build_object('father', v_parent_info->'father', 'mother', v_parent_info->'mother'),
        'source_application_id', p_application_id,
        'application_invoice_id', v_application_invoice_id,
        'selected_tuition_package_id', v_selected_tuition_package_id,
        'selected_extra_hours_package_id', v_selected_extra_hours_package_id
      )
    )
    RETURNING id INTO v_child_id;

    -- The class's teachers hear about their new child. Moving a child into a class later is
    -- announced by trg_children_notify_class_staff.
    IF v_class_id IS NOT NULL THEN
      PERFORM public.notify_class_staff_child_added(v_child_id, v_class_id);
    END IF;
  ELSE
    UPDATE public.children
       SET status = 'active',
           class_id = COALESCE(v_class_id, class_id),
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

  IF v_selected_extra_hours_package_id IS NOT NULL AND v_child_id IS NOT NULL THEN
    UPDATE public.child_packages
       SET status = 'cancelled'
     WHERE child_id = v_child_id
       AND status = 'active';

    INSERT INTO public.child_packages (package_id, child_id, nursery_id, status)
    VALUES (v_selected_extra_hours_package_id, v_child_id, p_nursery_id, 'active')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Start the ongoing tuition subscription. next_invoice_date is the enrollment date plus one
  -- full period, since the admission invoice the parent already paid covers period 1.
  IF v_selected_tuition_package_id IS NOT NULL AND v_child_id IS NOT NULL AND v_parent_id IS NOT NULL THEN
    UPDATE public.child_tuition_subscriptions
       SET status = 'cancelled',
           cancelled_at = now()
     WHERE child_id = v_child_id
       AND status = 'active';

    INSERT INTO public.child_tuition_subscriptions (
      nursery_id, child_id, tuition_package_id, tuition_package_name_ar, tuition_package_name_en,
      billing_period, duration_months, locked_price, billed_parent_id, status, started_at,
      next_invoice_date, last_invoice_id, source_application_id, created_by
    )
    VALUES (
      p_nursery_id, v_child_id, v_selected_tuition_package_id, v_tuition_package_name_ar, v_tuition_package_name_en,
      v_billing_period, v_billing_months, COALESCE(v_locked_price, 0), v_parent_id, 'active', v_today,
      v_today + make_interval(months => v_billing_months), v_application_invoice_id, p_application_id, NULL
    )
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
    'paidAmount', v_confirmed_paid,
    'classId', (SELECT ch.class_id FROM public.children ch WHERE ch.id = v_child_id)
  );
END;
$$;

revoke all on function public.approve_application_enrollment(uuid, uuid, boolean, uuid) from public;
grant execute on function public.approve_application_enrollment(uuid, uuid, boolean, uuid) to authenticated;

-- 4. No payment for an application that cannot be sent for review ------------------------------

create or replace function public.payment_attempts_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices%rowtype;
  v_remaining numeric;
  v_application_id uuid;
  v_application_status text;
  v_terms_accepted boolean;
begin
  select * into v_invoice from public.invoices where id = new.invoice_id for update;
  if not found then
    raise exception 'payment_invoice_not_found' using errcode = 'P0001';
  end if;
  if new.parent_id is distinct from v_invoice.parent_id then
    raise exception 'payment_invoice_not_yours' using errcode = '42501';
  end if;
  if v_invoice.status in ('paid', 'cancelled') then
    raise exception 'payment_invoice_closed' using errcode = 'P0001';
  end if;
  if new.amount is null or new.amount <= 0 then
    raise exception 'payment_invalid_amount' using errcode = 'P0001';
  end if;

  -- Added: paying an admission invoice is what sends its application for review, so a draft
  -- still missing the terms or a required document would take the money and stay a draft.
  begin
    v_application_id := nullif(v_invoice.line_items_json ->> 'application_id', '')::uuid;
  exception when others then
    v_application_id := null;
  end;
  if v_application_id is not null then
    select a.status, coalesce(a.terms_accepted, false)
      into v_application_status, v_terms_accepted
      from public.applications a
     where a.id = v_application_id;
    if v_application_status = 'draft'
       and (not v_terms_accepted or not public.application_has_required_documents(v_application_id)) then
      raise exception 'payment_application_incomplete' using errcode = 'P0001';
    end if;
  end if;

  new.nursery_id := v_invoice.nursery_id;
  new.status := coalesce(new.status, 'pending_confirmation');

  if new.status = 'pending_confirmation' then
    v_remaining := v_invoice.amount - public.invoice_paid_total(v_invoice.id) - public.invoice_pending_total(v_invoice.id);
    if new.amount > v_remaining + 0.005 then
      raise exception 'payment_exceeds_balance' using errcode = 'P0001', detail = round(greatest(v_remaining, 0), 2)::text;
    end if;
    if nullif(v_invoice.line_items_json ->> 'application_id', '') is not null
       and new.amount < v_remaining - 0.005 then
      raise exception 'payment_full_amount_required' using errcode = 'P0001', detail = round(greatest(v_remaining, 0), 2)::text;
    end if;
    if exists (
      select 1 from public.payment_attempts pa
      where pa.invoice_id = new.invoice_id
        and pa.parent_id = new.parent_id
        and pa.status = 'pending_confirmation'
        and pa.amount = new.amount
        and pa.created_at > now() - interval '2 minutes'
    ) then
      raise exception 'payment_duplicate' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

commit;

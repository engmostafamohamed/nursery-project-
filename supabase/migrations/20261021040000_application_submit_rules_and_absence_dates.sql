-- Rules the browser checked but the server did not (found by scripts/ops/e2e-enrollment-to-attendance.mjs):
--
-- 1. A parent's draft reaches the nursery only with a payment. A parent may move their own draft to
--    'submitted' only when the terms are accepted and the application's admission invoice has a
--    payment sent (waiting for confirmation or confirmed) or completed. The payment itself submits
--    the application (submit_application_for_review, from the payment-attempt trigger) and passes,
--    because the attempt already exists.
-- 2. After the nursery asks for documents, the parent can send the application back only after
--    uploading at least one document since that request.
-- 3. The nursery's admins are told by the database when a parent sends an application back after a
--    documents request, or submits it by hand after a payment the nursery recorded. The browser used
--    to look the admins up itself, which a parent may not do, so nobody was told.
--    submit_application_for_review keeps telling them itself and marks the transaction, so they are
--    not told twice.
-- 4. A parent reports an absence for today onward (the nursery's day), as the form allows; staff may
--    record any day.

begin;

-- 1 and 2 ---------------------------------------------------------------------------------------

/** Whether a payment for the application's admission invoice has been sent or completed. */
create or replace function public.application_has_payment_sent(p_application_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.invoices i
    where i.line_items_json ->> 'application_id' = p_application_id::text
      and i.status <> 'cancelled'
      and (
        exists (
          select 1 from public.payment_attempts pa
          where pa.invoice_id = i.id and pa.status in ('pending_confirmation', 'confirmed')
        )
        or exists (
          select 1 from public.payments p
          where p.invoice_id = i.id and p.status = 'completed'
        )
      )
  )
$$;

revoke all on function public.application_has_payment_sent(uuid) from public, anon;
grant execute on function public.application_has_payment_sent(uuid) to authenticated, service_role;

create or replace function public.prevent_parent_reviewed_application_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
BEGIN
  IF public.current_user_role() IS DISTINCT FROM 'parent' THEN
    RETURN NEW;
  END IF;
  IF OLD.parent_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Parents may only edit their own application';
  END IF;

  IF OLD.status = 'draft' THEN
    IF NEW.status = 'submitted' THEN
      IF NOT coalesce(NEW.terms_accepted, false) THEN
        RAISE EXCEPTION 'application_terms_required' USING ERRCODE = 'P0001';
      END IF;
      IF NOT public.application_has_payment_sent(NEW.id) THEN
        RAISE EXCEPTION 'application_payment_required' USING ERRCODE = 'P0001';
      END IF;
    ELSIF NEW.status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'Parents can only submit a draft';
    END IF;
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
    IF NEW.status = 'submitted' AND NOT EXISTS (
      SELECT 1
      FROM public.application_documents d
      WHERE d.application_id = NEW.id
        AND coalesce(d.file_url, '') <> ''
        AND d.uploaded_at > coalesce(OLD.reviewed_at, '-infinity'::timestamptz)
    ) THEN
      RAISE EXCEPTION 'requested_documents_not_updated' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Reviewed application data is locked';
END;
$$;

-- 3 -----------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.submit_application_for_review(p_application_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
declare
  v_app public.applications%rowtype;
  v_parent_name text;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_reason_param jsonb;
begin
  select * into v_app from public.applications where id = p_application_id for update;
  if not found or v_app.status <> 'draft' then
    return false;
  end if;
  if not coalesce(v_app.terms_accepted, false) then
    return false;
  end if;
  if not public.application_has_required_documents(v_app.id) then
    return false;
  end if;

  -- The admins hear about this submission from the notice below; the status trigger leaves it to us.
  perform set_config('app.application_submit_notified', v_app.id::text, true);

  update public.applications
     set status = 'submitted',
         submitted_at = coalesce(submitted_at, now())
   where id = v_app.id;

  -- The parent's own reminders about this application are no longer actionable.
  update public.notifications
     set read = true
   where user_id = v_app.parent_id
     and read = false
     and action_link = '/parent/applications/' || v_app.id::text;

  select coalesce(
           nullif(v_app.parent_info_json ->> 'full_name', ''),
           nullif(u.name_ar, ''),
           nullif(u.name_en, '')
         )
    into v_parent_name
  from public.users u
  where u.id = v_app.parent_id;
  v_parent_name := coalesce(v_parent_name, nullif(v_app.parent_info_json ->> 'full_name', ''));

  -- Known reason codes are labelled by the app; anything else is shown as written.
  v_reason_param := case
    when v_reason is null then null
    when v_reason in ('payment_submitted', 'payment submitted')
      then jsonb_build_object('i18n', 'notificationTemplates.application_submitted.reasons.payment_submitted')
    else to_jsonb(v_reason)
  end;

  perform public.notify_users(
    array(
      select u.id from public.users u
      where u.nursery_id = v_app.nursery_id
        and u.role in ('branch_admin'::public.user_role, 'chain_super_admin'::public.user_role)
    ),
    v_app.nursery_id,
    'application_submitted',
    'application_submitted',
    jsonb_build_object(
      'parent', coalesce(to_jsonb(v_parent_name), jsonb_build_object('i18n', 'notificationTemplates.common.parent')),
      'reason', v_reason_param,
      'segments', case when v_reason_param is not null then '["reason"]'::jsonb else '[]'::jsonb end
    ),
    '/admin/admissions/applications/' || v_app.id::text
  );

  return true;
end;
$function$;

create or replace function public.notify_admins_application_resubmitted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_name text;
begin
  -- submit_application_for_review (the payment) tells the admins itself.
  if current_setting('app.application_submit_notified', true) = new.id::text then
    return new;
  end if;

  select coalesce(nullif(new.parent_info_json ->> 'full_name', ''), nullif(u.name_ar, ''), nullif(u.name_en, ''))
    into v_parent_name
  from public.users u
  where u.id = new.parent_id;

  perform public.notify_users(
    array(
      select u.id from public.users u
      where u.nursery_id = new.nursery_id
        and u.role in ('branch_admin'::public.user_role, 'chain_super_admin'::public.user_role)
    ),
    new.nursery_id,
    'application_submitted',
    'application_submitted',
    jsonb_build_object(
      'parent', coalesce(to_jsonb(v_parent_name), jsonb_build_object('i18n', 'notificationTemplates.common.parent')),
      'reason', jsonb_build_object(
        'i18n',
        'notificationTemplates.application_submitted.reasons.'
          || case when old.status = 'documents_pending' then 'documents_resubmitted' else 'payment_submitted' end
      ),
      'segments', '["reason"]'::jsonb
    ),
    '/admin/admissions/applications/' || new.id::text
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_admins_application_resubmitted on public.applications;
create trigger trg_notify_admins_application_resubmitted
  after update of status on public.applications
  for each row
  when (new.status = 'submitted' and old.status in ('draft', 'documents_pending'))
  execute function public.notify_admins_application_resubmitted();

-- 4 -----------------------------------------------------------------------------------------------

create or replace function public.attendance_absence_reports_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date;
begin
  select c.nursery_id into new.nursery_id from public.children c where c.id = new.child_id;
  new.reported_by := coalesce(auth.uid(), new.reported_by);

  -- Parents report ahead: today onward, in the nursery's own day. Staff may record any day.
  if auth.uid() is not null and not public.attendance_staff_can_access_child(new.child_id) then
    select (now() at time zone coalesce(ns.timezone, 'Africa/Cairo'))::date
      into v_today
    from public.nursery_settings ns
    where ns.nursery_id = new.nursery_id;
    if new.absence_date < coalesce(v_today, (now() at time zone 'Africa/Cairo')::date) then
      raise exception 'absence_date_in_past' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

commit;

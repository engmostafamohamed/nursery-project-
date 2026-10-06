-- 1) Notifications carry a template key + raw parameters instead of translated text.
--    Display text lives only in the app's locale files (notificationTemplates.*), so SQL never
--    builds Arabic/English sentences. Older rows keep their stored title/body and still render.
-- 2) Extra hours can be counted from closing time (as before) or from the check-in scan:
--    the child's tuition package daily_hours (else the nursery's opening span) after check-in.
-- 3) Payments: one server path per action with locking, balance checks and idempotency keys,
--    so a double click can never record a payment twice; parents can no longer create
--    attempts on someone else's invoice or above the balance; loyalty redemption works again
--    (parents had no insert right on loyalty_transactions, so it always failed).
-- 4) Four RLS helpers were STABLE yet ran SET LOCAL, which raises "SET is not allowed in a
--    non-volatile function" on every call; they are made VOLATILE (logic unchanged).

begin;

-- =============================================================================
-- 1. Notification templates
-- =============================================================================

alter table public.notifications
  add column if not exists template_key text,
  add column if not exists template_params jsonb not null default '{}'::jsonb;

alter table public.notifications
  alter column title_ar drop not null,
  alter column title_en drop not null,
  alter column body_ar drop not null,
  alter column body_en drop not null;

do $$
begin
  alter table public.notifications
    add constraint notifications_text_or_template_ck
    check (
      template_key is not null
      or (title_ar is not null and title_en is not null and body_ar is not null and body_en is not null)
    );
exception when duplicate_object then null;
end $$;

-- Localized *data* (names are data, not translations): {"ar": ..., "en": ...}.
create or replace function public.i18n_names(p_ar text, p_en text)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object('ar', nullif(trim(p_ar), ''), 'en', nullif(trim(p_en), ''))
$$;

create or replace function public.user_names(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.i18n_names(u.name_ar, u.name_en)
  from public.users u
  where u.id = p_user_id
    and coalesce(nullif(trim(u.name_ar), ''), nullif(trim(u.name_en), '')) is not null
$$;

-- In-app notification for each user, rendered by the app from notificationTemplates.<key>.
-- Parameter conventions (see src/lib/notificationText.ts): {ar,en} objects pick the reader's
-- language, time / *_time are ISO timestamps shown in "tz", date / *_date are YYYY-MM-DD,
-- amount/fee/refund/rate are money in "currency", {"i18n": "<key>"} is translated, and
-- "segments" lists the optional sentence parts to append.
create or replace function public.notify_users(
  p_user_ids uuid[],
  p_nursery_id uuid,
  p_type text,
  p_template_key text,
  p_params jsonb default '{}'::jsonb,
  p_action_link text default null,
  p_urgency text default 'normal',
  p_image_url text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.notifications (
    nursery_id, user_id, type, template_key, template_params, read, channel, sent_at, action_link, urgency, image_url
  )
  select p_nursery_id, uid, p_type, p_template_key, coalesce(p_params, '{}'::jsonb), false, 'in_app', now(),
         p_action_link, coalesce(p_urgency, 'normal'), p_image_url
  from (select distinct unnest(p_user_ids) as uid) recipients
  where uid is not null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.attendance_notify_parents(
  p_child_id uuid,
  p_type text,
  p_template_key text,
  p_params jsonb,
  p_action_link text default '/parent/attendance',
  p_urgency text default 'normal',
  p_image_url text default null
)
returns integer
language sql
security definer
set search_path = public
as $$
  select public.notify_users(
    array(select pc.parent_id from public.parent_children pc where pc.child_id = p_child_id),
    c.nursery_id, p_type, p_template_key, p_params, p_action_link, p_urgency, p_image_url
  )
  from public.children c
  where c.id = p_child_id
$$;

create or replace function public.attendance_notify_staff(
  p_nursery_id uuid,
  p_roles public.user_role[],
  p_type text,
  p_template_key text,
  p_params jsonb,
  p_action_link text default '/admin/attendance',
  p_urgency text default 'normal'
)
returns integer
language sql
security definer
set search_path = public
as $$
  select public.notify_users(
    array(select u.id from public.users u where u.nursery_id = p_nursery_id and u.role = any (p_roles)),
    p_nursery_id, p_type, p_template_key, p_params, p_action_link, p_urgency, null
  )
$$;

-- =============================================================================
-- 2. Extra-hours base: closing time, or stay duration from the check-in scan
-- =============================================================================

alter table public.nursery_settings
  add column if not exists late_billing_base text not null default 'closing_time';

do $$
begin
  alter table public.nursery_settings
    add constraint nursery_settings_late_billing_base_ck check (late_billing_base in ('closing_time', 'stay_duration'));
exception when duplicate_object then null;
end $$;

-- The moment after which extra time starts to accrue (before grace).
create or replace function public.attendance_billing_start(p_att public.attendance_records, p_ns public.nursery_settings)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_hours numeric;
begin
  if coalesce(p_ns.late_billing_base, 'closing_time') = 'stay_duration' and p_att.check_in is not null then
    select tp.daily_hours into v_hours
    from public.child_tuition_subscriptions s
    join public.tuition_packages tp on tp.id = s.tuition_package_id
    where s.child_id = p_att.child_id
      and s.status = 'active'
      and coalesce(tp.daily_hours, 0) > 0
    order by s.started_at desc nulls last
    limit 1;

    if v_hours is null
       and p_ns.standard_start_time is not null
       and p_ns.standard_end_time is not null
       and p_ns.standard_end_time > p_ns.standard_start_time then
      v_hours := extract(epoch from (p_ns.standard_end_time - p_ns.standard_start_time)) / 3600.0;
    end if;

    if v_hours is not null then
      return p_att.check_in + make_interval(secs => round(v_hours * 3600)::double precision);
    end if;
  end if;

  if p_ns.standard_end_time is null then
    return null;
  end if;
  return (p_att.attendance_date::text || ' ' || p_ns.standard_end_time::text)::timestamp
         at time zone coalesce(p_ns.timezone, 'Africa/Cairo');
end;
$$;

create or replace function public.attendance_compute_extra_time(
  p_att public.attendance_records,
  p_ns public.nursery_settings,
  p_as_of timestamptz
)
returns table (late_minutes integer, is_late boolean, target_hours numeric)
language plpgsql
stable
set search_path = public
as $$
declare
  v_grace integer := greatest(coalesce(p_ns.late_pickup_grace_minutes, 0), 0);
  v_unit integer := case when p_ns.late_billing_unit_minutes in (15, 30, 60) then p_ns.late_billing_unit_minutes else 60 end;
  v_from_grace boolean := coalesce(p_ns.late_billing_from, 'end_time') = 'grace_end';
  v_start timestamptz := public.attendance_billing_start(p_att, p_ns);
  v_late integer := 0;
  v_billable integer := 0;
  v_early integer := 0;
begin
  if v_start is not null and p_as_of is not null then
    v_late := greatest(0, floor(extract(epoch from (p_as_of - v_start)) / 60)::integer);
  end if;

  if v_late > v_grace then
    v_billable := case when v_from_grace then v_late - v_grace else v_late end;
  end if;

  -- Early arrival only means something against fixed opening hours.
  if coalesce(p_ns.late_billing_base, 'closing_time') = 'closing_time'
     and coalesce(p_ns.early_arrival_billing_enabled, false)
     and coalesce(p_att.early_minutes, 0) > v_grace then
    v_early := case when v_from_grace then p_att.early_minutes - v_grace else p_att.early_minutes end;
  end if;

  late_minutes := v_late;
  is_late := v_late > v_grace;
  target_hours := case
    when v_billable + v_early > 0 then ceil((v_billable + v_early)::numeric / v_unit) * v_unit / 60.0
    else 0
  end;
  return next;
end;
$$;

-- Invoice line for late-pickup hours: a "kind" the app labels from its locale files.
create or replace function public.attendance_merge_late_item(
  p_items jsonb,
  p_date date,
  p_hours numeric,
  p_rate numeric,
  p_fee numeric
)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_out jsonb := '[]'::jsonb;
  v_item jsonb;
  v_merged boolean := false;
begin
  for v_item in
    select value from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end)
  loop
    if not v_merged
       and v_item ->> 'attendance_date' = p_date::text
       and (v_item ->> 'unitPrice') ~ '^-?[0-9]+(\.[0-9]+)?$'
       and (v_item ->> 'unitPrice')::numeric = p_rate then
      v_item := v_item || jsonb_build_object(
        'kind', 'late_pickup',
        'quantity', round(coalesce((v_item ->> 'quantity')::numeric, 0) + p_hours, 2),
        'total', round(coalesce((v_item ->> 'total')::numeric, 0) + p_fee, 2)
      );
      v_merged := true;
      continue when (v_item ->> 'quantity')::numeric = 0 and (v_item ->> 'total')::numeric = 0;
    end if;
    v_out := v_out || jsonb_build_array(v_item);
  end loop;

  if not v_merged and (p_hours <> 0 or p_fee <> 0) then
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'kind', 'late_pickup',
      'attendance_date', p_date,
      'quantity', round(p_hours, 2),
      'unitPrice', p_rate,
      'unit_price', p_rate,
      'total', round(p_fee, 2)
    ));
  end if;
  return v_out;
end;
$$;

-- =============================================================================
-- 3. Attendance functions: same behaviour, template notifications
-- =============================================================================

create or replace function public.apply_attendance_late_charge(
  p_attendance_id uuid,
  p_as_of timestamptz,
  p_source text,
  p_finalize boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_att public.attendance_records%rowtype;
  v_child public.children%rowtype;
  v_ns public.nursery_settings%rowtype;
  v_calc record;
  v_target numeric;
  v_previous numeric;
  v_delta numeric := 0;
  v_covered numeric := 0;
  v_chargeable numeric := 0;
  v_rate numeric;
  v_fee numeric := 0;
  v_invoice_id uuid;
  v_cap integer;
  v_newly_capped boolean := false;
  v_total_hours numeric;
  v_total_fee numeric;
  v_total_covered numeric;
  v_child_names jsonb;
begin
  if p_source not in ('sweep', 'checkout', 'correction') then
    raise exception 'Invalid late-charge source' using errcode = '22023';
  end if;

  select * into v_att from public.attendance_records where id = p_attendance_id for update;
  if not found then
    raise exception 'attendance_not_found' using errcode = 'P0002';
  end if;

  if v_att.late_charge_waived then
    if p_finalize then
      update public.attendance_records set late_charge_status = 'final' where id = p_attendance_id;
    end if;
    return jsonb_build_object('skipped', true, 'reason', 'waived', 'extra_hours', 0, 'extra_fee', 0);
  end if;
  if v_att.late_charge_status = 'final' and not p_finalize then
    return jsonb_build_object('skipped', true, 'reason', 'already_final');
  end if;
  if p_source = 'sweep' and v_att.check_out is not null then
    return jsonb_build_object('skipped', true, 'reason', 'already_checked_out');
  end if;

  select * into v_child from public.children where id = v_att.child_id;
  if not found then
    return jsonb_build_object('skipped', true, 'reason', 'child_not_found');
  end if;
  select * into v_ns from public.nursery_settings where nursery_id = v_child.nursery_id;

  select * into v_calc from public.attendance_compute_extra_time(v_att, v_ns, p_as_of);
  v_target := v_calc.target_hours;
  v_rate := coalesce(v_ns.late_pickup_fee_per_hour, 0);

  -- Nothing late yet: leave the row untouched (the sweep checks open days every 15 minutes).
  if v_target = 0 and coalesce(v_att.extra_hours, 0) = 0 and not p_finalize then
    return jsonb_build_object('skipped', true, 'reason', 'not_late', 'late_minutes', v_calc.late_minutes);
  end if;

  -- The unattended sweep stops at the cap and alerts staff; a confirmed checkout bills in full.
  if p_source = 'sweep' then
    v_cap := coalesce(v_ns.late_sweep_cap_hours, 3);
    if v_target > v_cap then
      v_target := v_cap;
      v_newly_capped := not v_att.late_charge_capped;
    end if;
  end if;

  v_previous := coalesce(v_att.extra_hours, 0);
  v_delta := greatest(v_target - v_previous, 0);

  if v_delta > 0 then
    v_covered := coalesce(public.package_apply_extra_hours(v_att.child_id, v_delta, true), 0);
    v_chargeable := greatest(v_delta - v_covered, 0);
    v_fee := round(v_chargeable * v_rate, 2);
  end if;

  v_invoice_id := v_att.late_charge_invoice_id;
  if v_fee > 0 then
    v_invoice_id := public.attendance_add_late_fee_to_invoice(v_att, v_child, v_ns, v_chargeable, v_rate, v_fee, p_source);
  end if;

  v_total_hours := v_previous + v_delta;
  v_total_fee := coalesce(v_att.extra_fee, 0) + v_fee;
  v_total_covered := coalesce(v_att.extra_hours_covered, 0) + v_covered;

  update public.attendance_records
     set extra_hours = v_total_hours,
         extra_fee = v_total_fee,
         extra_hours_covered = v_total_covered,
         extra_hours_billed = coalesce(extra_hours_billed, 0) + v_chargeable,
         late_fee_rate = case when v_delta > 0 or late_fee_rate is null then v_rate else late_fee_rate end,
         late_minutes = v_calc.late_minutes,
         late_charge_status = case when p_finalize then 'final' else 'provisional' end,
         late_charge_source = p_source,
         late_charge_applied_at = now(),
         late_charge_invoice_id = coalesce(v_invoice_id, late_charge_invoice_id),
         late_charge_capped = late_charge_capped or v_newly_capped
   where id = p_attendance_id;

  if v_delta > 0 then
    perform public.attendance_log_event(
      p_attendance_id, v_att.child_id, 'late_charge', null, null,
      jsonb_build_object(
        'source', p_source, 'late_minutes', v_calc.late_minutes, 'added_hours', v_delta,
        'covered_hours', v_covered, 'billed_hours', v_chargeable, 'rate', v_rate, 'fee', v_fee,
        'total_hours', v_total_hours, 'total_fee', v_total_fee, 'invoice_id', v_invoice_id
      ),
      null
    );
  end if;

  v_child_names := public.i18n_names(v_child.full_name_ar, v_child.full_name_en);

  -- While the child is still here, tell the parents each time more extra time is charged.
  -- (A real checkout reports the final amount in its own pickup notification.)
  if p_source = 'sweep' and v_delta > 0 then
    perform public.attendance_notify_parents(
      v_child.id,
      'extra_hours_accruing',
      'extra_hours_accruing',
      jsonb_build_object(
        'child', v_child_names,
        'hours', v_total_hours,
        'covered', v_total_covered,
        'fee', v_total_fee,
        'currency', coalesce(v_ns.currency, 'EGP'),
        'segments', case when v_total_covered > 0 then '["covered", "fee"]'::jsonb else '["fee"]'::jsonb end
      ),
      '/parent/attendance',
      'high'
    );
  end if;

  if v_newly_capped then
    perform public.attendance_notify_staff(
      v_child.nursery_id,
      array['branch_admin', 'manager', 'teacher']::public.user_role[],
      'late_pickup_cap_reached',
      'late_pickup_cap_reached',
      jsonb_build_object('child', v_child_names, 'cap', v_cap),
      '/admin/attendance',
      'high'
    );
    perform public.attendance_notify_parents(
      v_child.id,
      'late_pickup_cap_reached',
      'late_pickup_cap_reached_parent',
      jsonb_build_object('child', v_child_names, 'cap', v_cap),
      '/parent/attendance',
      'high'
    );
  end if;

  return jsonb_build_object(
    'late_pickup', v_calc.is_late,
    'late_minutes', v_calc.late_minutes,
    'extra_hours', v_total_hours,
    'extra_hours_covered', v_total_covered,
    'extra_hours_billed', coalesce(v_att.extra_hours_billed, 0) + v_chargeable,
    'extra_fee', v_total_fee,
    'fee_rate', v_rate,
    'invoice_id', v_invoice_id,
    'added_hours', v_delta,
    'added_fee', v_fee,
    'capped', v_att.late_charge_capped or v_newly_capped
  );
end;
$$;

create or replace function public.attendance_reduce_late_charge(p_attendance_id uuid, p_target_hours numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_att public.attendance_records%rowtype;
  v_child public.children%rowtype;
  v_ns public.nursery_settings%rowtype;
  v_decrease numeric;
  v_release_billed numeric;
  v_release_covered numeric;
  v_rate numeric;
  v_refund numeric;
  v_invoice public.invoices%rowtype;
  v_manual_refund boolean := false;
begin
  select * into v_att from public.attendance_records where id = p_attendance_id for update;
  if not found then
    raise exception 'attendance_not_found' using errcode = 'P0002';
  end if;
  select * into v_child from public.children where id = v_att.child_id;
  select * into v_ns from public.nursery_settings where nursery_id = v_child.nursery_id;

  v_decrease := greatest(coalesce(v_att.extra_hours, 0) - greatest(coalesce(p_target_hours, 0), 0), 0);
  if v_decrease = 0 then
    return jsonb_build_object('reduced_hours', 0, 'refund', 0, 'manual_refund', false);
  end if;

  v_release_billed := least(v_decrease, coalesce(v_att.extra_hours_billed, 0));
  v_release_covered := least(v_decrease - v_release_billed, coalesce(v_att.extra_hours_covered, 0));
  v_rate := coalesce(v_att.late_fee_rate, v_ns.late_pickup_fee_per_hour, 0);
  v_refund := least(round(v_release_billed * v_rate, 2), coalesce(v_att.extra_fee, 0));

  if v_release_covered > 0 then
    update public.child_packages
       set hours_used = greatest(hours_used - v_release_covered, 0)
     where id = (
       select cp.id from public.child_packages cp
       where cp.child_id = v_att.child_id and cp.status = 'active'
       order by cp.created_at desc
       limit 1
     );
  end if;

  if v_refund > 0 then
    if v_att.late_charge_invoice_id is not null then
      select * into v_invoice from public.invoices where id = v_att.late_charge_invoice_id for update;
    end if;
    if v_invoice.id is not null and v_invoice.status in ('pending', 'overdue') and v_invoice.amount >= v_refund then
      update public.invoices
         set amount = amount - v_refund,
             status = case when amount - v_refund <= 0 then 'cancelled' else status end,
             line_items_json = jsonb_set(
               case when jsonb_typeof(line_items_json) = 'object' then line_items_json else '{}'::jsonb end,
               '{items}',
               public.attendance_merge_late_item(line_items_json -> 'items', v_att.attendance_date, -v_release_billed, v_rate, -v_refund)
             ),
             updated_at = now()
       where id = v_invoice.id;
    else
      v_manual_refund := true;
    end if;
  end if;

  update public.attendance_records
     set extra_hours = coalesce(extra_hours, 0) - v_decrease,
         extra_hours_billed = greatest(coalesce(extra_hours_billed, 0) - v_release_billed, 0),
         extra_hours_covered = greatest(coalesce(extra_hours_covered, 0) - v_release_covered, 0),
         extra_fee = greatest(coalesce(extra_fee, 0) - v_refund, 0),
         needs_review = needs_review or v_manual_refund,
         review_reason = case when v_manual_refund then 'refund_due' else review_reason end
   where id = p_attendance_id;

  perform public.attendance_log_event(
    p_attendance_id, v_att.child_id, 'charge_reduced', null, null,
    jsonb_build_object(
      'reduced_hours', v_decrease, 'refund', v_refund, 'released_package_hours', v_release_covered,
      'manual_refund', v_manual_refund, 'invoice_id', v_att.late_charge_invoice_id
    )
  );

  if v_manual_refund then
    perform public.attendance_notify_staff(
      v_child.nursery_id,
      array['branch_admin', 'manager']::public.user_role[],
      'attendance_refund_due',
      'attendance_refund_due',
      jsonb_build_object(
        'child', public.i18n_names(v_child.full_name_ar, v_child.full_name_en),
        'refund', v_refund,
        'currency', coalesce(v_ns.currency, 'EGP')
      ),
      '/admin/attendance/logs',
      'high'
    );
  end if;

  return jsonb_build_object(
    'reduced_hours', v_decrease,
    'refund', v_refund,
    'released_package_hours', v_release_covered,
    'manual_refund', v_manual_refund
  );
end;
$$;

create or replace function public.record_attendance_check_in(
  p_child_id uuid,
  p_method text default 'manual',
  p_qr_token_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_child public.children%rowtype;
  v_ns public.nursery_settings%rowtype;
  v_role public.user_role;
  v_tz text;
  v_today date;
  v_att public.attendance_records%rowtype;
  v_early integer := 0;
  v_staff jsonb;
begin
  select * into v_child from public.children where id = p_child_id;
  if not found then
    raise exception 'attendance_child_not_found' using errcode = 'P0002';
  end if;
  v_role := public.attendance_require_staff(v_child.nursery_id);
  if v_child.status <> 'active' then
    raise exception 'attendance_child_not_active' using errcode = 'P0001';
  end if;
  if p_method not in ('qr_parent', 'qr_custom', 'manual') then
    raise exception 'attendance_invalid_method' using errcode = '22023';
  end if;

  select * into v_ns from public.nursery_settings where nursery_id = v_child.nursery_id;
  v_tz := coalesce(v_ns.timezone, 'Africa/Cairo');
  v_today := (now() at time zone v_tz)::date;

  if p_method = 'manual' and coalesce(v_ns.require_qr_for_attendance, false) and v_role = 'teacher' then
    raise exception 'attendance_qr_required' using errcode = 'P0001';
  end if;

  -- Rejected scans are returned (not raised) so the audit event survives the call.
  -- A custom QR names a person allowed to PICK UP; it is not a drop-off pass.
  if p_method = 'qr_custom' then
    perform public.attendance_log_event(null, p_child_id, 'scan_rejected', p_method, p_qr_token_id,
      jsonb_build_object('reason', 'attendance_custom_qr_pickup_only', 'action', 'check_in'));
    return jsonb_build_object('status', 'rejected', 'reason', 'attendance_custom_qr_pickup_only');
  end if;
  if p_method = 'qr_parent' then
    begin
      perform public.attendance_check_qr(p_qr_token_id, p_child_id, 'parent');
    exception when sqlstate 'P0001' then
      perform public.attendance_log_event(null, p_child_id, 'scan_rejected', p_method, p_qr_token_id,
        jsonb_build_object('reason', sqlerrm, 'action', 'check_in'));
      return jsonb_build_object('status', 'rejected', 'reason', sqlerrm);
    end;
  end if;

  select * into v_att
  from public.attendance_records
  where child_id = p_child_id and attendance_date = v_today
  for update;

  if found and v_att.check_out is not null then
    perform public.attendance_log_event(v_att.id, p_child_id, 'scan_rejected', p_method, p_qr_token_id,
      jsonb_build_object('reason', 'attendance_already_checked_out', 'action', 'check_in'));
    return jsonb_build_object(
      'status', 'already_checked_out',
      'attendance_id', v_att.id,
      'check_in', v_att.check_in,
      'check_out', v_att.check_out
    );
  end if;
  if found and v_att.check_in is not null then
    return jsonb_build_object(
      'status', 'already_checked_in',
      'attendance_id', v_att.id,
      'check_in', v_att.check_in,
      'checked_in_by', public.attendance_user_name(v_att.check_in_by, 'en')
    );
  end if;

  if v_ns.standard_start_time is not null then
    v_early := greatest(0, floor(extract(epoch from (
      ((v_today::text || ' ' || v_ns.standard_start_time::text)::timestamp at time zone v_tz) - now()
    )) / 60)::integer);
  end if;

  insert into public.attendance_records (
    child_id, attendance_date, check_in, check_out, check_in_by, check_in_method, check_in_qr_token_id, early_minutes
  )
  values (p_child_id, v_today, now(), null, v_uid, p_method, p_qr_token_id, v_early)
  on conflict (child_id, attendance_date) do update
     set check_in = excluded.check_in,
         check_in_by = excluded.check_in_by,
         check_in_method = excluded.check_in_method,
         check_in_qr_token_id = excluded.check_in_qr_token_id,
         early_minutes = excluded.early_minutes
  returning * into v_att;

  perform public.attendance_log_event(
    v_att.id, p_child_id, 'check_in', p_method, p_qr_token_id,
    jsonb_build_object('early_minutes', v_early)
  );

  v_staff := public.user_names(v_uid);
  perform public.attendance_notify_parents(
    p_child_id,
    'attendance_checkin',
    'attendance_checkin',
    jsonb_build_object(
      'child', public.i18n_names(v_child.full_name_ar, v_child.full_name_en),
      'time', v_att.check_in,
      'tz', v_tz,
      'staff', v_staff,
      'segments', case when v_staff is not null then '["staff"]'::jsonb else '[]'::jsonb end
    )
  );

  return jsonb_build_object(
    'status', 'checked_in',
    'attendance_id', v_att.id,
    'attendance_date', v_att.attendance_date,
    'check_in', v_att.check_in,
    'early_minutes', v_early
  );
end;
$$;

create or replace function public.record_attendance_check_out(
  p_attendance_id uuid,
  p_method text default 'manual',
  p_qr_token_id uuid default null,
  p_pickup jsonb default '{}'::jsonb,
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_att public.attendance_records%rowtype;
  v_child public.children%rowtype;
  v_ns public.nursery_settings%rowtype;
  v_role public.user_role;
  v_tok public.qr_tokens%rowtype;
  v_pickup jsonb := case when jsonb_typeof(p_pickup) = 'object' then p_pickup else '{}'::jsonb end;
  v_person text;
  v_relationship text;
  v_charge jsonb;
  v_now timestamptz := now();
  v_staff jsonb;
  v_hours numeric;
  v_covered numeric;
  v_fee numeric;
  v_segments jsonb := '[]'::jsonb;
begin
  if octet_length(v_pickup::text) > 8000 then
    raise exception 'attendance_pickup_payload_too_large' using errcode = '22023';
  end if;

  select * into v_att from public.attendance_records where id = p_attendance_id for update;
  if not found then
    raise exception 'attendance_not_found' using errcode = 'P0002';
  end if;
  select * into v_child from public.children where id = v_att.child_id;
  v_role := public.attendance_require_staff(v_child.nursery_id);
  select * into v_ns from public.nursery_settings where nursery_id = v_child.nursery_id;

  if p_method not in ('qr_parent', 'qr_custom', 'manual') then
    raise exception 'attendance_invalid_method' using errcode = '22023';
  end if;
  if v_att.check_in is null then
    raise exception 'attendance_not_checked_in' using errcode = 'P0001';
  end if;
  if v_att.check_out is not null then
    raise exception 'attendance_already_checked_out' using errcode = 'P0001';
  end if;
  if p_method = 'manual' and coalesce(v_ns.require_qr_for_attendance, false) and v_role = 'teacher' then
    raise exception 'attendance_qr_required' using errcode = 'P0001';
  end if;
  -- A second scan right after drop-off is almost always an accidental double scan.
  if not p_force and v_now - v_att.check_in < make_interval(mins => coalesce(v_ns.min_minutes_between_scans, 5)) then
    perform public.attendance_log_event(v_att.id, v_att.child_id, 'scan_rejected', p_method, p_qr_token_id,
      jsonb_build_object('reason', 'attendance_too_soon', 'action', 'check_out'));
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'attendance_too_soon',
      'attendance_id', v_att.id,
      'check_in', v_att.check_in,
      'min_minutes', coalesce(v_ns.min_minutes_between_scans, 5)
    );
  end if;

  if p_method in ('qr_parent', 'qr_custom') then
    begin
      v_tok := public.attendance_check_qr(
        p_qr_token_id, v_att.child_id, case when p_method = 'qr_custom' then 'delegate' else 'parent' end
      );
    exception when sqlstate 'P0001' then
      perform public.attendance_log_event(v_att.id, v_att.child_id, 'scan_rejected', p_method, p_qr_token_id,
        jsonb_build_object('reason', sqlerrm, 'action', 'check_out'));
      return jsonb_build_object('status', 'rejected', 'reason', sqlerrm, 'attendance_id', v_att.id);
    end;
    -- One-time QRs are spent only now that staff confirmed the person.
    if v_tok.single_use then
      update public.qr_tokens set consumed_at = v_now where id = v_tok.id;
    end if;
  end if;

  v_person := coalesce(
    nullif(trim(v_pickup ->> 'pickup_person_name'), ''),
    nullif(trim(v_tok.pickup_person_full_name), ''),
    nullif(trim(v_tok.delegate_name), ''),
    case when p_method = 'qr_parent' then public.attendance_user_name(v_tok.issued_by, 'en') end
  );
  v_relationship := coalesce(nullif(trim(v_pickup ->> 'pickup_relationship'), ''), nullif(trim(v_tok.pickup_relationship), ''));

  update public.attendance_records
     set check_out = v_now,
         check_out_by = v_uid,
         check_out_method = p_method,
         check_out_qr_token_id = case when p_method = 'manual' then null else p_qr_token_id end,
         pickup_person_name = v_person,
         pickup_relationship = v_relationship,
         qr_scan_log = coalesce(qr_scan_log, '{}'::jsonb)
           || (v_pickup - 'late_pickup' - 'extra_hours' - 'extra_fee' - 'fee_per_hour')
           || jsonb_build_object('checked_out_at', v_now, 'pickup_purpose',
                case p_method when 'qr_custom' then 'delegate' when 'qr_parent' then 'parent' else 'manual' end)
   where id = p_attendance_id;

  v_charge := public.apply_attendance_late_charge(p_attendance_id, v_now, 'checkout', true);

  update public.attendance_records
     set qr_scan_log = qr_scan_log || jsonb_build_object(
       'late_pickup', coalesce((v_charge ->> 'late_pickup')::boolean, false),
       'extra_hours', coalesce((v_charge ->> 'extra_hours')::numeric, 0),
       'extra_fee', coalesce((v_charge ->> 'extra_fee')::numeric, 0),
       'end_time', v_ns.standard_end_time,
       'grace_minutes', v_ns.late_pickup_grace_minutes,
       'fee_per_hour', v_ns.late_pickup_fee_per_hour
     )
   where id = p_attendance_id;

  perform public.attendance_log_event(
    p_attendance_id, v_att.child_id, 'check_out', p_method, p_qr_token_id,
    jsonb_build_object(
      'pickup_person_name', v_person, 'pickup_relationship', v_relationship,
      'identity_verified', v_pickup -> 'identity_verified', 'charge', v_charge
    )
  );

  v_hours := coalesce((v_charge ->> 'extra_hours')::numeric, 0);
  v_covered := coalesce((v_charge ->> 'extra_hours_covered')::numeric, 0);
  v_fee := coalesce((v_charge ->> 'extra_fee')::numeric, 0);
  v_staff := public.user_names(v_uid);

  if v_person is not null then v_segments := v_segments || to_jsonb('pickup'::text); end if;
  if v_staff is not null then v_segments := v_segments || to_jsonb('staff'::text); end if;
  if v_hours > 0 then v_segments := v_segments || to_jsonb('extra'::text); end if;
  if v_covered > 0 then v_segments := v_segments || to_jsonb('covered'::text); end if;
  if v_fee > 0 then v_segments := v_segments || to_jsonb('fee'::text); end if;

  perform public.attendance_notify_parents(
    v_att.child_id,
    'attendance_checkout',
    'attendance_checkout',
    jsonb_build_object(
      'child', public.i18n_names(v_child.full_name_ar, v_child.full_name_en),
      'time', v_now,
      'tz', coalesce(v_ns.timezone, 'Africa/Cairo'),
      'pickup', v_person,
      'staff', v_staff,
      'hours', v_hours,
      'covered', v_covered,
      'fee', v_fee,
      'currency', coalesce(v_ns.currency, 'EGP'),
      'segments', v_segments
    ),
    case when v_fee > 0 then '/parent/invoices' else '/parent/attendance' end,
    case when v_fee > 0 then 'high' else 'normal' end,
    nullif(v_pickup ->> 'pickup_photo_url', '')
  );

  return jsonb_build_object(
    'status', 'checked_out',
    'attendance_id', p_attendance_id,
    'check_out', v_now,
    'pickup_person_name', v_person
  ) || coalesce(v_charge, '{}'::jsonb);
end;
$$;

create or replace function public.undo_attendance_check_in(p_attendance_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_att public.attendance_records%rowtype;
  v_child public.children%rowtype;
  v_role public.user_role;
begin
  select * into v_att from public.attendance_records where id = p_attendance_id for update;
  if not found then
    raise exception 'attendance_not_found' using errcode = 'P0002';
  end if;
  select * into v_child from public.children where id = v_att.child_id;
  v_role := public.attendance_require_staff(v_child.nursery_id);

  if v_att.check_out is not null or coalesce(v_att.extra_hours, 0) > 0 then
    raise exception 'attendance_undo_not_allowed' using errcode = 'P0001';
  end if;
  if v_role = 'teacher' and (v_att.check_in_by is distinct from auth.uid() or now() - v_att.check_in > interval '15 minutes') then
    raise exception 'attendance_undo_window_passed' using errcode = 'P0001';
  end if;

  perform public.attendance_log_event(
    p_attendance_id, v_att.child_id, 'check_in_undone', v_att.check_in_method, v_att.check_in_qr_token_id,
    jsonb_build_object('check_in', v_att.check_in)
  );
  delete from public.attendance_records where id = p_attendance_id;

  perform public.attendance_notify_parents(
    v_att.child_id,
    'attendance_checkin_cancelled',
    'attendance_checkin_cancelled',
    jsonb_build_object('child', public.i18n_names(v_child.full_name_ar, v_child.full_name_en))
  );

  return jsonb_build_object('status', 'undone', 'attendance_id', p_attendance_id);
end;
$$;

create or replace function public.admin_correct_attendance(
  p_attendance_id uuid,
  p_check_in timestamptz,
  p_check_out timestamptz,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_att public.attendance_records%rowtype;
  v_child public.children%rowtype;
  v_ns public.nursery_settings%rowtype;
  v_tz text;
  v_before jsonb;
  v_as_of timestamptz;
  v_calc record;
  v_result jsonb := '{}'::jsonb;
  v_early integer := 0;
begin
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'attendance_reason_required' using errcode = '22023';
  end if;
  select * into v_att from public.attendance_records where id = p_attendance_id for update;
  if not found then
    raise exception 'attendance_not_found' using errcode = 'P0002';
  end if;
  select * into v_child from public.children where id = v_att.child_id;
  perform public.attendance_require_staff(v_child.nursery_id, true);
  select * into v_ns from public.nursery_settings where nursery_id = v_child.nursery_id;
  v_tz := coalesce(v_ns.timezone, 'Africa/Cairo');

  if p_check_in is null
     or (p_check_in at time zone v_tz)::date <> v_att.attendance_date
     or (p_check_out is not null and p_check_out <= p_check_in)
     or p_check_in > now()
     or (p_check_out is not null and p_check_out > now()) then
    raise exception 'attendance_invalid_times' using errcode = '22023';
  end if;

  v_before := jsonb_build_object(
    'check_in', v_att.check_in, 'check_out', v_att.check_out,
    'extra_hours', v_att.extra_hours, 'extra_fee', v_att.extra_fee
  );

  if v_ns.standard_start_time is not null then
    v_early := greatest(0, floor(extract(epoch from (
      ((v_att.attendance_date::text || ' ' || v_ns.standard_start_time::text)::timestamp at time zone v_tz) - p_check_in
    )) / 60)::integer);
  end if;

  update public.attendance_records
     set check_in = p_check_in,
         check_out = p_check_out,
         check_out_by = case when p_check_out is not null then coalesce(check_out_by, auth.uid()) else null end,
         check_out_method = case when p_check_out is not null then coalesce(check_out_method, 'manual') else null end,
         early_minutes = v_early,
         late_charge_status = case when p_check_out is null and late_charge_status = 'final' then 'provisional' else late_charge_status end,
         needs_review = case when review_reason = 'missing_checkout' and p_check_out is not null then false else needs_review end,
         review_reason = case when review_reason = 'missing_checkout' and p_check_out is not null then null else review_reason end
   where id = p_attendance_id
   returning * into v_att;

  -- Re-bill as of the corrected checkout (or "now" for a child still here today).
  v_as_of := coalesce(p_check_out, case when v_att.attendance_date = (now() at time zone v_tz)::date then now() end);
  if v_as_of is not null and not v_att.late_charge_waived then
    select * into v_calc from public.attendance_compute_extra_time(v_att, v_ns, v_as_of);
    if v_calc.target_hours > coalesce(v_att.extra_hours, 0) then
      v_result := public.apply_attendance_late_charge(p_attendance_id, v_as_of, 'correction', p_check_out is not null);
    elsif v_calc.target_hours < coalesce(v_att.extra_hours, 0) then
      v_result := public.attendance_reduce_late_charge(p_attendance_id, v_calc.target_hours);
    end if;
    update public.attendance_records
       set late_minutes = v_calc.late_minutes,
           late_charge_status = case when p_check_out is not null then 'final' else late_charge_status end
     where id = p_attendance_id;
  end if;

  select * into v_att from public.attendance_records where id = p_attendance_id;

  perform public.attendance_log_event(
    p_attendance_id, v_att.child_id, 'correction', 'manual', null,
    jsonb_build_object(
      'reason', trim(p_reason), 'before', v_before,
      'after', jsonb_build_object('check_in', v_att.check_in, 'check_out', v_att.check_out,
                                  'extra_hours', v_att.extra_hours, 'extra_fee', v_att.extra_fee),
      'charge', v_result
    )
  );

  perform public.attendance_notify_parents(
    v_att.child_id,
    'attendance_corrected',
    'attendance_corrected',
    jsonb_build_object(
      'child', public.i18n_names(v_child.full_name_ar, v_child.full_name_en),
      'date', v_att.attendance_date,
      'check_in_time', v_att.check_in,
      'check_out_time', v_att.check_out,
      'tz', v_tz,
      'hours', coalesce(v_att.extra_hours, 0),
      'fee', coalesce(v_att.extra_fee, 0),
      'currency', coalesce(v_ns.currency, 'EGP'),
      'segments', case when v_att.check_out is not null then '["out", "charges"]'::jsonb else '["charges"]'::jsonb end
    )
  );

  return jsonb_build_object(
    'status', 'corrected',
    'attendance_id', p_attendance_id,
    'extra_hours', v_att.extra_hours,
    'extra_fee', v_att.extra_fee,
    'needs_review', v_att.needs_review
  ) || jsonb_build_object('charge', v_result);
end;
$$;

create or replace function public.admin_waive_late_charge(p_attendance_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_att public.attendance_records%rowtype;
  v_child public.children%rowtype;
  v_result jsonb;
begin
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'attendance_reason_required' using errcode = '22023';
  end if;
  select * into v_att from public.attendance_records where id = p_attendance_id for update;
  if not found then
    raise exception 'attendance_not_found' using errcode = 'P0002';
  end if;
  select * into v_child from public.children where id = v_att.child_id;
  perform public.attendance_require_staff(v_child.nursery_id, true);

  v_result := public.attendance_reduce_late_charge(p_attendance_id, 0);
  update public.attendance_records
     set late_charge_waived = true,
         late_charge_status = case when check_out is not null then 'final' else late_charge_status end
   where id = p_attendance_id;

  perform public.attendance_log_event(
    p_attendance_id, v_att.child_id, 'charge_waived', null, null,
    jsonb_build_object('reason', trim(p_reason), 'charge', v_result)
  );
  perform public.attendance_notify_parents(
    v_att.child_id,
    'extra_hours_waived',
    'extra_hours_waived',
    jsonb_build_object(
      'child', public.i18n_names(v_child.full_name_ar, v_child.full_name_en),
      'date', v_att.attendance_date
    )
  );
  return jsonb_build_object('status', 'waived', 'attendance_id', p_attendance_id) || v_result;
end;
$$;

create or replace function public.run_late_pickup_sweep()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_processed integer := 0;
  v_row record;
begin
  for v_row in
    select ar.id
    from public.attendance_records ar
    join public.children c on c.id = ar.child_id
    join public.nursery_settings ns on ns.nursery_id = c.nursery_id
    where ar.check_out is null
      and ar.check_in is not null
      and ar.late_charge_status <> 'final'
      and not ar.late_charge_waived
      and coalesce(ns.auto_late_pickup_billing_enabled, true)
      and ar.attendance_date = (now() at time zone coalesce(ns.timezone, 'Africa/Cairo'))::date
      and now() > public.attendance_billing_start(ar, ns)
                  + make_interval(mins => coalesce(ns.late_pickup_grace_minutes, 0))
    for update of ar skip locked
  loop
    perform public.apply_attendance_late_charge(v_row.id, now(), 'sweep', false);
    v_processed := v_processed + 1;
  end loop;
  return v_processed;
end;
$$;

create or replace function public.run_pickup_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sent integer := 0;
  v_row record;
begin
  for v_row in
    select ar.id, c.id as child_id, c.full_name_ar, c.full_name_en,
           ns.late_pickup_grace_minutes, ns.late_pickup_fee_per_hour, ns.currency,
           coalesce(ns.timezone, 'Africa/Cairo') as tz,
           public.attendance_billing_start(ar, ns) as billing_start,
           ns.pickup_reminder_minutes_before
    from public.attendance_records ar
    join public.children c on c.id = ar.child_id
    join public.nursery_settings ns on ns.nursery_id = c.nursery_id
    where ar.check_in is not null
      and ar.check_out is null
      and ar.pickup_reminder_sent_at is null
      and coalesce(ns.pickup_reminder_minutes_before, 0) > 0
      and ar.attendance_date = (now() at time zone coalesce(ns.timezone, 'Africa/Cairo'))::date
    for update of ar skip locked
  loop
    continue when v_row.billing_start is null
      or now() < v_row.billing_start - make_interval(mins => v_row.pickup_reminder_minutes_before)
      or now() > v_row.billing_start;

    perform public.attendance_notify_parents(
      v_row.child_id,
      'pickup_reminder',
      'pickup_reminder',
      jsonb_build_object(
        'child', public.i18n_names(v_row.full_name_ar, v_row.full_name_en),
        'end_time', v_row.billing_start,
        'billing_time', v_row.billing_start + make_interval(mins => coalesce(v_row.late_pickup_grace_minutes, 0)),
        'tz', v_row.tz,
        'rate', coalesce(v_row.late_pickup_fee_per_hour, 0),
        'currency', coalesce(v_row.currency, 'EGP')
      ),
      '/parent/attendance',
      'high'
    );
    update public.attendance_records set pickup_reminder_sent_at = now() where id = v_row.id;
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
end;
$$;

create or replace function public.run_attendance_daily_close()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_flagged integer := 0;
  v_nursery record;
begin
  with flagged as (
    update public.attendance_records ar
       set needs_review = true,
           review_reason = 'missing_checkout'
      from public.children c
      left join public.nursery_settings ns on ns.nursery_id = c.nursery_id
     where c.id = ar.child_id
       and ar.check_in is not null
       and ar.check_out is null
       and not ar.needs_review
       and ar.attendance_date < (now() at time zone coalesce(ns.timezone, 'Africa/Cairo'))::date
       -- Only the last week: older gaps predate this check and would only flood admins.
       and ar.attendance_date >= (now() at time zone coalesce(ns.timezone, 'Africa/Cairo'))::date - 7
    returning ar.id, ar.child_id, c.nursery_id
  ),
  logged as (
    insert into public.attendance_events (nursery_id, child_id, attendance_id, event_type, details)
    select f.nursery_id, f.child_id, f.id, 'review_flagged', jsonb_build_object('reason', 'missing_checkout')
    from flagged f
    returning nursery_id
  )
  select count(*) into v_flagged from logged;
  if v_flagged = 0 then
    return 0;
  end if;

  for v_nursery in
    select ae.nursery_id, count(*) as n
    from public.attendance_events ae
    where ae.event_type = 'review_flagged'
      and ae.created_at > now() - interval '5 minutes'
      and ae.details ->> 'reason' = 'missing_checkout'
    group by ae.nursery_id
  loop
    perform public.attendance_notify_staff(
      v_nursery.nursery_id,
      array['branch_admin', 'manager']::public.user_role[],
      'attendance_needs_review',
      'attendance_needs_review',
      jsonb_build_object('count', v_nursery.n),
      '/admin/attendance/logs',
      'high'
    );
  end loop;
  return v_flagged;
end;
$$;

create or replace function public.attendance_absence_reports_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_child public.children%rowtype;
begin
  select * into v_child from public.children where id = new.child_id;
  perform public.attendance_log_event(null, new.child_id, 'absence_reported', null, null,
    jsonb_build_object('absence_date', new.absence_date, 'reason', new.reason, 'note', new.note), new.reported_by);
  perform public.attendance_notify_staff(
    new.nursery_id,
    array['branch_admin', 'manager']::public.user_role[],
    'absence_reported',
    'absence_reported',
    jsonb_build_object(
      'child', public.i18n_names(v_child.full_name_ar, v_child.full_name_en),
      'date', new.absence_date,
      'reason', jsonb_build_object('i18n', 'attendance.absence.reasons.' || new.reason)
    ),
    '/admin/attendance'
  );
  return new;
end;
$$;

-- A blocked pickup (identity mismatch at the gate) alerts the parents from the server.
create or replace function public.pickup_incidents_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_child public.children%rowtype;
begin
  select * into v_child from public.children where id = new.child_id;
  if not found then
    return new;
  end if;
  perform public.attendance_log_event(null, new.child_id, 'scan_rejected', null, new.qr_token_id,
    jsonb_build_object('reason', 'identity_mismatch', 'mismatch', new.reason, 'note', new.note), new.reported_by);
  perform public.attendance_notify_parents(
    new.child_id,
    'pickup_attempt_failed',
    'pickup_attempt_failed',
    jsonb_build_object(
      'child', public.i18n_names(v_child.full_name_ar, v_child.full_name_en),
      'time', coalesce(new.created_at, now()),
      'tz', coalesce((select ns.timezone from public.nursery_settings ns where ns.nursery_id = v_child.nursery_id), 'Africa/Cairo')
    ),
    '/parent/attendance',
    'high'
  );
  return new;
end;
$$;

drop trigger if exists trg_pickup_incidents_after_insert on public.pickup_incidents;
create trigger trg_pickup_incidents_after_insert
after insert on public.pickup_incidents
for each row execute function public.pickup_incidents_after_insert();

-- "Late now" follows the same billing start as the charge itself.
create or replace function public.get_attendance_kpis(p_nursery_id uuid, p_month date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ns public.nursery_settings%rowtype;
  v_tz text;
  v_today date;
  v_month_start date;
  v_month_end date;
  v_today_json jsonb;
  v_month_json jsonb;
  v_top_late jsonb;
  v_is_school_day boolean;
begin
  perform public.attendance_require_staff(p_nursery_id);
  select * into v_ns from public.nursery_settings where nursery_id = p_nursery_id;
  v_tz := coalesce(v_ns.timezone, 'Africa/Cairo');
  v_today := (now() at time zone v_tz)::date;
  v_month_start := date_trunc('month', coalesce(p_month, v_today))::date;
  v_month_end := least((v_month_start + interval '1 month - 1 day')::date, v_today);
  v_is_school_day := public.attendance_is_school_day(p_nursery_id, v_today);

  with kids as (
    select c.id, coalesce(c.enrollment_date, c.created_at::date) as start_day
    from public.children c
    where c.nursery_id = p_nursery_id and c.status = 'active'
  ),
  att as (
    select ar.* from public.attendance_records ar join kids k on k.id = ar.child_id
    where ar.attendance_date = v_today
  ),
  excused as (
    select abr.child_id from public.attendance_absence_reports abr join kids k on k.id = abr.child_id
    where abr.absence_date = v_today
      and not exists (select 1 from att where att.child_id = abr.child_id and att.check_in is not null)
  )
  select jsonb_build_object(
    'date', v_today,
    'is_school_day', v_is_school_day,
    'active_children', (select count(*) from kids where start_day <= v_today),
    'in_nursery', (select count(*) from att where check_in is not null and check_out is null),
    'checked_out', (select count(*) from att where check_out is not null),
    'checked_in_total', (select count(*) from att where check_in is not null),
    'excused', (select count(*) from excused),
    'absent', case when v_is_school_day then greatest(
      (select count(*) from kids where start_day <= v_today)
      - (select count(*) from att where check_in is not null)
      - (select count(*) from excused), 0) else 0 end,
    'late_now', (
      select count(*) from public.attendance_records ar join kids k on k.id = ar.child_id
      where ar.attendance_date = v_today
        and ar.check_in is not null and ar.check_out is null
        and now() > public.attendance_billing_start(ar, v_ns)
                    + make_interval(mins => coalesce(v_ns.late_pickup_grace_minutes, 0))
    ),
    'extra_hours_today', (select coalesce(sum(extra_hours), 0) from att),
    'extra_fee_today', (select coalesce(sum(extra_fee), 0) from att),
    'end_time', v_ns.standard_end_time,
    'grace_minutes', v_ns.late_pickup_grace_minutes
  ) into v_today_json;

  with kids as (
    select c.id, coalesce(c.enrollment_date, c.created_at::date) as start_day
    from public.children c
    where c.nursery_id = p_nursery_id and c.status = 'active'
  ),
  school_days as (
    select d::date as day
    from generate_series(v_month_start, v_month_end, interval '1 day') d
    where public.attendance_is_school_day(p_nursery_id, d::date)
  ),
  att as (
    select ar.* from public.attendance_records ar
    join public.children c on c.id = ar.child_id
    where c.nursery_id = p_nursery_id and ar.attendance_date between v_month_start and v_month_end
  ),
  child_days as (
    select count(*) as n from kids k join school_days s on s.day >= k.start_day
  ),
  present_days as (
    select count(*) as n from att a
    join kids k on k.id = a.child_id
    join school_days s on s.day = a.attendance_date
    where a.check_in is not null
  ),
  excused_days as (
    select count(*) as n from public.attendance_absence_reports abr
    join kids k on k.id = abr.child_id
    join school_days s on s.day = abr.absence_date and s.day >= k.start_day
    where not exists (select 1 from att a where a.child_id = abr.child_id and a.attendance_date = abr.absence_date and a.check_in is not null)
  ),
  extra_invoices as (
    select i.* from public.invoices i where i.nursery_id = p_nursery_id and i.invoice_type = 'extra_hours'
  )
  select jsonb_build_object(
    'month_start', v_month_start,
    'month_end', v_month_end,
    'school_days', (select count(*) from school_days),
    'expected_child_days', (select n from child_days),
    'present_child_days', (select n from present_days),
    'excused_child_days', (select n from excused_days),
    'absent_child_days', greatest((select n from child_days) - (select n from present_days) - (select n from excused_days), 0),
    'attendance_rate', case when (select n from child_days) > 0
      then round((select n from present_days)::numeric * 100 / (select n from child_days), 1) else 0 end,
    'late_pickups', (select count(*) from att where coalesce(extra_hours, 0) > 0 or coalesce(late_minutes, 0) > coalesce(v_ns.late_pickup_grace_minutes, 0)),
    'extra_hours', (select coalesce(sum(extra_hours), 0) from att),
    'extra_hours_covered', (select coalesce(sum(extra_hours_covered), 0) from att),
    'extra_hours_billed', (select coalesce(sum(extra_hours_billed), 0) from att),
    'extra_fee_billed', (select coalesce(sum(extra_fee), 0) from att),
    'extra_fee_collected', (select coalesce(sum(amount), 0) from extra_invoices
      where status = 'paid' and paid_at >= v_month_start and paid_at < v_month_start + interval '1 month'),
    'extra_fee_outstanding', (select coalesce(sum(amount), 0) from extra_invoices where status in ('pending', 'overdue')),
    'needs_review', (select count(*) from public.attendance_records ar join public.children c on c.id = ar.child_id
      where c.nursery_id = p_nursery_id and ar.needs_review),
    'qr_scans', (select count(*) from att where check_in_method in ('qr_parent', 'qr_custom') or check_out_method in ('qr_parent', 'qr_custom')),
    'manual_entries', (select count(*) from att where check_in_method = 'manual' or check_out_method = 'manual')
  ) into v_month_json;

  select coalesce(jsonb_agg(t order by t.extra_hours desc, t.late_days desc), '[]'::jsonb) into v_top_late
  from (
    select c.id as child_id, c.full_name_ar, c.full_name_en,
           count(*) as late_days, sum(ar.extra_hours) as extra_hours, sum(ar.extra_fee) as extra_fee
    from public.attendance_records ar
    join public.children c on c.id = ar.child_id
    where c.nursery_id = p_nursery_id
      and ar.attendance_date between v_month_start and v_month_end
      and coalesce(ar.extra_hours, 0) > 0
    group by c.id, c.full_name_ar, c.full_name_en
    order by sum(ar.extra_hours) desc
    limit 5
  ) t;

  return jsonb_build_object('today', v_today_json, 'month', v_month_json, 'top_late', v_top_late);
end;
$$;

-- =============================================================================
-- 4. Payments: idempotency, balance checks, one server path per action
-- =============================================================================

alter table public.payment_attempts
  add column if not exists idempotency_key uuid,
  add column if not exists reference text,
  add column if not exists provider text;
create unique index if not exists payment_attempts_idempotency_key_uniq
  on public.payment_attempts (idempotency_key) where idempotency_key is not null;
create unique index if not exists payment_attempts_paymob_tx_uniq
  on public.payment_attempts (paymob_transaction_id) where paymob_transaction_id is not null;

alter table public.payments add column if not exists idempotency_key uuid;
create unique index if not exists payments_idempotency_key_uniq
  on public.payments (idempotency_key) where idempotency_key is not null;
create unique index if not exists payments_gateway_ref_uniq
  on public.payments (gateway_ref) where gateway_ref is not null;

alter table public.loyalty_transactions add column if not exists idempotency_key uuid;
create unique index if not exists loyalty_transactions_idempotency_key_uniq
  on public.loyalty_transactions (idempotency_key) where idempotency_key is not null;

-- Where parents send InstaPay / wallet / bank transfers; written by the nursery, shown on the pay page.
alter table public.nursery_settings add column if not exists payment_instructions text;

create or replace function public.invoice_number_label(p_invoice public.invoices)
returns text
language sql
immutable
as $$
  select coalesce(nullif(p_invoice.generated_invoice_number, ''), upper(left(p_invoice.id::text, 8)))
$$;

create or replace function public.invoice_paid_total(p_invoice_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(p.amount), 0) from public.payments p where p.invoice_id = p_invoice_id and p.status = 'completed'
$$;

create or replace function public.invoice_pending_total(p_invoice_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(pa.amount), 0) from public.payment_attempts pa
  where pa.invoice_id = p_invoice_id and pa.status = 'pending_confirmation'
$$;

-- Appends a line item whether line_items_json is a bare array or {"items": [...]}.
create or replace function public.invoice_append_item(p_json jsonb, p_item jsonb)
returns jsonb
language sql
immutable
as $$
  select case jsonb_typeof(p_json)
    when 'array' then p_json || jsonb_build_array(p_item)
    when 'object' then jsonb_set(
      p_json, '{items}',
      coalesce(case when jsonb_typeof(p_json -> 'items') = 'array' then p_json -> 'items' end, '[]'::jsonb)
        || jsonb_build_array(p_item)
    )
    else jsonb_build_object('items', jsonb_build_array(p_item))
  end
$$;

-- Caller may confirm/record payments for p_nursery_id: branch admin, finance/HR manager,
-- the chain's super admin, or XO. Returns the caller id; raises otherwise.
create or replace function public.payment_staff_guard(p_nursery_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.user_role;
  v_nursery uuid;
  v_chain uuid;
  v_department text;
begin
  if v_uid is null then
    raise exception 'payment_not_authenticated' using errcode = '28000';
  end if;
  select u.role, u.nursery_id, u.chain_id, coalesce(u.department::text, '')
    into v_role, v_nursery, v_chain, v_department
  from public.users u where u.id = v_uid;

  if v_role in ('branch_admin', 'manager') then
    if v_nursery is distinct from p_nursery_id then
      raise exception 'payment_forbidden' using errcode = '42501';
    end if;
    if v_role = 'manager' and v_department not in ('finance', 'hr') then
      raise exception 'payment_forbidden' using errcode = '42501';
    end if;
  elsif v_role = 'chain_super_admin' then
    if v_chain is null or not exists (
      select 1 from public.nurseries n where n.id = p_nursery_id and n.chain_id = v_chain
    ) then
      raise exception 'payment_forbidden' using errcode = '42501';
    end if;
  elsif not public.is_xo_super_admin() then
    raise exception 'payment_forbidden' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

create or replace function public.payment_finance_recipients(p_nursery_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select array(
    select u.id from public.users u
    where u.nursery_id = p_nursery_id
      and (
        u.role in ('branch_admin', 'chain_super_admin')
        or (u.role = 'manager' and coalesce(u.department::text, '') in ('finance', 'hr'))
      )
  )
$$;

-- Points for a confirmed payment, once per payment.
create or replace function public.loyalty_award_payment_points(
  p_nursery_id uuid,
  p_parent_id uuid,
  p_payment_id uuid,
  p_amount numeric
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ns public.nursery_settings%rowtype;
  v_points integer;
begin
  if p_payment_id is null or coalesce(p_amount, 0) <= 0 then
    return 0;
  end if;
  select * into v_ns from public.nursery_settings where nursery_id = p_nursery_id;
  if not coalesce(v_ns.loyalty_enabled, false) then
    return 0;
  end if;
  v_points := floor(p_amount * greatest(coalesce(v_ns.points_per_egp, 0), 0))::integer;
  if v_points <= 0 or exists (
    select 1 from public.loyalty_transactions lt where lt.source = 'payment' and lt.reference_id = p_payment_id
  ) then
    return 0;
  end if;
  insert into public.loyalty_transactions (nursery_id, parent_id, transaction_type, points, source, reference_id)
  values (p_nursery_id, p_parent_id, 'earned', v_points, 'payment', p_payment_id);
  return v_points;
end;
$$;

-- Every new attempt, from any client: the invoice must be the parent's, open, and the
-- attempt within the unpaid balance; an identical pending attempt from the last two
-- minutes is a double submit. The invoice row lock serialises concurrent submits.
create or replace function public.payment_attempts_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices%rowtype;
  v_remaining numeric;
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

  new.nursery_id := v_invoice.nursery_id;
  new.status := coalesce(new.status, 'pending_confirmation');

  if new.status = 'pending_confirmation' then
    v_remaining := v_invoice.amount - public.invoice_paid_total(v_invoice.id) - public.invoice_pending_total(v_invoice.id);
    if new.amount > v_remaining + 0.005 then
      raise exception 'payment_exceeds_balance' using errcode = 'P0001', detail = round(greatest(v_remaining, 0), 2)::text;
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

drop trigger if exists trg_payment_attempts_before_insert on public.payment_attempts;
create trigger trg_payment_attempts_before_insert
before insert on public.payment_attempts
for each row execute function public.payment_attempts_before_insert();

-- Parent submits a payment (or the start of a gateway payment) for finance review.
create or replace function public.submit_invoice_payment(
  p_invoice_id uuid,
  p_amount numeric,
  p_method text default 'manual',
  p_reference text default null,
  p_proof_url text default null,
  p_idempotency_key uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_existing public.payment_attempts%rowtype;
  v_attempt_id uuid;
  v_invoice public.invoices%rowtype;
  v_ns public.nursery_settings%rowtype;
begin
  if v_uid is null then
    raise exception 'payment_not_authenticated' using errcode = '28000';
  end if;
  if p_method not in ('manual', 'cash', 'bank_transfer', 'instapay', 'vodafone_cash', 'orange_cash', 'fawry', 'card') then
    raise exception 'payment_invalid_method' using errcode = '22023';
  end if;

  -- A retried request (double click, network retry) returns the attempt already made.
  if p_idempotency_key is not null then
    select * into v_existing from public.payment_attempts where idempotency_key = p_idempotency_key;
    if found then
      if v_existing.parent_id is distinct from v_uid then
        raise exception 'payment_forbidden' using errcode = '42501';
      end if;
      return jsonb_build_object('status', 'duplicate', 'attempt_id', v_existing.id, 'amount', v_existing.amount);
    end if;
  end if;

  begin
    insert into public.payment_attempts (
      invoice_id, parent_id, nursery_id, amount, payment_method, status, reference, proof_url, idempotency_key
    )
    select p_invoice_id, v_uid, i.nursery_id, round(p_amount, 2), p_method, 'pending_confirmation',
           nullif(trim(coalesce(p_reference, '')), ''), nullif(trim(coalesce(p_proof_url, '')), ''), p_idempotency_key
    from public.invoices i
    where i.id = p_invoice_id
    returning id into v_attempt_id;
  exception
    when unique_violation then
      return jsonb_build_object('status', 'duplicate');
    when sqlstate 'P0001' then
      if sqlerrm = 'payment_duplicate' then
        return jsonb_build_object('status', 'duplicate');
      end if;
      raise;
  end;

  if v_attempt_id is null then
    raise exception 'payment_invoice_not_found' using errcode = 'P0001';
  end if;

  select * into v_invoice from public.invoices where id = p_invoice_id;
  select * into v_ns from public.nursery_settings where nursery_id = v_invoice.nursery_id;

  perform public.notify_users(
    public.payment_finance_recipients(v_invoice.nursery_id),
    v_invoice.nursery_id,
    'payment_attempt_created',
    'payment_attempt_created',
    jsonb_build_object(
      'invoice_number', public.invoice_number_label(v_invoice),
      'amount', round(p_amount, 2),
      'currency', coalesce(v_ns.currency, 'EGP'),
      'parent', public.user_names(v_uid)
    ),
    '/admin/invoices/' || v_invoice.id::text
  );

  return jsonb_build_object(
    'status', 'submitted',
    'attempt_id', v_attempt_id,
    'amount', round(p_amount, 2),
    'remaining', greatest(v_invoice.amount - public.invoice_paid_total(v_invoice.id) - public.invoice_pending_total(v_invoice.id), 0)
  );
end;
$$;

create or replace function public.confirm_invoice_payment_attempt(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_uid uuid;
  v_attempt public.payment_attempts%rowtype;
  v_invoice public.invoices%rowtype;
  v_ns public.nursery_settings%rowtype;
  v_already_paid numeric := 0;
  v_confirmed_amount numeric := 0;
  v_total_paid numeric := 0;
  v_fully_paid boolean := false;
  v_payment_id uuid;
  v_application_id uuid;
begin
  select * into v_attempt from public.payment_attempts where id = p_attempt_id for update;
  if not found then
    raise exception 'payment_attempt_not_found' using errcode = '42704';
  end if;
  v_uid := public.payment_staff_guard(v_attempt.nursery_id);

  select * into v_invoice from public.invoices where id = v_attempt.invoice_id for update;
  if not found then
    raise exception 'payment_invoice_not_found' using errcode = '42704';
  end if;
  if v_invoice.nursery_id is distinct from v_attempt.nursery_id
     or v_invoice.parent_id is distinct from v_attempt.parent_id then
    raise exception 'Payment attempt does not match invoice' using errcode = '22023';
  end if;
  select * into v_ns from public.nursery_settings where nursery_id = v_invoice.nursery_id;

  v_already_paid := public.invoice_paid_total(v_invoice.id);

  -- Only a pending attempt does anything, so a second click is harmless.
  if v_attempt.status = 'pending_confirmation' then
    v_confirmed_amount := least(v_attempt.amount, greatest(0, v_invoice.amount - v_already_paid));
    if v_confirmed_amount > 0 then
      insert into public.payments (invoice_id, amount, method, status, paid_at, gateway_ref)
      values (v_invoice.id, v_confirmed_amount, v_attempt.payment_method, 'completed', now(), v_attempt.paymob_transaction_id)
      returning id into v_payment_id;
    end if;
    update public.payment_attempts
       set status = 'confirmed', confirmed_at = now(), confirmed_by = v_uid
     where id = v_attempt.id;
  end if;

  v_total_paid := v_already_paid + v_confirmed_amount;
  v_fully_paid := v_total_paid + 0.005 >= v_invoice.amount;

  update public.invoices
     set status = case when v_fully_paid then 'paid' else 'pending' end,
         paid_at = case when v_fully_paid then coalesce(v_invoice.paid_at, now()) else null end,
         payment_method = v_attempt.payment_method,
         updated_at = now()
   where id = v_invoice.id;

  if v_attempt.status = 'pending_confirmation' and v_confirmed_amount > 0 then
    perform public.notify_users(
      array[v_invoice.parent_id], v_invoice.nursery_id, 'invoice_paid', 'invoice_paid',
      jsonb_build_object(
        'invoice_number', public.invoice_number_label(v_invoice),
        'amount', v_confirmed_amount,
        'currency', coalesce(v_ns.currency, 'EGP')
      ),
      '/parent/invoices/' || v_invoice.id::text
    );
    perform public.loyalty_award_payment_points(v_invoice.nursery_id, v_invoice.parent_id, v_payment_id, v_confirmed_amount);
  end if;

  begin
    v_application_id := nullif(v_invoice.line_items_json ->> 'application_id', '')::uuid;
  exception when others then
    v_application_id := null;
  end;

  if v_application_id is not null and v_attempt.status = 'pending_confirmation' and v_confirmed_amount > 0 then
    perform public.notify_users(
      array(
        select u.id from public.users u
        where u.nursery_id = v_invoice.nursery_id
          and u.role in ('branch_admin'::public.user_role, 'chain_super_admin'::public.user_role)
      ),
      v_invoice.nursery_id, 'application_payment_confirmed', 'application_payment_confirmed', '{}'::jsonb,
      '/admin/admissions/applications/' || v_application_id::text
    );
  end if;

  return jsonb_build_object(
    'invoiceId', v_invoice.id,
    'paymentId', v_payment_id,
    'confirmedAmount', v_confirmed_amount,
    'paidAmount', v_total_paid,
    'invoiceStatus', case when v_fully_paid then 'paid' else 'pending' end,
    'applicationId', v_application_id,
    'approval', null
  );
end;
$$;

create or replace function public.reject_invoice_payment_attempt(p_attempt_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_attempt public.payment_attempts%rowtype;
  v_invoice public.invoices%rowtype;
  v_ns public.nursery_settings%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  select * into v_attempt from public.payment_attempts where id = p_attempt_id for update;
  if not found then
    raise exception 'payment_attempt_not_found' using errcode = '42704';
  end if;
  v_uid := public.payment_staff_guard(v_attempt.nursery_id);

  if v_attempt.status <> 'pending_confirmation' then
    return jsonb_build_object('status', v_attempt.status, 'changed', false);
  end if;

  update public.payment_attempts
     set status = 'cancelled',
         confirmed_at = now(),
         confirmed_by = v_uid,
         notes = coalesce(v_reason, notes)
   where id = v_attempt.id;

  select * into v_invoice from public.invoices where id = v_attempt.invoice_id;
  select * into v_ns from public.nursery_settings where nursery_id = v_attempt.nursery_id;
  perform public.notify_users(
    array[v_attempt.parent_id], v_attempt.nursery_id, 'payment_attempt_rejected', 'payment_attempt_rejected',
    jsonb_build_object(
      'invoice_number', public.invoice_number_label(v_invoice),
      'amount', v_attempt.amount,
      'currency', coalesce(v_ns.currency, 'EGP'),
      'reason', v_reason,
      'segments', case when v_reason is not null then '["reason"]'::jsonb else '[]'::jsonb end
    ),
    '/parent/invoices/' || v_attempt.invoice_id::text,
    'high'
  );
  return jsonb_build_object('status', 'cancelled', 'changed', true);
end;
$$;

-- Staff record a payment received outside the app (cash at the desk, transfer seen in the bank).
create or replace function public.admin_record_invoice_payment(
  p_invoice_id uuid,
  p_amount numeric,
  p_method text,
  p_paid_at timestamptz default now(),
  p_idempotency_key uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices%rowtype;
  v_ns public.nursery_settings%rowtype;
  v_existing uuid;
  v_paid numeric;
  v_confirmed numeric;
  v_total numeric;
  v_full boolean;
  v_payment_id uuid;
  v_paid_at timestamptz := coalesce(p_paid_at, now());
begin
  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'payment_invoice_not_found' using errcode = 'P0001';
  end if;
  perform public.payment_staff_guard(v_invoice.nursery_id);

  if p_idempotency_key is not null then
    select id into v_existing from public.payments where idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object('status', 'duplicate', 'payment_id', v_existing);
    end if;
  end if;
  if v_invoice.status = 'cancelled' then
    raise exception 'payment_invoice_closed' using errcode = 'P0001';
  end if;
  -- Includes invoices marked paid before payments were itemised: never record them again.
  if v_invoice.status = 'paid' then
    return jsonb_build_object('status', 'already_paid', 'payment_id', null, 'confirmed_amount', 0,
                              'paid_amount', public.invoice_paid_total(v_invoice.id), 'invoice_status', 'paid');
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'payment_invalid_amount' using errcode = 'P0001';
  end if;
  if nullif(trim(coalesce(p_method, '')), '') is null or char_length(p_method) > 40 then
    raise exception 'payment_invalid_method' using errcode = '22023';
  end if;
  select * into v_ns from public.nursery_settings where nursery_id = v_invoice.nursery_id;

  -- Never more than the unpaid balance: a repeated "mark paid" records nothing new.
  v_paid := public.invoice_paid_total(v_invoice.id);
  v_confirmed := least(round(p_amount, 2), greatest(0, v_invoice.amount - v_paid));
  if v_confirmed > 0 then
    insert into public.payments (invoice_id, amount, method, status, paid_at, idempotency_key)
    values (v_invoice.id, v_confirmed, p_method, 'completed', v_paid_at, p_idempotency_key)
    returning id into v_payment_id;
  end if;

  v_total := v_paid + v_confirmed;
  v_full := v_total + 0.005 >= v_invoice.amount;
  update public.invoices
     set status = case when v_full then 'paid' else 'pending' end,
         paid_at = case when v_full then coalesce(paid_at, v_paid_at) else null end,
         payment_method = p_method,
         updated_at = now()
   where id = v_invoice.id;

  if v_confirmed > 0 then
    perform public.notify_users(
      array[v_invoice.parent_id], v_invoice.nursery_id, 'invoice_paid', 'invoice_paid',
      jsonb_build_object(
        'invoice_number', public.invoice_number_label(v_invoice),
        'amount', v_confirmed,
        'currency', coalesce(v_ns.currency, 'EGP')
      ),
      '/parent/invoices/' || v_invoice.id::text
    );
    perform public.loyalty_award_payment_points(v_invoice.nursery_id, v_invoice.parent_id, v_payment_id, v_confirmed);
  end if;

  return jsonb_build_object(
    'status', 'recorded',
    'payment_id', v_payment_id,
    'confirmed_amount', v_confirmed,
    'paid_amount', v_total,
    'invoice_status', case when v_full then 'paid' else 'pending' end
  );
end;
$$;

-- Parent turns loyalty points into a discount on one of their open invoices.
create or replace function public.redeem_loyalty_points(
  p_invoice_id uuid,
  p_points integer,
  p_idempotency_key uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_invoice public.invoices%rowtype;
  v_ns public.nursery_settings%rowtype;
  v_balance integer;
  v_rate numeric;
  v_discount numeric;
  v_previous_discount numeric;
  v_cap numeric;
  v_due numeric;
  v_new_amount numeric;
  v_paid numeric;
  v_min_points constant integer := 100;
  v_max_share constant numeric := 0.5;
begin
  if v_uid is null then
    raise exception 'payment_not_authenticated' using errcode = '28000';
  end if;
  if p_idempotency_key is not null and exists (
    select 1 from public.loyalty_transactions where idempotency_key = p_idempotency_key
  ) then
    return jsonb_build_object('status', 'duplicate');
  end if;

  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'payment_invoice_not_found' using errcode = 'P0001';
  end if;
  if v_invoice.parent_id is distinct from v_uid then
    raise exception 'payment_invoice_not_yours' using errcode = '42501';
  end if;
  if v_invoice.status in ('paid', 'cancelled') then
    raise exception 'payment_invoice_closed' using errcode = 'P0001';
  end if;

  select * into v_ns from public.nursery_settings where nursery_id = v_invoice.nursery_id;
  v_rate := coalesce(v_ns.points_redemption_rate, 0);
  if not coalesce(v_ns.loyalty_enabled, false) or v_rate <= 0 then
    raise exception 'loyalty_disabled' using errcode = 'P0001';
  end if;
  if p_points is null or p_points < v_min_points then
    raise exception 'loyalty_min_points' using errcode = 'P0001';
  end if;

  select coalesce(sum(lt.points), 0) into v_balance
  from public.loyalty_transactions lt
  where lt.parent_id = v_uid and lt.nursery_id = v_invoice.nursery_id;
  if p_points > v_balance then
    raise exception 'loyalty_insufficient_points' using errcode = 'P0001';
  end if;

  v_discount := round(p_points * v_rate, 2);
  select coalesce(sum(-(item ->> 'total')::numeric), 0) into v_previous_discount
  from jsonb_array_elements(
    case jsonb_typeof(v_invoice.line_items_json)
      when 'array' then v_invoice.line_items_json
      when 'object' then coalesce(case when jsonb_typeof(v_invoice.line_items_json -> 'items') = 'array'
                                       then v_invoice.line_items_json -> 'items' end, '[]'::jsonb)
      else '[]'::jsonb
    end
  ) item
  where item ->> 'kind' = 'loyalty_discount';

  -- At most half of the original invoice, all redemptions together, and never below what's paid.
  v_cap := round((v_invoice.amount + v_previous_discount) * v_max_share, 2) - v_previous_discount;
  v_paid := public.invoice_paid_total(v_invoice.id);
  v_due := v_invoice.amount - v_paid - public.invoice_pending_total(v_invoice.id);
  if v_discount > v_cap + 0.005 or v_discount > v_due + 0.005 then
    raise exception 'loyalty_exceeds_cap' using errcode = 'P0001';
  end if;

  insert into public.loyalty_transactions (
    nursery_id, parent_id, transaction_type, points, source, reference_id, idempotency_key
  )
  values (v_invoice.nursery_id, v_uid, 'redeemed', -p_points, 'manual', v_invoice.id, p_idempotency_key);

  v_new_amount := v_invoice.amount - v_discount;
  update public.invoices
     set amount = v_new_amount,
         line_items_json = public.invoice_append_item(line_items_json, jsonb_build_object(
           'kind', 'loyalty_discount',
           'points', p_points,
           'quantity', 1,
           'unitPrice', -v_discount,
           'unit_price', -v_discount,
           'total', -v_discount
         )),
         status = case when v_new_amount <= v_paid + 0.005 then 'paid' else status end,
         paid_at = case when v_new_amount <= v_paid + 0.005 then coalesce(paid_at, now()) else paid_at end,
         updated_at = now()
   where id = v_invoice.id;

  return jsonb_build_object('status', 'redeemed', 'points', p_points, 'discount', v_discount, 'new_amount', v_new_amount);
end;
$$;

-- =============================================================================
-- 5. Reminders and application notices: templates instead of text
-- =============================================================================

create or replace function public.run_payment_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted integer := 0;
begin
  with due as (
    select i.id as invoice_id, i.nursery_id, i.parent_id, i.amount, i.generated_invoice_number,
           coalesce(ns.currency, 'EGP') as currency,
           (i.due_date::date - current_date) as days_until
    from public.invoices i
    join public.nursery_settings ns on ns.nursery_id = i.nursery_id
    where i.status = 'pending'
      and coalesce(ns.auto_payment_reminders_enabled, true)
      and (i.due_date::date - current_date) in (7, 3, 1, -1, -3, -7)
      and (i.last_reminder_sent_at is null
           or i.last_reminder_sent_at < date_trunc('day', now()))
      and not exists (
        select 1
        from public.event_invoices ei
        join public.permissions p
          on p.event_id = ei.event_id and p.child_id = ei.child_id
        where ei.invoice_id = i.id
          and p.status = 'denied'
      )
  ),
  sent as (
    insert into public.notifications
      (nursery_id, user_id, type, template_key, template_params, read, channel, sent_at, action_link)
    select
      d.nursery_id, d.parent_id,
      case when d.days_until > 0 then 'invoice_due_reminder' else 'invoice_overdue_reminder' end,
      case when d.days_until > 0 then 'invoice_due_reminder' else 'invoice_overdue_reminder' end,
      jsonb_build_object(
        'amount', d.amount,
        'currency', d.currency,
        'days', abs(d.days_until),
        'invoice_number', coalesce(nullif(d.generated_invoice_number, ''), upper(left(d.invoice_id::text, 8)))
      ),
      false, 'in_app', now(), '/parent/invoices/' || d.invoice_id::text
    from due d
    returning 1
  )
  select count(*) into inserted from sent;

  update public.invoices i
     set last_reminder_sent_at = now()
   from public.nursery_settings ns
  where ns.nursery_id = i.nursery_id
    and i.status = 'pending'
    and coalesce(ns.auto_payment_reminders_enabled, true)
    and (i.due_date::date - current_date) in (7, 3, 1, -1, -3, -7)
    and (i.last_reminder_sent_at is null
         or i.last_reminder_sent_at < date_trunc('day', now()))
    and not exists (
      select 1
      from public.event_invoices ei
      join public.permissions p
        on p.event_id = ei.event_id and p.child_id = ei.child_id
      where ei.invoice_id = i.id
        and p.status = 'denied'
    );

  return inserted;
end;
$$;

create or replace function public.run_permission_deadline_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted integer := 0;
begin
  with due as (
    select p.id as permission_id, p.child_id, e.nursery_id,
           e.title_ar as ev_ar, e.title_en as ev_en
    from public.permissions p
    join public.events e on e.id = p.event_id
    join public.nursery_settings ns on ns.nursery_id = e.nursery_id
    where p.status = 'pending'
      and p.deadline is not null
      and p.deadline > now()
      and p.deadline <= now() + interval '48 hours'
      and coalesce(ns.auto_permission_reminders_enabled, true)
      and (p.last_reminder_sent_at is null
           or p.last_reminder_sent_at < date_trunc('day', now()))
  ),
  sent as (
    insert into public.notifications
      (nursery_id, user_id, type, template_key, template_params, read, channel, sent_at, action_link)
    select
      d.nursery_id, pc.parent_id, 'permission_deadline_reminder', 'permission_deadline_reminder',
      jsonb_build_object('event', public.i18n_names(d.ev_ar, d.ev_en)),
      false, 'in_app', now(), '/parent/events'
    from due d
    join public.parent_children pc on pc.child_id = d.child_id
    returning 1
  )
  select count(*) into inserted from sent;

  update public.permissions p
     set last_reminder_sent_at = now()
   from public.events e
   join public.nursery_settings ns on ns.nursery_id = e.nursery_id
  where p.event_id = e.id
    and p.status = 'pending'
    and p.deadline is not null
    and p.deadline > now()
    and p.deadline <= now() + interval '48 hours'
    and coalesce(ns.auto_permission_reminders_enabled, true)
    and (p.last_reminder_sent_at is null
         or p.last_reminder_sent_at < date_trunc('day', now()));

  return inserted;
end;
$$;

-- Admin-written reminder texts are data and stay as text; only the built-in default is a template.
create or replace function public.run_monthly_teacher_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted integer := 0;
begin
  with sent as (
    insert into public.notifications
      (nursery_id, user_id, type, template_key, title_ar, title_en, body_ar, body_en, read, channel, sent_at)
    select
      tpl.nursery_id,
      tpl.teacher_id,
      'teacher_monthly_reminder',
      case when has_text then null else 'teacher_monthly_reminder' end,
      case when has_text then coalesce(nullif(tpl.title_ar, ''), tpl.title_en) end,
      case when has_text then coalesce(nullif(tpl.title_en, ''), tpl.title_ar) end,
      case when has_text then coalesce(nullif(tpl.body_ar, ''), nullif(tpl.body_en, ''), coalesce(nullif(tpl.title_ar, ''), tpl.title_en)) end,
      case when has_text then coalesce(nullif(tpl.body_en, ''), nullif(tpl.body_ar, ''), coalesce(nullif(tpl.title_en, ''), tpl.title_ar)) end,
      false, 'in_app', now()
    from (
      select t.*, (coalesce(nullif(t.title_ar, ''), nullif(t.title_en, '')) is not null) as has_text
      from public.teacher_monthly_reminder_templates t
    ) tpl
    join public.nursery_settings ns on ns.nursery_id = tpl.nursery_id
    where tpl.active
      and coalesce(ns.auto_monthly_teacher_reminders_enabled, true)
    returning 1
  )
  select count(*) into inserted from sent;
  return inserted;
end;
$$;

create or replace function public.submit_application_for_review(p_application_id uuid, p_reason text default null)
returns boolean
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
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
$$;

create or replace function public.submit_application_after_payment_attempt()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_line_items jsonb;
  v_application_id uuid;
begin
  if new.status not in ('pending_confirmation', 'confirmed') then
    return new;
  end if;

  select i.line_items_json into v_line_items from public.invoices i where i.id = new.invoice_id;
  begin
    v_application_id := nullif(v_line_items ->> 'application_id', '')::uuid;
  exception when others then
    v_application_id := null;
  end;
  if v_application_id is null then
    return new;
  end if;

  perform public.submit_application_for_review(v_application_id, 'payment_submitted');
  return new;
end;
$$;

-- =============================================================================
-- 5b. Invoice lines: a "kind" plus names in both languages, never fallback words
-- =============================================================================
-- The app labels a line from its kind (invoice.itemKinds.*) when it has no name of its own.

create or replace function public._generate_tuition_invoice(p_subscription_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.child_tuition_subscriptions%rowtype;
  v_due_days integer := 7;
  v_invoice_id uuid;
  v_line_items jsonb;
begin
  select * into v_sub
  from public.child_tuition_subscriptions
  where id = p_subscription_id
    and status = 'active'
  for update;

  if not found or v_sub.next_invoice_date > current_date then
    return null;
  end if;

  select coalesce(ns.invoice_due_days, 7) into v_due_days
  from public.nursery_settings ns where ns.nursery_id = v_sub.nursery_id;

  v_line_items := jsonb_build_object(
    'child_id', v_sub.child_id,
    'subscription_id', v_sub.id,
    'tuition_package_id', v_sub.tuition_package_id,
    'package_id', v_sub.tuition_package_id,
    'package_name_ar', v_sub.tuition_package_name_ar,
    'package_name_en', v_sub.tuition_package_name_en,
    'billing_period', v_sub.billing_period,
    'billing_months', v_sub.duration_months,
    'monthly_price', v_sub.locked_price,
    'recurring_tuition', true,
    'items', jsonb_build_array(
      jsonb_build_object(
        'kind', 'tuition',
        'name_ar', nullif(v_sub.tuition_package_name_ar, ''),
        'name_en', nullif(v_sub.tuition_package_name_en, ''),
        'description', coalesce(nullif(v_sub.tuition_package_name_en, ''), nullif(v_sub.tuition_package_name_ar, '')),
        'quantity', v_sub.duration_months,
        'unitPrice', round(v_sub.locked_price / greatest(v_sub.duration_months, 1), 2),
        'unit_price', round(v_sub.locked_price / greatest(v_sub.duration_months, 1), 2),
        'total', v_sub.locked_price
      )
    )
  );

  insert into public.invoices (
    nursery_id, parent_id, amount, due_date, status, invoice_type, line_items_json
  )
  values (
    v_sub.nursery_id,
    v_sub.billed_parent_id,
    v_sub.locked_price,
    current_date + v_due_days,
    'pending',
    'monthly',
    v_line_items
  )
  returning id into v_invoice_id;

  update public.child_tuition_subscriptions
     set next_invoice_date = v_sub.next_invoice_date + make_interval(months => v_sub.duration_months),
         last_invoice_id = v_invoice_id
   where id = v_sub.id;

  return v_invoice_id;
end;
$$;

create or replace function public.select_application_payment_package(
  p_application_id uuid,
  p_package_id uuid,
  p_billing_period text default 'monthly'
)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.user_role;
  v_user_nursery_id uuid;
  v_user_chain_id uuid;
  v_app public.applications%rowtype;
  v_pkg public.tuition_packages%rowtype;
  v_period public.tuition_package_billing_periods%rowtype;
  v_deal public.deals%rowtype;
  v_invoice public.invoices%rowtype;
  v_paid numeric := 0;
  v_due_days integer := 7;
  v_invoice_id uuid;
  v_line_items jsonb;
  v_billing_period text := coalesce(nullif(p_billing_period, ''), 'monthly');
  v_billing_months integer := 1;
  v_subtotal numeric := 0;
  v_total numeric := 0;
  v_discount_amount numeric := 0;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select u.role, u.nursery_id, u.chain_id
    into v_role, v_user_nursery_id, v_user_chain_id
  from public.users u
  where u.id = v_uid;

  select * into v_app from public.applications where id = p_application_id for update;
  if not found then
    raise exception 'Application not found' using errcode = '42704';
  end if;
  if v_app.parent_id is null then
    raise exception 'Application must be linked to a parent before selecting a package' using errcode = '22023';
  end if;

  if v_role = 'parent'::public.user_role then
    if v_app.parent_id is distinct from v_uid or v_app.status in ('approved', 'rejected') then
      raise exception 'Cannot change this application package' using errcode = '42501';
    end if;
  elsif v_role in ('branch_admin'::public.user_role, 'manager'::public.user_role) then
    if v_user_nursery_id is distinct from v_app.nursery_id then
      raise exception 'Cannot change applications outside your nursery' using errcode = '42501';
    end if;
  elsif v_role = 'chain_super_admin'::public.user_role then
    if v_user_chain_id is null or not exists (
      select 1 from public.nurseries n where n.id = v_app.nursery_id and n.chain_id = v_user_chain_id
    ) then
      raise exception 'Cannot change applications outside your chain' using errcode = '42501';
    end if;
  elsif not public.is_xo_super_admin() then
    raise exception 'Cannot select application package' using errcode = '42501';
  end if;

  select * into v_pkg
  from public.tuition_packages
  where id = p_package_id and nursery_id = v_app.nursery_id and active = true;
  if not found then
    raise exception 'Package not found' using errcode = '42704';
  end if;

  v_billing_period := case v_billing_period
    when 'monthly' then 'monthly'
    when 'quarterly' then 'quarterly'
    when 'half_annual' then 'half_annual'
    when 'annual' then 'annual'
    else 'monthly'
  end;

  select * into v_period
  from public.tuition_package_billing_periods
  where tuition_package_id = p_package_id and billing_period = v_billing_period and active = true;

  if found then
    v_billing_months := v_period.duration_months;
    v_subtotal := v_period.price;
  else
    -- Legacy fallback for a package with no configured periods yet.
    v_billing_months := case v_billing_period
      when 'quarterly' then 3
      when 'half_annual' then 6
      when 'annual' then 12
      else 1
    end;
    v_subtotal := v_pkg.price * v_billing_months;
  end if;

  v_total := v_subtotal;

  -- Apply the package's assigned deal, if it's currently active and within its time window.
  if v_pkg.deal_id is not null then
    select * into v_deal
    from public.deals
    where id = v_pkg.deal_id
      and active = true
      and (starts_at is null or starts_at <= now())
      and (ends_at is null or ends_at > now());

    if found then
      if v_deal.discount_type = 'percentage' then
        v_discount_amount := round(v_subtotal * v_deal.discount_value / 100, 2);
      else
        v_discount_amount := v_deal.discount_value;
      end if;
      v_discount_amount := least(v_discount_amount, v_subtotal);
      v_total := greatest(v_subtotal - v_discount_amount, 0);
    end if;
  end if;

  select * into v_invoice
  from public.invoices i
  where i.nursery_id = v_app.nursery_id
    and i.parent_id = v_app.parent_id
    and i.line_items_json ->> 'application_id' = p_application_id::text
  order by i.created_at desc
  limit 1
  for update;

  if found then
    select coalesce(sum(p.amount), 0) into v_paid
    from public.payments p
    where p.invoice_id = v_invoice.id and p.status = 'completed';
    if v_paid > 0 then
      raise exception 'Cannot change package after payment has started' using errcode = '22023';
    end if;
  end if;

  select coalesce(ns.invoice_due_days, 7) into v_due_days
  from public.nursery_settings ns where ns.nursery_id = v_app.nursery_id;

  v_line_items := jsonb_build_object(
    'application_id', p_application_id,
    'application_payment', true,
    'package_id', p_package_id,
    'package_name_ar', v_pkg.name_ar,
    'package_name_en', v_pkg.name_en,
    'daily_hours', v_pkg.daily_hours,
    'features_json', v_pkg.features_json,
    'billing_period', v_billing_period,
    'billing_months', v_billing_months,
    'monthly_price', v_pkg.price,
    'subtotal', v_subtotal,
    'deal_id', v_deal.id,
    'discount_type', v_deal.discount_type,
    'discount_value', v_deal.discount_value,
    'discount_amount', v_discount_amount,
    'items', jsonb_build_array(
      jsonb_build_object(
        'kind', 'admission_package',
        'name_ar', nullif(v_pkg.name_ar, ''),
        'name_en', nullif(v_pkg.name_en, ''),
        'description', coalesce(nullif(v_pkg.name_en, ''), nullif(v_pkg.name_ar, '')),
        'quantity', v_billing_months,
        'unitPrice', v_pkg.price,
        'unit_price', v_pkg.price,
        'total', v_subtotal
      )
    ) || case
      when v_discount_amount > 0 then jsonb_build_array(
        jsonb_build_object(
          'kind', 'discount',
          'name_ar', nullif(v_deal.name_ar, ''),
          'name_en', nullif(v_deal.name_en, ''),
          'description', coalesce(nullif(v_deal.name_en, ''), nullif(v_deal.name_ar, '')),
          'quantity', 1,
          'unitPrice', -v_discount_amount,
          'unit_price', -v_discount_amount,
          'total', -v_discount_amount
        )
      )
      else '[]'::jsonb
    end
  );

  if v_invoice.id is not null then
    update public.invoices
       set amount = v_total,
           due_date = (current_date + v_due_days),
           status = 'pending',
           invoice_type = 'monthly',
           line_items_json = v_line_items,
           payment_method = null,
           paid_at = null,
           updated_at = now()
     where id = v_invoice.id
     returning id into v_invoice_id;
  else
    insert into public.invoices (nursery_id, parent_id, amount, due_date, status, invoice_type, line_items_json)
    values (v_app.nursery_id, v_app.parent_id, v_total, (current_date + v_due_days), 'pending', 'monthly', v_line_items)
    returning id into v_invoice_id;
  end if;

  return v_invoice_id;
end;
$$;

-- Existing invoices: same shape as new ones.
update public.invoices i
   set line_items_json = jsonb_set(i.line_items_json, '{items}', (
         select coalesce(jsonb_agg(
                  case when it ? 'attendance_date' and (it ? 'description_ar' or it ->> 'description' like 'Late pickup extra hours%')
                       then (it - 'description' - 'description_ar') || '{"kind": "late_pickup"}'::jsonb
                       else it end
                  order by ord), '[]'::jsonb)
         from jsonb_array_elements(i.line_items_json -> 'items') with ordinality as e(it, ord)))
 where jsonb_typeof(i.line_items_json) = 'object'
   and jsonb_typeof(i.line_items_json -> 'items') = 'array'
   and exists (
     select 1 from jsonb_array_elements(i.line_items_json -> 'items') it
     where it ? 'attendance_date' and (it ? 'description_ar' or it ->> 'description' like 'Late pickup extra hours%')
   );

update public.invoices i
   set line_items_json = (
         case when i.line_items_json ->> 'notes' = 'Admission package selected before approval'
              then i.line_items_json - 'notes' else i.line_items_json end
       ) || jsonb_build_object('items', (
         select coalesce(jsonb_agg(
           case
             when ord = 1 and not (it ? 'kind')
                  and (it ->> 'description') is not distinct from coalesce(
                        nullif(i.line_items_json ->> 'package_name_en', ''), nullif(i.line_items_json ->> 'package_name_ar', ''), 'Admission package')
               then it || jsonb_build_object('kind', 'admission_package',
                    'name_ar', nullif(i.line_items_json ->> 'package_name_ar', ''),
                    'name_en', nullif(i.line_items_json ->> 'package_name_en', ''))
             when ord > 1 and not (it ? 'kind') and d.id is not null
                  and (it ->> 'description') is not distinct from coalesce(nullif(d.name_en, ''), nullif(d.name_ar, ''), 'Discount')
               then it || jsonb_build_object('kind', 'discount', 'name_ar', nullif(d.name_ar, ''), 'name_en', nullif(d.name_en, ''))
             else it
           end order by ord), '[]'::jsonb)
         from jsonb_array_elements(i.line_items_json -> 'items') with ordinality as e(it, ord)
         left join public.deals d
           on (i.line_items_json ->> 'deal_id') ~* '^[0-9a-f-]{36}$' and d.id = (i.line_items_json ->> 'deal_id')::uuid))
 where jsonb_typeof(i.line_items_json) = 'object'
   and i.line_items_json ? 'application_id'
   and jsonb_typeof(i.line_items_json -> 'items') = 'array';

update public.invoices i
   set line_items_json = jsonb_set(i.line_items_json, '{items}', (
         select coalesce(jsonb_agg(
           case when ord = 1 and not (it ? 'kind')
                     and (it ->> 'description') is not distinct from coalesce(
                           nullif(i.line_items_json ->> 'package_name_en', ''), nullif(i.line_items_json ->> 'package_name_ar', ''), 'Tuition')
                then it || jsonb_build_object('kind', 'tuition',
                     'name_ar', nullif(i.line_items_json ->> 'package_name_ar', ''),
                     'name_en', nullif(i.line_items_json ->> 'package_name_en', ''))
                else it end
           order by ord), '[]'::jsonb)
         from jsonb_array_elements(i.line_items_json -> 'items') with ordinality as e(it, ord)))
 where jsonb_typeof(i.line_items_json) = 'object'
   and (i.line_items_json ->> 'recurring_tuition') = 'true'
   and jsonb_typeof(i.line_items_json -> 'items') = 'array';

-- Event invoices (written by the app) said "Event: <English title>".
update public.invoices i
   set line_items_json = (
         select coalesce(jsonb_agg(
           case when not (it ? 'kind') and it ->> 'description' like 'Event: %'
                then it || jsonb_build_object('kind', 'event',
                     'name_ar', nullif(e.title_ar, ''), 'name_en', nullif(e.title_en, ''),
                     'description', coalesce(nullif(e.title_en, ''), nullif(e.title_ar, '')))
                else it end
           order by ord), '[]'::jsonb)
         from jsonb_array_elements(i.line_items_json) with ordinality as x(it, ord))
  from public.event_invoices ei
  join public.events e on e.id = ei.event_id
 where ei.invoice_id = i.id
   and jsonb_typeof(i.line_items_json) = 'array'
   and exists (select 1 from jsonb_array_elements(i.line_items_json) it where it ->> 'description' like 'Event: %');

-- A new account's display name comes from what the user gave, never a stock word.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_local text := nullif(trim(split_part(coalesce(new.email, ''), '@', 1)), '');
  v_fallback text;
  v_name_ar text;
  v_name_en text;
begin
  v_fallback := coalesce(v_local, nullif(trim(new.phone), ''), left(new.id::text, 8));

  v_name_ar := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'name_ar'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    v_fallback
  );
  v_name_en := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'name_en'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    v_fallback
  );

  insert into public.users (id, role, name_ar, name_en, email, phone, status, language_pref)
  values (
    new.id,
    'parent'::public.user_role,
    v_name_ar,
    v_name_en,
    new.email,
    new.phone,
    'active',
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'language_pref'), ''), 'ar')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- =============================================================================
-- 6. RLS helpers that raised on every call
-- =============================================================================
-- These four were STABLE yet ran SET LOCAL in their body, which raises "SET is not allowed in
-- a non-volatile function" and breaks every policy using them (managers' health-data reads,
-- media, staff_profiles, waitlist). Their function-level "set row_security = off" already
-- covers the body, so only the statement goes. Teachers' class check uses class_staff:
-- classes has no teacher_id column.

create or replace function public.rls_staff_can_access_child(p_child_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  r public.user_role;
  u_nursery uuid;
  c_nursery uuid;
  c_class uuid;
begin
  if p_child_id is null then
    return false;
  end if;
  select u.role, u.nursery_id into r, u_nursery from public.users u where u.id = auth.uid();
  if r is null then
    return false;
  end if;
  if r = 'xo_super_admin' then
    return true;
  end if;
  select c.nursery_id, c.class_id into c_nursery, c_class from public.children c where c.id = p_child_id;
  if not found then
    return false;
  end if;
  if r = 'chain_super_admin' then
    return c_nursery in (select public.nursery_ids_for_chain_admin());
  end if;
  if r in ('branch_admin', 'manager') then
    return c_nursery is not distinct from u_nursery;
  end if;
  if r = 'teacher' then
    if c_class is null then
      return c_nursery is not distinct from u_nursery;
    end if;
    return exists (select 1 from public.class_staff cs where cs.class_id = c_class and cs.user_id = auth.uid());
  end if;
  return false;
end;
$$;

create or replace function public.rls_authenticated_staff_sees_nursery(p_nursery_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  r public.user_role;
  u_nursery uuid;
begin
  if p_nursery_id is null then
    return false;
  end if;
  select u.role, u.nursery_id into r, u_nursery from public.users u where u.id = auth.uid();
  if r is null then
    return false;
  end if;
  if r = 'xo_super_admin' then
    return true;
  end if;
  if r = 'chain_super_admin' then
    return p_nursery_id in (select public.nursery_ids_for_chain_admin());
  end if;
  if r in ('branch_admin', 'manager', 'teacher') then
    return p_nursery_id is not distinct from u_nursery;
  end if;
  return false;
end;
$$;

create or replace function public.rls_staff_manages_nursery(p_nursery_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  r public.user_role;
  u_nursery uuid;
begin
  if p_nursery_id is null then
    return false;
  end if;
  select u.role, u.nursery_id into r, u_nursery from public.users u where u.id = auth.uid();
  if r is null then
    return false;
  end if;
  if r = 'xo_super_admin' then
    return true;
  end if;
  if r = 'chain_super_admin' then
    return p_nursery_id in (select public.nursery_ids_for_chain_admin());
  end if;
  if r in ('branch_admin', 'manager') then
    return p_nursery_id is not distinct from u_nursery;
  end if;
  return false;
end;
$$;

create or replace function public.user_has_feature(p_feature_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_role_id uuid;
begin
  if public.is_xo_super_admin() then
    return true;
  end if;
  select u.role_id into v_role_id from public.users u where u.id = auth.uid();
  if v_role_id is null then
    return false;
  end if;
  return exists (
    select 1 from public.role_features rf
    where rf.role_id = v_role_id and rf.feature_id = p_feature_id
  );
end;
$$;

-- Its SET LOCAL row_security = off outlived the call and switched RLS off for the rest of the
-- transaction. A function-level setting confines it to the call.
alter function public.parent_can_access_child(uuid) set search_path = public;
alter function public.parent_can_access_child(uuid) set row_security = off;

-- =============================================================================
-- 7. Old text-building helpers and signatures
-- =============================================================================

drop function if exists public.attendance_notify_parents(uuid, text, text, text, text, text, text, text, text);
drop function if exists public.attendance_notify_staff(uuid, public.user_role[], text, text, text, text, text, text, text);
drop function if exists public.attendance_fmt_time(timestamptz, text, text);
drop function if exists public.attendance_fmt_clock(time, text);
drop function if exists public.attendance_fmt_money(numeric, text, text);
drop function if exists public.attendance_fmt_hours(numeric);
drop function if exists public.attendance_child_name(public.children, text);

-- =============================================================================
-- 8. Permissions
-- =============================================================================

do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.i18n_names(text, text)',
    'public.user_names(uuid)',
    'public.notify_users(uuid[], uuid, text, text, jsonb, text, text, text)',
    'public.attendance_notify_parents(uuid, text, text, jsonb, text, text, text)',
    'public.attendance_notify_staff(uuid, public.user_role[], text, text, jsonb, text, text)',
    'public.attendance_billing_start(public.attendance_records, public.nursery_settings)',
    'public.attendance_compute_extra_time(public.attendance_records, public.nursery_settings, timestamptz)',
    'public.attendance_merge_late_item(jsonb, date, numeric, numeric, numeric)',
    'public.apply_attendance_late_charge(uuid, timestamptz, text, boolean)',
    'public.attendance_reduce_late_charge(uuid, numeric)',
    'public.run_late_pickup_sweep()',
    'public.run_pickup_reminders()',
    'public.run_attendance_daily_close()',
    'public.run_payment_reminders()',
    'public.run_permission_deadline_reminders()',
    'public.run_monthly_teacher_reminders()',
    'public.attendance_absence_reports_after_insert()',
    'public.pickup_incidents_after_insert()',
    'public.invoice_number_label(public.invoices)',
    'public.invoice_paid_total(uuid)',
    'public.invoice_pending_total(uuid)',
    'public.invoice_append_item(jsonb, jsonb)',
    'public.payment_staff_guard(uuid)',
    'public.payment_finance_recipients(uuid)',
    'public.loyalty_award_payment_points(uuid, uuid, uuid, numeric)',
    'public.payment_attempts_before_insert()',
    'public.submit_application_after_payment_attempt()',
    -- Only reached from the payment-attempt trigger; it has no ownership check of its own.
    'public.submit_application_for_review(uuid, text)'
  ]
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', v_fn);
  end loop;

  foreach v_fn in array array[
    'public.record_attendance_check_in(uuid, text, uuid)',
    'public.record_attendance_check_out(uuid, text, uuid, jsonb, boolean)',
    'public.undo_attendance_check_in(uuid)',
    'public.admin_correct_attendance(uuid, timestamptz, timestamptz, text)',
    'public.admin_waive_late_charge(uuid, text)',
    'public.get_attendance_kpis(uuid, date)',
    'public.submit_invoice_payment(uuid, numeric, text, text, text, uuid)',
    'public.confirm_invoice_payment_attempt(uuid)',
    'public.reject_invoice_payment_attempt(uuid, text)',
    'public.admin_record_invoice_payment(uuid, numeric, text, timestamptz, uuid)',
    'public.redeem_loyalty_points(uuid, integer, uuid)'
  ]
  loop
    execute format('revoke execute on function %s from public, anon', v_fn);
    execute format('grant execute on function %s to authenticated', v_fn);
  end loop;
end $$;

commit;

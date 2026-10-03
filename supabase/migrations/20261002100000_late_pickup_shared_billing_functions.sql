-- Shared billing logic for late pickup, used by BOTH the real checkout path and the new
-- automatic sweep (20261002103000), so the math only exists in one place. The core
-- correctness requirement: a child's package hours and invoice must never be double-charged
-- no matter how many times the sweep re-estimates before the real checkout finalizes it.
--
-- Idempotency design: attendance_records.extra_hours/extra_fee are treated as the CUMULATIVE
-- amount already applied for that attendance-day. Every call computes the day's new total
-- late hours, takes the DELTA over what was already applied, and only consumes package hours
-- / adds invoice amount for that delta — so repeated sweep calls (every 15 min) and the final
-- checkout call never add the same hour twice, regardless of how many times they run.

begin;

-- Pure calculation — timezone-aware (nursery_settings.timezone), unlike the original
-- client-side computeLatePickup() in src/lib/teacherAttendanceToggle.ts which assumed the
-- device's local timezone matched the nursery's.
create or replace function public.compute_late_pickup(
  p_end_time time,
  p_grace_minutes integer,
  p_fee_per_hour numeric,
  p_attendance_date date,
  p_as_of timestamptz,
  p_timezone text default 'Africa/Cairo'
)
returns table(is_late boolean, late_minutes integer, extra_hours integer, gross_fee numeric)
language plpgsql
set search_path = public
as $$
declare
  v_end_of_day timestamptz;
  v_late_minutes integer;
begin
  if p_end_time is null then
    return query select false, 0, 0, 0::numeric;
    return;
  end if;

  v_end_of_day := (p_attendance_date::text || ' ' || p_end_time::text)::timestamp at time zone coalesce(p_timezone, 'Africa/Cairo');
  v_late_minutes := greatest(0, floor(extract(epoch from (p_as_of - v_end_of_day)) / 60)::integer);

  if v_late_minutes <= coalesce(p_grace_minutes, 0) then
    return query select false, v_late_minutes, 0, 0::numeric;
    return;
  end if;

  return query select
    true,
    v_late_minutes,
    ceil(v_late_minutes / 60.0)::integer,
    round(ceil(v_late_minutes / 60.0) * coalesce(p_fee_per_hour, 0), 2);
end;
$$;

-- Internal only — intentionally NOT reachable directly by `authenticated` (Postgres grants
-- EXECUTE to PUBLIC by default on new functions, so this must be explicitly revoked below).
-- It trusts its caller to have already authorized the action; only the cron sweep and the
-- role-checked record_attendance_checkout_billing wrapper may call it.
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
  v_raw_extra_hours integer;
  v_new_extra_hours integer;
  v_previous_extra_hours numeric;
  v_delta_hours numeric;
  v_delta_covered numeric;
  v_delta_chargeable numeric;
  v_delta_fee numeric;
  v_total_fee numeric;
  v_invoice public.invoices%rowtype;
  v_invoice_id uuid;
  v_newly_capped boolean := false;
begin
  if p_source not in ('sweep', 'checkout') then
    raise exception 'Invalid late-charge source' using errcode = '22023';
  end if;

  select * into v_att
  from public.attendance_records
  where id = p_attendance_id
  for update;

  if not found then
    raise exception 'Attendance record not found' using errcode = '42704';
  end if;

  -- Already settled and this isn't the finalizing checkout call — nothing to do.
  if v_att.late_charge_status = 'final' and not p_finalize then
    return jsonb_build_object('skipped', true, 'reason', 'already_final');
  end if;

  -- Belt-and-suspenders: the sweep's own query already excludes checked-out children.
  if p_source = 'sweep' and v_att.check_out is not null then
    return jsonb_build_object('skipped', true, 'reason', 'already_checked_out');
  end if;

  select * into v_child from public.children where id = v_att.child_id;
  if not found then
    return jsonb_build_object('skipped', true, 'reason', 'child_not_found');
  end if;

  select * into v_ns from public.nursery_settings where nursery_id = v_child.nursery_id;

  select * into v_calc
  from public.compute_late_pickup(
    v_ns.standard_end_time,
    coalesce(v_ns.late_pickup_grace_minutes, 0),
    coalesce(v_ns.late_pickup_fee_per_hour, 0),
    v_att.attendance_date,
    p_as_of,
    coalesce(v_ns.timezone, 'Africa/Cairo')
  );

  v_raw_extra_hours := v_calc.extra_hours;
  v_new_extra_hours := v_raw_extra_hours;

  -- The 3-hour cap only applies to the unattended sweep — a real, confirmed checkout always
  -- bills the true late hours in full, capped or not.
  if p_source = 'sweep' and v_raw_extra_hours > 3 then
    v_new_extra_hours := 3;
    if not v_att.late_charge_capped then
      v_newly_capped := true;
    end if;
  end if;

  v_previous_extra_hours := coalesce(v_att.extra_hours, 0);
  v_delta_hours := greatest(v_new_extra_hours - v_previous_extra_hours, 0);

  if v_delta_hours > 0 then
    select public.package_apply_extra_hours(v_att.child_id, v_delta_hours, true) into v_delta_covered;
    v_delta_covered := coalesce(v_delta_covered, 0);
    v_delta_chargeable := greatest(v_delta_hours - v_delta_covered, 0);
    v_delta_fee := round(v_delta_chargeable * coalesce(v_ns.late_pickup_fee_per_hour, 0), 2);
  else
    v_delta_chargeable := 0;
    v_delta_fee := 0;
  end if;

  v_total_fee := coalesce(v_att.extra_fee, 0) + v_delta_fee;
  v_invoice_id := v_att.late_charge_invoice_id;

  if v_delta_fee > 0 then
    if v_invoice_id is not null then
      select * into v_invoice from public.invoices where id = v_invoice_id;
    end if;

    if v_invoice_id is not null and v_invoice.status = 'pending' then
      -- Same day's invoice, still unpaid: raise it to the new cumulative total in place.
      update public.invoices
         set amount = v_total_fee,
             line_items_json = line_items_json || jsonb_build_object('extra_hours', v_new_extra_hours),
             updated_at = now()
       where id = v_invoice_id;
    else
      -- No invoice yet, or the existing one is already paid/cancelled: create a new one for
      -- exactly this increment — never mutates a settled invoice.
      insert into public.invoices (
        nursery_id, parent_id, amount, due_date, status, invoice_type, line_items_json
      )
      select
        v_child.nursery_id,
        pc.parent_id,
        v_delta_fee,
        current_date + coalesce(v_ns.invoice_due_days, 7),
        'pending',
        'extra_hours',
        jsonb_build_object(
          'child_id', v_att.child_id,
          'attendance_date', v_att.attendance_date,
          'extra_hours', v_new_extra_hours,
          'late_charge_source', p_source,
          'items', jsonb_build_array(
            jsonb_build_object(
              'description', 'Late pickup extra hours',
              'quantity', v_delta_chargeable,
              'unitPrice', v_ns.late_pickup_fee_per_hour,
              'unit_price', v_ns.late_pickup_fee_per_hour,
              'total', v_delta_fee
            )
          )
        )
      from public.parent_children pc
      where pc.child_id = v_att.child_id
      order by pc.created_at
      limit 1
      returning id into v_invoice_id;
    end if;
  end if;

  update public.attendance_records
     set extra_hours = v_new_extra_hours,
         extra_fee = v_total_fee,
         late_charge_status = case when p_finalize then 'final' else 'provisional' end,
         late_charge_source = p_source,
         late_charge_applied_at = now(),
         late_charge_invoice_id = coalesce(v_invoice_id, late_charge_invoice_id),
         late_charge_capped = v_att.late_charge_capped or v_newly_capped
   where id = p_attendance_id;

  -- First time this day's charge hits the cap: alert staff instead of continuing to bill —
  -- a child still there very late is a safety follow-up, not an open-ended bill.
  if v_newly_capped then
    insert into public.notifications (
      nursery_id, user_id, type, title_ar, title_en, body_ar, body_en, read, channel, sent_at, action_link, urgency
    )
    select
      v_child.nursery_id, u.id, 'late_pickup_cap_reached',
      'تنبيه: تأخر استلام الطفل',
      'Alert: child not yet picked up',
      coalesce(nullif(v_child.full_name_ar, ''), v_child.full_name_en) || ' لم يتم استلامه بعد وتجاوز الحد الأقصى للرسوم التلقائية. يرجى المتابعة فورًا.',
      coalesce(nullif(v_child.full_name_en, ''), v_child.full_name_ar) || ' has not been picked up and has reached the automatic billing cap. Please follow up immediately.',
      false, 'in_app', now(), '/admin/attendance', 'high'
    from public.users u
    where u.nursery_id = v_child.nursery_id
      and u.role in ('branch_admin', 'manager', 'teacher');
  end if;

  return jsonb_build_object(
    'late_pickup', v_calc.is_late,
    'extra_hours', v_new_extra_hours,
    'extra_fee', v_total_fee,
    'capped', v_att.late_charge_capped or v_newly_capped
  );
end;
$$;

revoke execute on function public.apply_attendance_late_charge(uuid, timestamptz, text, boolean) from public;

-- Thin, role-checked, atomic wrapper for the real checkout path: sets check_out and
-- finalizes the day's late charge in one transaction, replacing the client-orchestrated
-- "set checkout, then separately call package_apply_extra_hours" sequence in
-- src/lib/teacherAttendanceToggle.ts. Granted to `authenticated`; does its own authorization
-- since apply_attendance_late_charge does not.
create or replace function public.record_attendance_checkout_billing(
  p_attendance_id uuid,
  p_checkout_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.user_role;
  v_user_nursery_id uuid;
  v_att public.attendance_records%rowtype;
  v_child_nursery_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select u.role, u.nursery_id into v_role, v_user_nursery_id
  from public.users u where u.id = v_uid;

  select * into v_att
  from public.attendance_records
  where id = p_attendance_id
  for update;

  if not found then
    raise exception 'Attendance record not found' using errcode = '42704';
  end if;

  select c.nursery_id into v_child_nursery_id from public.children c where c.id = v_att.child_id;

  if not (
    public.is_xo_super_admin()
    or (v_role in ('teacher', 'branch_admin', 'manager') and v_user_nursery_id = v_child_nursery_id)
  ) then
    raise exception 'Cannot check out this child' using errcode = '42501';
  end if;

  update public.attendance_records
     set check_out = p_checkout_at
   where id = p_attendance_id;

  return public.apply_attendance_late_charge(p_attendance_id, p_checkout_at, 'checkout', true);
end;
$$;

grant execute on function public.record_attendance_checkout_billing(uuid, timestamptz) to authenticated;

commit;

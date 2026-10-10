-- Keep QR attendance changes inside the nursery's operating window. Check-in is
-- limited to opening hours; checkout may continue through grace and covered extra time.

begin;

create or replace function public.attendance_qr_time_rejection(
  p_child_id uuid,
  p_attendance_id uuid,
  p_action text,
  p_scan_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_child public.children%rowtype;
  v_att public.attendance_records%rowtype;
  v_ns public.nursery_settings%rowtype;
  v_package public.packages%rowtype;
  v_child_package public.child_packages%rowtype;
  v_timezone text;
  v_local_timestamp timestamp;
  v_open_at timestamptz;
  v_close_at timestamptz;
  v_cutoff timestamptz;
  v_extra_hours numeric := 0;
  v_cap_hours numeric;
begin
  if p_action = 'check_in' then
    select *
      into v_child
      from public.children
     where id = p_child_id;

    if not found then
      return 'attendance_child_not_found';
    end if;

    select *
      into v_ns
      from public.nursery_settings
     where nursery_id = v_child.nursery_id;

    if v_ns.standard_start_time is null or v_ns.standard_end_time is null then
      return 'attendance_qr_work_hours_not_configured';
    end if;

    v_timezone := coalesce(v_ns.timezone, 'Africa/Cairo');
    v_local_timestamp := p_scan_at at time zone v_timezone;
    v_open_at := (v_local_timestamp::date + v_ns.standard_start_time) at time zone v_timezone;
    v_close_at := (v_local_timestamp::date + v_ns.standard_end_time) at time zone v_timezone;

    if p_scan_at < v_open_at or p_scan_at > v_close_at then
      return 'attendance_qr_checkin_outside_work_hours';
    end if;
    return null;
  elsif p_action <> 'check_out' then
    raise exception 'attendance_invalid_qr_time_action' using errcode = '22023';
  end if;

  select *
    into v_att
    from public.attendance_records
   where id = p_attendance_id
   for update;

  if not found then
    return 'attendance_not_found';
  end if;

  select *
    into v_child
    from public.children
   where id = v_att.child_id;

  if not found then
    return 'attendance_child_not_found';
  end if;

  select *
    into v_ns
    from public.nursery_settings
   where nursery_id = v_child.nursery_id;

  if v_ns.standard_end_time is null then
    return 'attendance_qr_work_hours_not_configured';
  end if;

  v_timezone := coalesce(v_ns.timezone, 'Africa/Cairo');
  v_close_at := (v_att.attendance_date + v_ns.standard_end_time) at time zone v_timezone;
  v_cap_hours := least(greatest(coalesce(v_ns.late_sweep_cap_hours, 3), 1), 12);

  select *
    into v_child_package
    from public.child_packages
   where child_id = v_att.child_id
     and status = 'active'
   limit 1
   for update;

  if found then
    select * into v_package from public.packages where id = v_child_package.package_id;
    if found
       and v_package.active
       and (v_child_package.expires_at is null or v_child_package.expires_at > p_scan_at) then
      if v_package.coverage_type = 'unlimited' then
        v_extra_hours := v_cap_hours;
      else
        -- Automatic late billing consumes quota while a child is still checked in.
        -- Add today's already-covered hours back to the live balance so the cutoff
        -- does not move earlier as the sweep consumes the package.
        v_extra_hours :=
          greatest(coalesce(v_package.included_hours, 0) - coalesce(v_child_package.hours_used, 0), 0)
          + greatest(coalesce(v_att.extra_hours_covered, 0), 0);
      end if;
    end if;
  end if;

  v_cutoff := v_close_at
    + make_interval(mins => greatest(coalesce(v_ns.late_pickup_grace_minutes, 0), 0))
    + v_extra_hours * interval '1 hour';

  if p_scan_at > v_cutoff then
    return 'attendance_qr_checkout_outside_allowed_period';
  end if;

  return null;
end;
$$;

revoke all on function public.attendance_qr_time_rejection(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;

alter function public.record_attendance_check_in(uuid, text, uuid)
  rename to record_attendance_check_in_without_work_hours_guard;
alter function public.record_attendance_check_out(uuid, text, uuid, jsonb, boolean)
  rename to record_attendance_check_out_without_work_hours_guard;
revoke all on function public.record_attendance_check_in_without_work_hours_guard(uuid, text, uuid)
  from public, anon, authenticated;
revoke all on function public.record_attendance_check_out_without_work_hours_guard(uuid, text, uuid, jsonb, boolean)
  from public, anon, authenticated;

create function public.record_attendance_check_in(
  p_child_id uuid,
  p_method text default 'manual',
  p_qr_token_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_child public.children%rowtype;
  v_ns public.nursery_settings%rowtype;
  v_token public.qr_tokens%rowtype;
  v_today date;
  v_timezone text;
  v_now timestamptz := now();
  v_reason text;
begin
  if p_method is distinct from 'qr_parent' then
    return public.record_attendance_check_in_without_work_hours_guard(
      p_child_id, p_method, p_qr_token_id
    );
  end if;

  select * into v_child from public.children where id = p_child_id;
  if not found then
    return public.record_attendance_check_in_without_work_hours_guard(
      p_child_id, p_method, p_qr_token_id
    );
  end if;

  perform public.attendance_require_staff(v_child.nursery_id, false, 'create');
  if v_child.status <> 'active' then
    return public.record_attendance_check_in_without_work_hours_guard(
      p_child_id, p_method, p_qr_token_id
    );
  end if;

  begin
    v_token := public.attendance_check_qr(p_qr_token_id, p_child_id, 'parent');
  exception when sqlstate 'P0001' then
    perform public.attendance_log_event(
      null, p_child_id, 'scan_rejected', p_method, p_qr_token_id,
      jsonb_build_object('reason', sqlerrm, 'action', 'check_in')
    );
    return jsonb_build_object('status', 'rejected', 'reason', sqlerrm);
  end;

  select * into v_ns from public.nursery_settings where nursery_id = v_child.nursery_id;
  v_timezone := coalesce(v_ns.timezone, 'Africa/Cairo');
  v_today := (v_now at time zone v_timezone)::date;

  if exists (
    select 1
      from public.attendance_records ar
     where ar.child_id = p_child_id
       and ar.attendance_date = v_today
       and ar.check_in is not null
  ) then
    return public.record_attendance_check_in_without_work_hours_guard(
      p_child_id, p_method, p_qr_token_id
    );
  end if;

  v_reason := public.attendance_qr_time_rejection(p_child_id, null, 'check_in', v_now);
  if v_reason is not null then
    perform public.attendance_log_event(
      null, p_child_id, 'scan_rejected', p_method, p_qr_token_id,
      jsonb_build_object('reason', v_reason, 'action', 'check_in')
    );
    return jsonb_build_object('status', 'rejected', 'reason', v_reason);
  end if;

  return public.record_attendance_check_in_without_work_hours_guard(
    p_child_id, p_method, p_qr_token_id
  );
end;
$$;

create function public.record_attendance_check_out(
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
set row_security = off
as $$
declare
  v_att public.attendance_records%rowtype;
  v_child public.children%rowtype;
  v_ns public.nursery_settings%rowtype;
  v_token public.qr_tokens%rowtype;
  v_reason text;
  v_now timestamptz := now();
begin
  if p_method is distinct from 'qr_parent'
     and p_method is distinct from 'qr_custom' then
    return public.record_attendance_check_out_without_work_hours_guard(
      p_attendance_id, p_method, p_qr_token_id, p_pickup, p_force
    );
  end if;

  if octet_length((case when jsonb_typeof(p_pickup) = 'object' then p_pickup else '{}'::jsonb end)::text) > 8000 then
    return public.record_attendance_check_out_without_work_hours_guard(
      p_attendance_id, p_method, p_qr_token_id, p_pickup, p_force
    );
  end if;

  select * into v_att
    from public.attendance_records
   where id = p_attendance_id
   for update;
  if not found then
    return public.record_attendance_check_out_without_work_hours_guard(
      p_attendance_id, p_method, p_qr_token_id, p_pickup, p_force
    );
  end if;

  select * into v_child from public.children where id = v_att.child_id;
  if not found then
    return public.record_attendance_check_out_without_work_hours_guard(
      p_attendance_id, p_method, p_qr_token_id, p_pickup, p_force
    );
  end if;
  perform public.attendance_require_staff(v_child.nursery_id, false, 'create');

  if v_att.check_in is null or v_att.check_out is not null then
    return public.record_attendance_check_out_without_work_hours_guard(
      p_attendance_id, p_method, p_qr_token_id, p_pickup, p_force
    );
  end if;

  select * into v_ns from public.nursery_settings where nursery_id = v_child.nursery_id;
  if not p_force
     and v_now - v_att.check_in < make_interval(mins => coalesce(v_ns.min_minutes_between_scans, 5)) then
    return public.record_attendance_check_out_without_work_hours_guard(
      p_attendance_id, p_method, p_qr_token_id, p_pickup, p_force
    );
  end if;

  begin
    v_token := public.attendance_check_qr(
      p_qr_token_id,
      v_att.child_id,
      case when p_method = 'qr_custom' then 'delegate' else 'parent' end
    );
  exception when sqlstate 'P0001' then
    perform public.attendance_log_event(
      p_attendance_id, v_att.child_id, 'scan_rejected', p_method, p_qr_token_id,
      jsonb_build_object('reason', sqlerrm, 'action', 'check_out')
    );
    return jsonb_build_object(
      'status', 'rejected',
      'reason', sqlerrm,
      'attendance_id', p_attendance_id
    );
  end;

  v_reason := public.attendance_qr_time_rejection(
    v_att.child_id, p_attendance_id, 'check_out', v_now
  );
  if v_reason is not null then
    perform public.attendance_log_event(
      p_attendance_id, v_att.child_id, 'scan_rejected', p_method, p_qr_token_id,
      jsonb_build_object('reason', v_reason, 'action', 'check_out')
    );
    return jsonb_build_object(
      'status', 'rejected',
      'reason', v_reason,
      'attendance_id', p_attendance_id,
      'check_in', v_att.check_in
    );
  end if;

  return public.record_attendance_check_out_without_work_hours_guard(
    p_attendance_id, p_method, p_qr_token_id, p_pickup, p_force
  );
end;
$$;

revoke all on function public.record_attendance_check_in(uuid, text, uuid) from public, anon;
revoke all on function public.record_attendance_check_out(uuid, text, uuid, jsonb, boolean) from public, anon;
grant execute on function public.record_attendance_check_in(uuid, text, uuid) to authenticated;
grant execute on function public.record_attendance_check_out(uuid, text, uuid, jsonb, boolean) to authenticated;

create or replace function public.guard_qr_attendance_working_hours()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_reason text;
begin
  if tg_op = 'INSERT' then
    if new.check_in is not null and new.check_in_method in ('qr_parent', 'qr_custom') then
      v_reason := public.attendance_qr_time_rejection(
        new.child_id, null, 'check_in', new.check_in
      );
      if v_reason is not null then
        raise exception '%', v_reason using errcode = 'P0001';
      end if;
    end if;

    if new.check_out is not null and new.check_out_method in ('qr_parent', 'qr_custom') then
      v_reason := public.attendance_qr_time_rejection(
        new.child_id, new.id, 'check_out', new.check_out
      );
      if v_reason is not null then
        raise exception '%', v_reason using errcode = 'P0001';
      end if;
    end if;
  else
    if new.check_in is not null
       and new.check_in_method in ('qr_parent', 'qr_custom')
       and (old.check_in is null or old.check_in_method is distinct from new.check_in_method) then
      v_reason := public.attendance_qr_time_rejection(
        new.child_id, null, 'check_in', new.check_in
      );
      if v_reason is not null then
        raise exception '%', v_reason using errcode = 'P0001';
      end if;
    end if;

    if new.check_out is not null
       and new.check_out_method in ('qr_parent', 'qr_custom')
       and (old.check_out is null or old.check_out_method is distinct from new.check_out_method) then
      v_reason := public.attendance_qr_time_rejection(
        new.child_id, new.id, 'check_out', new.check_out
      );
      if v_reason is not null then
        raise exception '%', v_reason using errcode = 'P0001';
      end if;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_qr_attendance_working_hours()
  from public, anon, authenticated;

drop trigger if exists attendance_qr_working_hours_guard on public.attendance_records;
create trigger attendance_qr_working_hours_guard
  before insert or update of check_in, check_out, check_in_method, check_out_method
  on public.attendance_records
  for each row
  execute function public.guard_qr_attendance_working_hours();

commit;

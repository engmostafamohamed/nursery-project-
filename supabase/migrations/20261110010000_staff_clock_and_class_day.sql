-- Staff clocking in and out, and the class page's day.
--
-- staff_attendance had a table and screens that read it (the staff member's HR calendar, the
-- dashboard) but nothing wrote it. Now:
--   * A member of staff clocks in when they arrive and out when they leave, from their phone
--     (clock_staff). Arriving more than 5 minutes after the nursery opens marks the day late, with
--     the minutes. Leaving records the hours worked.
--   * Whoever runs the staff (the branch's admins, and staff whose role may update staff) records or
--     corrects a day: someone forgot their phone, left without clocking out (record_staff_attendance).
--     Each row says who recorded it (source self or admin).
--   * get_my_staff_day: the staff member's own day, for the card on their home page.
--   * The class page (get_class_profile) shows each team member's clocking in and out today, keeps the
--     nanny after the teachers, and, while the nursery is open, a child who has not come yet is
--     "expected" rather than absent.

alter table public.staff_attendance
  add column if not exists check_in_by uuid references public.users (id) on delete set null,
  add column if not exists check_out_by uuid references public.users (id) on delete set null,
  add column if not exists source text,
  add column if not exists late_minutes integer;
alter table public.staff_attendance drop constraint if exists staff_attendance_source_check;
alter table public.staff_attendance add constraint staff_attendance_source_check check (source is null or source in ('self', 'admin'));
alter table public.staff_attendance drop constraint if exists staff_attendance_late_check;
alter table public.staff_attendance add constraint staff_attendance_late_check check (late_minutes is null or late_minutes >= 0);
alter table public.staff_attendance drop constraint if exists staff_attendance_out_after_in;
alter table public.staff_attendance add constraint staff_attendance_out_after_in
  check (check_out_at is null or check_in_at is null or check_out_at >= check_in_at);
create index if not exists idx_staff_attendance_nursery_day on public.staff_attendance (nursery_id, work_date);

-- Late is counted from the nursery's opening time, in its own clock; up to 5 minutes is on time.
create or replace function public.staff_late_minutes(p_nursery_id uuid, p_day date, p_at timestamptz)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case when p_at is null or n.opens_at is null then null
              else greatest(0, floor(extract(epoch from (p_at - ((p_day + n.opens_at) at time zone
                     coalesce((select s.timezone from public.nursery_settings s where s.nursery_id = n.id), 'Africa/Cairo')))) / 60)::integer)
         end
    from public.nurseries n
   where n.id = p_nursery_id
$$;

create or replace function public.staff_attendance_json(p_row public.staff_attendance)
returns jsonb
language sql
stable
as $$
  select case when p_row.id is null then null else jsonb_build_object(
    'id', p_row.id, 'work_date', p_row.work_date,
    'check_in_at', coalesce(p_row.check_in_at, p_row.clock_in), 'check_out_at', coalesce(p_row.check_out_at, p_row.clock_out),
    'status', p_row.status, 'late_minutes', p_row.late_minutes, 'work_hours', p_row.work_hours,
    'source', p_row.source, 'notes', p_row.notes) end
$$;

-- Who may record or correct a day for someone else.
create or replace function public.staff_attendance_can_manage(p_nursery_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
  v_nursery uuid;
  v_chain uuid;
begin
  if auth.uid() is null or p_nursery_id is null then
    return false;
  end if;
  if public.is_xo_super_admin() then
    return true;
  end if;
  select u.role, u.nursery_id, u.chain_id into v_role, v_nursery, v_chain from public.users u where u.id = auth.uid();
  if v_role = 'chain_super_admin' then
    return v_chain is not null and exists (select 1 from public.nurseries n where n.id = p_nursery_id and n.chain_id = v_chain);
  elsif v_role = 'branch_admin' then
    return v_nursery is not distinct from p_nursery_id;
  elsif v_role = 'manager' then
    return v_nursery is not distinct from p_nursery_id and public.user_can('staff', 'update');
  end if;
  return false;
end;
$$;

revoke execute on function public.staff_late_minutes(uuid, date, timestamptz) from public, anon, authenticated;
revoke execute on function public.staff_attendance_json(public.staff_attendance) from public, anon, authenticated;
revoke execute on function public.staff_attendance_can_manage(uuid) from public, anon;
grant execute on function public.staff_attendance_can_manage(uuid) to authenticated, service_role;

-- The signed-in member of staff's day: today, the nursery's hours, their clocking, an absence.
create or replace function public.get_my_staff_day()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_nursery public.nurseries%rowtype;
  v_today date;
  v_row public.staff_attendance%rowtype;
begin
  select * into v_user from public.users where id = auth.uid();
  if v_user.id is null or v_user.role not in ('teacher', 'manager', 'branch_admin') or v_user.nursery_id is null then
    raise exception 'staff_clock_forbidden' using errcode = '42501';
  end if;
  select * into v_nursery from public.nurseries where id = v_user.nursery_id;
  v_today := public.nursery_today(v_nursery.id);
  select * into v_row from public.staff_attendance where user_id = v_user.id and work_date = v_today;
  return jsonb_build_object(
    'today', v_today,
    'school_day', public.attendance_is_school_day(v_nursery.id, v_today),
    'opens_at', v_nursery.opens_at,
    'closes_at', v_nursery.closes_at,
    'timezone', coalesce((select s.timezone from public.nursery_settings s where s.nursery_id = v_nursery.id), 'Africa/Cairo'),
    'day', public.staff_attendance_json(v_row),
    'absence', (select jsonb_build_object('reason', a.reason, 'starts_on', a.starts_on, 'ends_on', a.ends_on)
                  from public.staff_absences a
                 where a.user_id = v_user.id and a.cancelled_at is null and v_today between a.starts_on and a.ends_on
                 order by a.starts_on limit 1)
  );
end;
$$;
revoke execute on function public.get_my_staff_day() from public, anon;
grant execute on function public.get_my_staff_day() to authenticated, service_role;

-- Clocking in ('in') or out ('out') now, as the signed-in member of staff. Returns their day.
create or replace function public.clock_staff(p_action text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_today date;
  v_now timestamptz := now();
  v_row public.staff_attendance%rowtype;
  v_late integer;
begin
  select * into v_user from public.users where id = auth.uid();
  if v_user.id is null or v_user.role not in ('teacher', 'manager', 'branch_admin') or v_user.nursery_id is null
     or coalesce(v_user.status, 'active') <> 'active' then
    raise exception 'staff_clock_forbidden' using errcode = '42501';
  end if;
  if coalesce(p_action, '') not in ('in', 'out') then
    raise exception 'staff_clock_invalid' using errcode = '22023';
  end if;
  v_today := public.nursery_today(v_user.nursery_id);
  select * into v_row from public.staff_attendance where user_id = v_user.id and work_date = v_today for update;

  if p_action = 'in' then
    if coalesce(v_row.check_in_at, v_row.clock_in) is not null then
      raise exception 'staff_clock_already_in' using errcode = 'P0001';
    end if;
    v_late := public.staff_late_minutes(v_user.nursery_id, v_today, v_now);
    insert into public.staff_attendance (user_id, nursery_id, work_date, clock_in, check_in_at, status, late_minutes, source, check_in_by, staff_id)
    values (v_user.id, v_user.nursery_id, v_today, v_now, v_now, case when v_late > 5 then 'late' else 'present' end, v_late, 'self', v_user.id,
            (select sp.id from public.staff_profiles sp where sp.user_id = v_user.id order by sp.created_at limit 1))
    on conflict (user_id, work_date) do update
      set clock_in = excluded.clock_in, check_in_at = excluded.check_in_at, status = excluded.status,
          late_minutes = excluded.late_minutes, source = excluded.source, check_in_by = excluded.check_in_by,
          staff_id = coalesce(public.staff_attendance.staff_id, excluded.staff_id), updated_at = now();
  else
    if coalesce(v_row.check_in_at, v_row.clock_in) is null then
      raise exception 'staff_clock_not_in' using errcode = 'P0001';
    end if;
    if coalesce(v_row.check_out_at, v_row.clock_out) is not null then
      raise exception 'staff_clock_already_out' using errcode = 'P0001';
    end if;
    update public.staff_attendance
       set clock_out = v_now, check_out_at = v_now, check_out_by = v_user.id,
           work_hours = round((extract(epoch from (v_now - coalesce(check_in_at, clock_in))) / 3600.0)::numeric, 2),
           updated_at = now()
     where id = v_row.id;
  end if;
  return public.get_my_staff_day();
end;
$$;
revoke execute on function public.clock_staff(text) from public, anon;
grant execute on function public.clock_staff(text) to authenticated, service_role;

-- Records or corrects a member of staff's day (times in the nursery's clock); both times empty
-- clears the day. Up to two months back. Returns the day (null once cleared).
create or replace function public.record_staff_attendance(
  p_user_id uuid, p_day date, p_check_in time, p_check_out time default null, p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person public.users%rowtype;
  v_today date;
  v_tz text;
  v_in timestamptz;
  v_out timestamptz;
  v_late integer;
  v_row public.staff_attendance%rowtype;
begin
  select * into v_person from public.users where id = p_user_id;
  if v_person.id is null or v_person.nursery_id is null or not public.staff_attendance_can_manage(v_person.nursery_id) then
    raise exception 'staff_clock_forbidden' using errcode = '42501';
  end if;
  if v_person.role not in ('teacher', 'manager', 'branch_admin') then
    raise exception 'staff_clock_person' using errcode = '22023';
  end if;
  v_today := public.nursery_today(v_person.nursery_id);
  if p_day is null or p_day > v_today or p_day < v_today - 62
     or (p_check_in is null and p_check_out is not null)
     or (p_check_out is not null and p_check_out <= p_check_in)
     or char_length(btrim(coalesce(p_note, ''))) > 200 then
    raise exception 'staff_clock_invalid' using errcode = '22023';
  end if;

  if p_check_in is null then
    delete from public.staff_attendance where user_id = v_person.id and work_date = p_day;
    return null;
  end if;

  v_tz := coalesce((select s.timezone from public.nursery_settings s where s.nursery_id = v_person.nursery_id), 'Africa/Cairo');
  v_in := (p_day + p_check_in) at time zone v_tz;
  v_out := case when p_check_out is null then null else (p_day + p_check_out) at time zone v_tz end;
  if v_in > now() or (v_out is not null and v_out > now()) then
    raise exception 'staff_clock_invalid' using errcode = '22023';
  end if;
  v_late := public.staff_late_minutes(v_person.nursery_id, p_day, v_in);

  insert into public.staff_attendance (user_id, nursery_id, work_date, clock_in, check_in_at, clock_out, check_out_at, status, late_minutes,
                                       work_hours, source, check_in_by, check_out_by, notes, staff_id)
  values (v_person.id, v_person.nursery_id, p_day, v_in, v_in, v_out, v_out, case when v_late > 5 then 'late' else 'present' end, v_late,
          case when v_out is null then null else round((extract(epoch from (v_out - v_in)) / 3600.0)::numeric, 2) end,
          'admin', auth.uid(), case when v_out is null then null else auth.uid() end, nullif(btrim(coalesce(p_note, '')), ''),
          (select sp.id from public.staff_profiles sp where sp.user_id = v_person.id order by sp.created_at limit 1))
  on conflict (user_id, work_date) do update
    set clock_in = excluded.clock_in, check_in_at = excluded.check_in_at, clock_out = excluded.clock_out, check_out_at = excluded.check_out_at,
        status = excluded.status, late_minutes = excluded.late_minutes, work_hours = excluded.work_hours, source = 'admin',
        check_in_by = excluded.check_in_by, check_out_by = excluded.check_out_by, notes = excluded.notes,
        staff_id = coalesce(public.staff_attendance.staff_id, excluded.staff_id), updated_at = now()
  returning * into v_row;
  return public.staff_attendance_json(v_row);
end;
$$;
revoke execute on function public.record_staff_attendance(uuid, date, time, time, text) from public, anon;
grant execute on function public.record_staff_attendance(uuid, date, time, time, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------------------------
-- The class page: the team's clocking today, the nanny after the teachers, and "expected" children.

create or replace function public.get_class_profile(p_class_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_class public.classes%rowtype;
  v_role public.user_role := public.current_user_role();
  v_today date;
  v_tz text;
  v_closes time;
  v_open boolean;
begin
  select * into v_class from public.classes where id = p_class_id and deleted_at is null;
  if v_class.id is null then
    raise exception 'class_not_found' using errcode = 'P0002';
  end if;
  -- coalesce: a caller with no role (no users row) makes the test NULL, which must refuse, not pass.
  if not coalesce(
    public.is_xo_super_admin()
    or (v_role in ('branch_admin', 'manager') and v_class.nursery_id = public.current_user_nursery_id())
    or (v_role = 'chain_super_admin' and v_class.nursery_id in (select public.nursery_ids_for_chain_admin())),
    false
  ) then
    raise exception 'class_forbidden' using errcode = '42501';
  end if;
  v_today := public.nursery_today(v_class.nursery_id);
  v_tz := coalesce((select s.timezone from public.nursery_settings s where s.nursery_id = v_class.nursery_id), 'Africa/Cairo');
  v_closes := (select n.closes_at from public.nurseries n where n.id = v_class.nursery_id);
  -- Until closing time a child who has not come yet is expected, not absent.
  v_open := public.attendance_is_school_day(v_class.nursery_id, v_today)
            and (v_closes is null or (now() at time zone v_tz)::time < v_closes);

  return jsonb_build_object(
    'today', v_today,
    'school_day', public.attendance_is_school_day(v_class.nursery_id, v_today),
    'day_open', v_open,
    'class', jsonb_build_object(
      'id', v_class.id, 'nursery_id', v_class.nursery_id, 'name_ar', v_class.name_ar, 'name_en', v_class.name_en,
      'grade_level', v_class.grade_level, 'room_number', v_class.room_number, 'capacity', v_class.capacity,
      'created_at', v_class.created_at,
      -- Check-in and pick-up times read in the nursery's own clock.
      'timezone', (select s.timezone from public.nursery_settings s where s.nursery_id = v_class.nursery_id)),

    'team', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', u.id, 'name_ar', u.name_ar, 'name_en', u.name_en, 'email', u.email, 'phone', u.phone,
               'role', cs.role, 'since', cs.created_at, 'active', coalesce(u.status, 'active') = 'active',
               -- Today's clocking in and out (staff_attendance).
               'clock_in', coalesce(sa.check_in_at, sa.clock_in), 'clock_out', coalesce(sa.check_out_at, sa.clock_out),
               'late_minutes', sa.late_minutes, 'clock_source', sa.source,
               'on_duty', d.user_id is not null, 'covering', coalesce(d.covering, false),
               'absence', (select jsonb_build_object('reason', a.reason, 'starts_on', a.starts_on, 'ends_on', a.ends_on)
                             from public.staff_absences a
                            where a.user_id = u.id and a.cancelled_at is null and v_today between a.starts_on and a.ends_on
                            order by a.starts_on
                            limit 1))
             order by array_position(array['lead', 'substitute', 'assistant', 'nanny'], cs.role::text), u.name_en)
        from public.class_staff cs
        join public.users u on u.id = cs.user_id
        left join public.class_duty_teachers(v_class.id, v_today) d on d.user_id = cs.user_id
        left join public.staff_attendance sa on sa.user_id = cs.user_id and sa.work_date = v_today
       where cs.class_id = v_class.id
    ), '[]'::jsonb),

    'children', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'name_ar', c.full_name_ar, 'name_en', c.full_name_en, 'code', c.child_id_number,
               'avatar_url', c.avatar_url, 'dob', c.dob, 'gender', c.gender,
               'enrolled_on', coalesce(c.enrollment_date, c.created_at::date),
               -- present (came and went home) | partial (here now) | absent | excused | off | not_enrolled
               'attendance', case
                 when ar.check_in is not null and ar.check_out is not null then 'present'
                 when ar.check_in is not null then 'partial'
                 when coalesce(c.enrollment_date, c.created_at::date) > v_today then 'not_enrolled'
                 when abr.id is not null then 'excused'
                 when not public.attendance_is_school_day(c.nursery_id, v_today) then 'off'
                 when v_open then 'expected'
                 else 'absent'
               end,
               'check_in', ar.check_in, 'check_out', ar.check_out, 'absence_reason', abr.reason,
               'report', case
                 when dr.id is null or public.daily_report_untouched(dr.status, dr.prepared_at, dr.last_saved_at) then 'none'
                 else dr.status
               end,
               'allergies', coalesce((
                 select jsonb_agg(jsonb_build_object('name', a.allergen_name, 'severity', a.severity)
                                  order by array_position(array['life_threatening', 'severe', 'moderate', 'mild'], a.severity), a.allergen_name)
                   from public.child_allergies a
                  where a.child_id = c.id
               ), '[]'::jsonb),
               'conditions', (select count(*) from public.child_chronic_conditions x where x.child_id = c.id),
               -- The medicines the round gives today (consented, in course, not expired).
               'medications', (select count(*) from public.child_medications m
                                where m.child_id = c.id and public.medication_active_on(m, v_today)))
             order by c.full_name_en, c.full_name_ar)
        from public.children c
        left join public.attendance_records ar on ar.child_id = c.id and ar.attendance_date = v_today
        left join public.attendance_absence_reports abr on abr.child_id = c.id and abr.absence_date = v_today
        left join public.daily_reports dr on dr.child_id = c.id and dr.report_date = v_today
       where c.class_id = v_class.id and c.status = 'active'
    ), '[]'::jsonb),

    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'kind', x.kind, 'audience', x.audience, 'status', x.status,
               'body_ar', x.body_ar, 'body_en', x.body_en, 'sender_ar', x.sender_ar, 'sender_en', x.sender_en,
               'sent_at', x.sent_at)
             order by x.sent_at desc)
        from (
          select b.id, 'announcement' as kind, b.audience_scope as audience, coalesce(b.delivery_status, 'sent') as status,
                 b.content_ar as body_ar, b.content_en as body_en, s.name_ar as sender_ar, s.name_en as sender_en,
                 coalesce(b.scheduled_for, b.sent_at, b.created_at) as sent_at
            from public.broadcast_messages b
            left join public.users s on s.id = b.sender_id
           where b.class_id = v_class.id and b.audience_scope = 'class'
          union all
          select f.id, 'family_message', f.audience, 'sent', f.body, f.body, f.sender_name_ar, f.sender_name_en, f.created_at
            from public.family_messages f
           where f.class_id = v_class.id
          order by sent_at desc
          limit 8
        ) x
    ), '[]'::jsonb),

    'waitlist', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', w.id, 'inquiry_id', i.id, 'position', w.position, 'status', w.status,
               'added_at', w.added_at, 'notified_at', w.notified_at,
               'child_name', i.child_name, 'child_dob', i.child_dob, 'parent_name', i.parent_name,
               'parent_phone', i.parent_phone, 'start_date', i.preferred_start_date)
             order by w.position, w.added_at)
        from public.waitlist w
        join public.inquiries i on i.id = w.inquiry_id
       where w.class_id = v_class.id and w.status in ('waiting', 'offered')
    ), '[]'::jsonb),

    'team_changes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'action', x.action, 'role', x.role, 'previous_role', x.previous_role, 'at', x.created_at,
               'name_ar', x.name_ar, 'name_en', x.name_en, 'by_ar', x.by_ar, 'by_en', x.by_en)
             order by x.created_at desc)
        from (
          select t.id, t.action, t.role, t.previous_role, t.created_at, u.name_ar, u.name_en, b.name_ar as by_ar, b.name_en as by_en
            from public.class_team_changes t
            join public.users u on u.id = t.user_id
            left join public.users b on b.id = t.changed_by
           where t.class_id = v_class.id
           order by t.created_at desc
           limit 10
        ) x
    ), '[]'::jsonb),

    'media', jsonb_build_object(
      'pending', (select count(*) from public.media m where m.class_id = v_class.id and m.status = 'pending_approval'),
      'approved_30d', (select count(*) from public.media m
                        where m.class_id = v_class.id and m.status = 'approved' and m.created_at >= now() - interval '30 days')),

    'cameras', coalesce((
      select jsonb_agg(jsonb_build_object('id', k.id, 'name_ar', k.name_ar, 'name_en', k.name_en, 'location', k.location, 'active', k.active)
             order by k.name_en)
        from public.cameras k
       where k.class_id = v_class.id
    ), '[]'::jsonb)
  );
end;
$function$;

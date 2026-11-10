-- Courses during extra hours: the owner's decisions of 11 Nov 2026.
--
-- 1. The wait before a course is not extra time either. After closing, the time from the billing
--    start until the child's last course of the day ends is covered (waiting, gaps between courses
--    and the courses); only the time after it is extra. A child picked up while still waiting pays
--    nothing for the wait. Before opening, a course that day covers the child's whole early arrival.
--    A cancelled session covers nothing: the time it would have covered is extra, unless a course
--    that ran covers it anyway (then nothing changes and no end-of-day notice is sent).
-- 2. Cancelling a session that has not started yet tells the families of the enrolled children at
--    once (course, day, time, reason); undoing it before it starts tells them it is back on. The
--    end-of-day notice about the extra time stays as it is.

-- -----------------------------------------------------------------------------------------------
-- 1. What courses cover

-- The minutes a child's courses cover on a day: after closing, from the billing start until the
-- last course ends (or pickup, if sooner); before opening, the whole early arrival when a course
-- runs in it. With the sessions that ran, or (p_with_cancelled) as if the cancelled ones had run.
create or replace function public.course_cover_minutes(
  p_child_id uuid, p_day date,
  p_late_from timestamptz, p_late_to timestamptz,
  p_early_from timestamptz, p_early_to timestamptz,
  p_with_cancelled boolean
)
returns table (late_minutes integer, early_minutes integer)
language sql
stable
security definer
set search_path = public
as $$
  with s as (
    select x.session from public.child_course_sessions(p_child_id, p_day) x where p_with_cancelled or not x.cancelled
  ),
  last_course as (
    select max(upper(s.session)) as ends_at from s where upper(s.session) > p_late_from
  )
  select
    case when p_late_from is null or p_late_to is null or p_late_to <= p_late_from or l.ends_at is null then 0
         else floor(extract(epoch from (least(l.ends_at, p_late_to) - p_late_from)) / 60)::integer
    end,
    case when p_early_from is not null and p_early_to > p_early_from
              and exists (select 1 from s where s.session && tstzrange(p_early_from, p_early_to, '[)'))
         then floor(extract(epoch from (p_early_to - p_early_from)) / 60)::integer
         else 0
    end
  from last_course l
$$;

-- The minutes taken off the day's extra time by the courses that ran or, with p_cancelled, the
-- minutes the cancellations made extra (what all the sessions would have covered, less what the
-- ones that ran cover). Same windows as attendance_compute_extra_time.
create or replace function public.attendance_course_minutes(
  p_att public.attendance_records, p_ns public.nursery_settings, p_as_of timestamptz, p_cancelled boolean
)
returns table (late_minutes integer, early_minutes integer)
language sql
stable
security definer
set search_path = public
as $$
  with w as (
    select public.attendance_billing_start(p_att, p_ns) as late_from,
           case when coalesce(p_ns.late_billing_base, 'closing_time') = 'closing_time'
                     and coalesce(p_ns.early_arrival_billing_enabled, false)
                     and p_ns.standard_start_time is not null
                     and coalesce(p_att.early_minutes, 0) > 0
                then (p_att.attendance_date + p_ns.standard_start_time) at time zone coalesce(p_ns.timezone, 'Africa/Cairo')
           end as opening
  )
  select case when p_cancelled then greatest(a.late_minutes - r.late_minutes, 0) else r.late_minutes end,
         case when p_cancelled then greatest(a.early_minutes - r.early_minutes, 0) else r.early_minutes end
    from w
   cross join lateral public.course_cover_minutes(p_att.child_id, p_att.attendance_date, w.late_from, p_as_of,
                                                  w.opening - make_interval(mins => coalesce(p_att.early_minutes, 0)), w.opening, false) r
   cross join lateral public.course_cover_minutes(p_att.child_id, p_att.attendance_date, w.late_from, p_as_of,
                                                  w.opening - make_interval(mins => coalesce(p_att.early_minutes, 0)), w.opening, true) a
$$;

-- Replaced by course_cover_minutes.
drop function if exists public.child_course_minutes(uuid, date, timestamptz, timestamptz, boolean);

-- -----------------------------------------------------------------------------------------------
-- 2. Telling the families about a session still to come

-- Tells the parents of the course's enrolled children about a session that has not started yet
-- (cancelled, with its reason, or back on). Returns how many children's parents were told; 0 for a
-- session that has started or passed.
create or replace function public.course_session_tell_families(p_course public.courses, p_day date, p_template text, p_reason text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session tstzrange := public.course_session_range(p_course, p_day);
  v_tz text := coalesce((select ns.timezone from public.nursery_settings ns where ns.nursery_id = p_course.nursery_id), 'Africa/Cairo');
  v_child record;
  v_count integer := 0;
begin
  if v_session is null or now() >= lower(v_session) then
    return 0;
  end if;
  for v_child in
    select distinct c.id, c.full_name_ar, c.full_name_en
      from public.course_enrollments e
      join public.children c on c.id = e.child_id and c.status = 'active'
     where e.course_id = p_course.id and e.status = 'active'
  loop
    perform public.attendance_notify_parents(
      v_child.id, p_template, p_template,
      jsonb_build_object(
        'child', public.i18n_names(v_child.full_name_ar, v_child.full_name_en),
        'course', public.i18n_names(p_course.title_ar, p_course.title_en),
        'reason', p_reason,
        'date', p_day,
        'start_time', lower(v_session),
        'end_time', upper(v_session),
        'tz', v_tz
      ),
      '/parent/courses',
      'normal'
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- As before, and a session still to come is told to the families at once (only when it is newly
-- cancelled, not when its reason is edited).
create or replace function public.cancel_course_session(p_course_id uuid, p_day date, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course public.courses%rowtype;
  v_window record;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_new boolean;
begin
  if not public.course_can_manage_sessions(p_course_id) then
    raise exception 'course_forbidden' using errcode = '42501';
  end if;
  select * into v_course from public.courses where id = p_course_id;
  select * into v_window from public.course_session_window(v_course);
  if p_day is null or p_day < v_window.change_from or p_day > v_window.change_to then
    raise exception 'course_session_out_of_window' using errcode = '22023';
  end if;
  if v_reason = '' then
    raise exception 'course_session_reason_required' using errcode = '22023';
  end if;
  if char_length(v_reason) > 300 then
    raise exception 'course_session_reason_too_long' using errcode = '22023';
  end if;
  if not public.course_runs_on(v_course, p_day) then
    raise exception 'course_session_not_scheduled' using errcode = '22023';
  end if;

  insert into public.course_session_cancellations (course_id, nursery_id, session_date, reason, cancelled_by)
  values (p_course_id, v_course.nursery_id, p_day, v_reason, auth.uid())
  on conflict (course_id, session_date)
  do update set reason = excluded.reason, cancelled_by = excluded.cancelled_by, updated_at = now()
  returning (xmax = 0) into v_new;

  return jsonb_build_object(
    'date', p_day, 'cancelled', true, 'reason', v_reason,
    'rebilled', public.course_session_rebill(p_course_id, p_day),
    'notified', case when v_new then public.course_session_tell_families(v_course, p_day, 'course_session_cancelled_ahead', v_reason) else 0 end
  );
end;
$$;

-- As before, and a session still to come is told to the families as back on.
create or replace function public.restore_course_session(p_course_id uuid, p_day date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course public.courses%rowtype;
  v_window record;
begin
  if not public.course_can_manage_sessions(p_course_id) then
    raise exception 'course_forbidden' using errcode = '42501';
  end if;
  select * into v_course from public.courses where id = p_course_id;
  select * into v_window from public.course_session_window(v_course);
  if p_day is null or p_day < v_window.change_from or p_day > v_window.change_to then
    raise exception 'course_session_out_of_window' using errcode = '22023';
  end if;
  delete from public.course_session_cancellations where course_id = p_course_id and session_date = p_day;
  if not found then
    return jsonb_build_object('date', p_day, 'cancelled', false, 'rebilled', 0, 'notified', 0);
  end if;
  return jsonb_build_object(
    'date', p_day, 'cancelled', false,
    'rebilled', public.course_session_rebill(p_course_id, p_day),
    'notified', public.course_session_tell_families(v_course, p_day, 'course_session_restored', null)
  );
end;
$$;

revoke execute on function public.course_cover_minutes(uuid, date, timestamptz, timestamptz, timestamptz, timestamptz, boolean) from public, anon, authenticated;
revoke execute on function public.attendance_course_minutes(public.attendance_records, public.nursery_settings, timestamptz, boolean) from public, anon, authenticated;
revoke execute on function public.course_session_tell_families(public.courses, date, text, text) from public, anon, authenticated;
grant execute on function public.course_cover_minutes(uuid, date, timestamptz, timestamptz, timestamptz, timestamptz, boolean) to service_role;
grant execute on function public.attendance_course_minutes(public.attendance_records, public.nursery_settings, timestamptz, boolean) to service_role;
grant execute on function public.course_session_tell_families(public.courses, date, text, text) to service_role;

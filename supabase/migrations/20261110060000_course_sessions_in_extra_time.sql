-- Courses during extra hours.
--
-- A child who stays after closing (or comes before opening) for a course they are enrolled in is
-- not charged extra time for the course's time: the course's monthly fee covers it. Only the
-- course's own time is taken off; waiting before it or staying after it is extra time as usual.
-- When a session is cancelled (always with a reason), its time is extra time again, and at the end
-- of the nursery's day the parents are told, with the course, the reason and the day's extra time.
--
-- 1. course_session_cancellations: one row per cancelled session (course + day) and its reason.
-- 2. A course's sessions: course_session_range (its time on a day), course_runs_on, and
--    child_course_sessions (a child's sessions on a day, each cancelled or not).
-- 3. attendance_course_minutes: the minutes of a child's sessions inside their extra-time windows
--    (after the billing start; before opening when early arrival is billed). The sessions that ran
--    are taken off in attendance_compute_extra_time; cancelled ones are not.
-- 4. attendance_rebill_late_charge: bills a day again after something changed it (an admin's
--    correction, a session cancelled or restored). admin_correct_attendance now uses it.
-- 5. get_course_sessions, cancel_course_session, restore_course_session for the course pages: the
--    nursery's admins and the course's own teacher.
-- 6. run_course_cancellation_notices (every 15 minutes): one notification per child and day.

-- -----------------------------------------------------------------------------------------------
-- 1. Cancelled sessions, and the end-of-day notices already sent
create table if not exists public.course_session_cancellations (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  nursery_id uuid not null references public.nurseries(id) on delete cascade,
  session_date date not null,
  reason text not null constraint course_session_cancellations_reason_length check (char_length(btrim(reason)) between 1 and 300),
  cancelled_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint course_session_cancellations_course_day_uniq unique (course_id, session_date)
);
create index if not exists course_session_cancellations_day_idx on public.course_session_cancellations (session_date);

-- Read and changed only through the functions below.
alter table public.course_session_cancellations enable row level security;
revoke all on public.course_session_cancellations from anon, authenticated;

-- The extra-time check reads a child's courses every 15 minutes while they are here.
create index if not exists course_enrollments_child_idx on public.course_enrollments (child_id);

create table if not exists public.course_cancellation_notices (
  attendance_id uuid primary key references public.attendance_records(id) on delete cascade,
  sent_at timestamptz not null default now()
);
alter table public.course_cancellation_notices enable row level security;
revoke all on public.course_cancellation_notices from anon, authenticated;

-- -----------------------------------------------------------------------------------------------
-- 2. A course's sessions

-- The course's time on a day in the nursery's time zone, or null when its times are missing or
-- unreadable (they are typed as 'HH:MM').
create or replace function public.course_session_range(p_course public.courses, p_day date)
returns tstzrange
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_course.schedule_time_start ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
     and p_course.schedule_time_end ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
    then case
      -- Nested, so the times are only read as times once they are known to be times.
      when p_course.schedule_time_end::time > p_course.schedule_time_start::time
      then tstzrange((p_day + p_course.schedule_time_start::time) at time zone z.tz,
                     (p_day + p_course.schedule_time_end::time) at time zone z.tz, '[)')
    end
  end
  from (select coalesce((select ns.timezone from public.nursery_settings ns where ns.nursery_id = p_course.nursery_id), 'Africa/Cairo') as tz) z
$$;

-- Whether the course has a session on the day: it is active, the day is in its dates and on one of
-- its weekdays, and it has a time.
create or replace function public.course_runs_on(p_course public.courses, p_day date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_course.status = 'active'
     and (p_course.starts_on is null or p_day >= p_course.starts_on)
     and (p_course.ends_on is null or p_day <= p_course.ends_on)
     and (array['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'])[extract(dow from p_day)::int + 1]
         = any (array(select lower(btrim(d)) from unnest(coalesce(p_course.schedule_days, '{}'::text[])) d))
     and public.course_session_range(p_course, p_day) is not null
$$;

-- The child's course sessions on a day: the courses they were enrolled in on that day (and still
-- are, or left later), each with its time and whether it was cancelled, and why.
create or replace function public.child_course_sessions(p_child_id uuid, p_day date)
returns table (course_id uuid, title_ar text, title_en text, session tstzrange, cancelled boolean, reason text)
language sql
stable
security definer
set search_path = public
as $$
  select co.id, co.title_ar, co.title_en, public.course_session_range(co, p_day), cx.id is not null, cx.reason
    from public.course_enrollments e
    join public.courses co on co.id = e.course_id
    cross join lateral (
      select coalesce((select ns.timezone from public.nursery_settings ns where ns.nursery_id = co.nursery_id), 'Africa/Cairo') as tz
    ) z
    left join public.course_session_cancellations cx on cx.course_id = co.id and cx.session_date = p_day
   where e.child_id = p_child_id
     and (e.enrolled_at at time zone z.tz)::date <= p_day
     and (e.status = 'active'
          or (e.status = 'cancelled' and e.unenrolled_at is not null and (e.unenrolled_at at time zone z.tz)::date > p_day))
     and public.course_runs_on(co, p_day)
$$;

-- Minutes between two moments of the child's sessions that ran, or (p_cancelled) of their cancelled
-- sessions outside the ones that ran: the time a cancellation really left without a course.
-- Courses at the same time count once.
create or replace function public.child_course_minutes(p_child_id uuid, p_day date, p_from timestamptz, p_to timestamptz, p_cancelled boolean)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case when p_from is null or p_to is null or p_to <= p_from then 0 else coalesce((
    select floor(sum(extract(epoch from upper(r) - lower(r))) / 60)::integer
      from (
        select range_agg(s.session) filter (where not s.cancelled) as ran,
               range_agg(s.session) filter (where s.cancelled) as cancelled
          from public.child_course_sessions(p_child_id, p_day) s
      ) k
      cross join lateral unnest(
        case when p_cancelled
             then coalesce(k.cancelled, '{}'::tstzmultirange) - coalesce(k.ran, '{}'::tstzmultirange)
             else coalesce(k.ran, '{}'::tstzmultirange)
        end
        * tstzmultirange(tstzrange(p_from, p_to, '[)'))
      ) as r
  ), 0) end
$$;

-- -----------------------------------------------------------------------------------------------
-- 3. Course time inside a day's extra-time windows, and the extra time without it

-- The minutes of the child's sessions inside the late window (billing start to p_as_of) and the
-- early window (arrival to opening, only when early arrival is billed), the same windows
-- attendance_compute_extra_time bills.
create or replace function public.attendance_course_minutes(
  p_att public.attendance_records, p_ns public.nursery_settings, p_as_of timestamptz, p_cancelled boolean
)
returns table (late_minutes integer, early_minutes integer)
language sql
stable
security definer
set search_path = public
as $$
  select public.child_course_minutes(p_att.child_id, p_att.attendance_date, public.attendance_billing_start(p_att, p_ns), p_as_of, p_cancelled),
         case when coalesce(p_ns.late_billing_base, 'closing_time') = 'closing_time'
                   and coalesce(p_ns.early_arrival_billing_enabled, false)
                   and p_ns.standard_start_time is not null
                   and coalesce(p_att.early_minutes, 0) > 0
              then public.child_course_minutes(
                     p_att.child_id, p_att.attendance_date,
                     ((p_att.attendance_date + p_ns.standard_start_time) at time zone coalesce(p_ns.timezone, 'Africa/Cairo'))
                       - make_interval(mins => p_att.early_minutes),
                     (p_att.attendance_date + p_ns.standard_start_time) at time zone coalesce(p_ns.timezone, 'Africa/Cairo'),
                     p_cancelled)
              else 0
         end
$$;

-- As before, with the time of the courses the child stayed for taken off (late_minutes is the
-- time the child was in extra care, so a child picked up right after a course is not late).
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
  v_course record;
  v_late integer := 0;
  v_billable integer := 0;
  v_arrived_early integer;
  v_early integer := 0;
begin
  select * into v_course from public.attendance_course_minutes(p_att, p_ns, p_as_of, false);

  if v_start is not null and p_as_of is not null then
    v_late := greatest(0, floor(extract(epoch from (p_as_of - v_start)) / 60)::integer - coalesce(v_course.late_minutes, 0));
  end if;

  if v_late > v_grace then
    v_billable := case when v_from_grace then v_late - v_grace else v_late end;
  end if;

  -- Early arrival only means something against fixed opening hours.
  v_arrived_early := greatest(coalesce(p_att.early_minutes, 0) - coalesce(v_course.early_minutes, 0), 0);
  if coalesce(p_ns.late_billing_base, 'closing_time') = 'closing_time'
     and coalesce(p_ns.early_arrival_billing_enabled, false)
     and v_arrived_early > v_grace then
    v_early := case when v_from_grace then v_arrived_early - v_grace else v_arrived_early end;
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

-- -----------------------------------------------------------------------------------------------
-- 4. Billing a day again after it changed

-- Bills the day as of its checkout (or now, for a child still here today): more extra time is
-- charged, less is reduced (refunded or released to the package). Does nothing for a day without
-- a check-in, waived, or in the past without a checkout.
create or replace function public.attendance_rebill_late_charge(p_attendance_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_att public.attendance_records%rowtype;
  v_ns public.nursery_settings%rowtype;
  v_tz text;
  v_as_of timestamptz;
  v_calc record;
  v_result jsonb := '{}'::jsonb;
begin
  select * into v_att from public.attendance_records where id = p_attendance_id for update;
  if not found or v_att.check_in is null or v_att.late_charge_waived then
    return v_result;
  end if;
  select ns.* into v_ns from public.nursery_settings ns join public.children c on c.nursery_id = ns.nursery_id where c.id = v_att.child_id;
  v_tz := coalesce(v_ns.timezone, 'Africa/Cairo');
  v_as_of := coalesce(v_att.check_out, case when v_att.attendance_date = (now() at time zone v_tz)::date then now() end);
  if v_as_of is null then
    return v_result;
  end if;

  select * into v_calc from public.attendance_compute_extra_time(v_att, v_ns, v_as_of);
  if v_calc.target_hours > coalesce(v_att.extra_hours, 0) then
    v_result := public.apply_attendance_late_charge(p_attendance_id, v_as_of, 'correction', v_att.check_out is not null);
  elsif v_calc.target_hours < coalesce(v_att.extra_hours, 0) then
    v_result := public.attendance_reduce_late_charge(p_attendance_id, v_calc.target_hours);
  end if;
  update public.attendance_records
     set late_minutes = v_calc.late_minutes,
         late_charge_status = case when v_att.check_out is not null then 'final' else late_charge_status end
   where id = p_attendance_id;
  return v_result;
end;
$$;

-- As before; the re-billing is now attendance_rebill_late_charge (shared with course sessions).
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
   where id = p_attendance_id;

  -- Re-bill as of the corrected checkout (or "now" for a child still here today).
  v_result := public.attendance_rebill_late_charge(p_attendance_id);

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

-- -----------------------------------------------------------------------------------------------
-- 5. The course pages: a course's sessions, cancelling and restoring one

-- The nursery's admins and the course's own teacher manage its sessions.
create or replace function public.course_can_manage_sessions(p_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (public.current_user_role() in ('branch_admin', 'chain_super_admin') and public.course_in_my_nursery(p_course_id))
    or public.course_taught_by_me(p_course_id),
    false
  )
$$;

-- The nursery's today, and the days a session may be cancelled or restored: from a week back (to
-- record one after the fact) to 90 days ahead.
create or replace function public.course_session_window(p_course public.courses)
returns table (today date, change_from date, change_to date)
language sql
stable
security definer
set search_path = public
as $$
  select t.today, t.today - 7, t.today + 90
    from (select (now() at time zone coalesce((select ns.timezone from public.nursery_settings ns where ns.nursery_id = p_course.nursery_id), 'Africa/Cairo'))::date as today) t
$$;

-- Bills again the day's attendance of the course's children; returns how many days were billed.
create or replace function public.course_session_rebill(p_course_id uuid, p_day date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_count integer := 0;
begin
  for v_id in
    select ar.id from public.attendance_records ar
     where ar.attendance_date = p_day
       and ar.check_in is not null
       and ar.child_id in (select e.child_id from public.course_enrollments e where e.course_id = p_course_id)
     order by ar.id
  loop
    perform public.attendance_rebill_late_charge(v_id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- The course's sessions from p_from to p_to (at most ~4 months), each cancelled or not, with when
-- they may be changed.
create or replace function public.get_course_sessions(p_course_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
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
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 120 then
    raise exception 'course_session_invalid_range' using errcode = '22023';
  end if;
  select * into v_course from public.courses where id = p_course_id;
  select * into v_window from public.course_session_window(v_course);
  return jsonb_build_object(
    'today', v_window.today,
    'change_from', v_window.change_from,
    'change_to', v_window.change_to,
    'time_start', v_course.schedule_time_start,
    'time_end', v_course.schedule_time_end,
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'date', d.day,
               'cancelled', cx.id is not null,
               'reason', cx.reason,
               'cancelled_at', cx.updated_at,
               'cancelled_by', case when cx.id is not null then public.i18n_names(u.name_ar, u.name_en) end
             ) order by d.day)
        from (select g::date as day from generate_series(p_from, p_to, interval '1 day') g) d
        left join public.course_session_cancellations cx on cx.course_id = p_course_id and cx.session_date = d.day
        left join public.users u on u.id = cx.cancelled_by
       where public.course_runs_on(v_course, d.day) or cx.id is not null
    ), '[]'::jsonb)
  );
end;
$$;

-- Cancels a session with its reason (cancelling again changes the reason). The day's extra time of
-- the course's children is billed again: the session's time is now extra time.
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
  do update set reason = excluded.reason, cancelled_by = excluded.cancelled_by, updated_at = now();

  return jsonb_build_object('date', p_day, 'cancelled', true, 'reason', v_reason,
                            'rebilled', public.course_session_rebill(p_course_id, p_day));
end;
$$;

-- Undoes a cancellation: the session's time is covered by the course again, and the day is billed
-- again (less extra time).
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
    return jsonb_build_object('date', p_day, 'cancelled', false, 'rebilled', 0);
  end if;
  return jsonb_build_object('date', p_day, 'cancelled', false, 'rebilled', public.course_session_rebill(p_course_id, p_day));
end;
$$;

-- -----------------------------------------------------------------------------------------------
-- 6. The end-of-day notice to the parents

-- After the nursery's end of the day (end_of_day_checklist_time, else closing time, else 17:00),
-- each child who went home with extra time that includes a cancelled session's time: one notice to
-- the parents with the course, the reason and the day's extra time. Days left without a checkout
-- are sent the next day. Each child and day once; the last week only.
create or replace function public.run_course_cancellation_notices()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_att public.attendance_records%rowtype;
  v_ns public.nursery_settings%rowtype;
  v_minutes integer;
  v_course_ar text;
  v_course_en text;
  v_reasons text;
  v_inserted integer;
  v_sent integer := 0;
begin
  for v_row in
    select ar.id, z.tz
      from public.attendance_records ar
      join public.children c on c.id = ar.child_id
      left join public.nursery_settings ns on ns.nursery_id = c.nursery_id
      cross join lateral (select coalesce(ns.timezone, 'Africa/Cairo') as tz) z
     where ar.check_in is not null
       and coalesce(ar.extra_hours, 0) > 0
       and ar.attendance_date >= (now() at time zone z.tz)::date - 7
       and (ar.attendance_date < (now() at time zone z.tz)::date
            or (ar.check_out is not null
                and (now() at time zone z.tz)::time >= coalesce(ns.end_of_day_checklist_time, ns.standard_end_time, time '17:00')))
       and exists (
         select 1 from public.course_session_cancellations cx
           join public.course_enrollments e on e.course_id = cx.course_id and e.child_id = ar.child_id
          where cx.session_date = ar.attendance_date)
       and not exists (select 1 from public.course_cancellation_notices n where n.attendance_id = ar.id)
     order by ar.attendance_date, ar.id
  loop
    select * into v_att from public.attendance_records where id = v_row.id;
    select ns.* into v_ns from public.nursery_settings ns join public.children c on c.nursery_id = ns.nursery_id where c.id = v_att.child_id;

    -- Only when the cancelled time was part of the extra time (not when the child went home first).
    select coalesce(m.late_minutes, 0) + coalesce(m.early_minutes, 0) into v_minutes
      from public.attendance_course_minutes(
             v_att, v_ns, coalesce(v_att.check_out, (v_att.attendance_date + 1)::timestamp at time zone v_row.tz), true
           ) m;
    continue when coalesce(v_minutes, 0) = 0;

    select string_agg(distinct coalesce(nullif(btrim(s.title_ar), ''), s.title_en), '، '),
           string_agg(distinct coalesce(nullif(btrim(s.title_en), ''), s.title_ar), ', '),
           string_agg(distinct s.reason, ' / ')
      into v_course_ar, v_course_en, v_reasons
      from public.child_course_sessions(v_att.child_id, v_att.attendance_date) s
     where s.cancelled;

    insert into public.course_cancellation_notices (attendance_id) values (v_att.id) on conflict do nothing;
    get diagnostics v_inserted = row_count;
    continue when v_inserted = 0;

    perform public.attendance_notify_parents(
      v_att.child_id,
      'course_session_cancelled',
      'course_session_cancelled',
      jsonb_build_object(
        'child', (select public.i18n_names(c.full_name_ar, c.full_name_en) from public.children c where c.id = v_att.child_id),
        'course', public.i18n_names(v_course_ar, v_course_en),
        'reason', v_reasons,
        'date', v_att.attendance_date,
        'minutes', v_minutes,
        'hours', coalesce(v_att.extra_hours, 0),
        'covered', coalesce(v_att.extra_hours_covered, 0),
        'fee', coalesce(v_att.extra_fee, 0),
        'currency', coalesce(v_ns.currency, 'EGP'),
        'segments', (case when coalesce(v_att.extra_hours_covered, 0) > 0 then '["covered"]'::jsonb else '[]'::jsonb end)
                    || (case when coalesce(v_att.extra_fee, 0) > 0 then '["fee"]'::jsonb else '[]'::jsonb end)
      ),
      '/parent/attendance',
      'normal'
    );
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
end;
$$;

-- -----------------------------------------------------------------------------------------------
-- Who may call what: the course pages call the three RPCs; everything else runs inside them, the
-- attendance functions or the schedule.
revoke execute on function public.course_session_range(public.courses, date) from public, anon, authenticated;
revoke execute on function public.course_runs_on(public.courses, date) from public, anon, authenticated;
revoke execute on function public.child_course_sessions(uuid, date) from public, anon, authenticated;
revoke execute on function public.child_course_minutes(uuid, date, timestamptz, timestamptz, boolean) from public, anon, authenticated;
revoke execute on function public.attendance_course_minutes(public.attendance_records, public.nursery_settings, timestamptz, boolean) from public, anon, authenticated;
revoke execute on function public.attendance_rebill_late_charge(uuid) from public, anon, authenticated;
revoke execute on function public.course_can_manage_sessions(uuid) from public, anon, authenticated;
revoke execute on function public.course_session_window(public.courses) from public, anon, authenticated;
revoke execute on function public.course_session_rebill(uuid, date) from public, anon, authenticated;
revoke execute on function public.run_course_cancellation_notices() from public, anon, authenticated;
grant execute on function public.course_session_range(public.courses, date) to service_role;
grant execute on function public.course_runs_on(public.courses, date) to service_role;
grant execute on function public.child_course_sessions(uuid, date) to service_role;
grant execute on function public.child_course_minutes(uuid, date, timestamptz, timestamptz, boolean) to service_role;
grant execute on function public.attendance_course_minutes(public.attendance_records, public.nursery_settings, timestamptz, boolean) to service_role;
grant execute on function public.attendance_rebill_late_charge(uuid) to service_role;
grant execute on function public.course_can_manage_sessions(uuid) to service_role;
grant execute on function public.course_session_window(public.courses) to service_role;
grant execute on function public.course_session_rebill(uuid, date) to service_role;
grant execute on function public.run_course_cancellation_notices() to service_role;

revoke execute on function public.get_course_sessions(uuid, date, date) from public, anon;
revoke execute on function public.cancel_course_session(uuid, date, text) from public, anon;
revoke execute on function public.restore_course_session(uuid, date) from public, anon;
grant execute on function public.get_course_sessions(uuid, date, date) to authenticated, service_role;
grant execute on function public.cancel_course_session(uuid, date, text) to authenticated, service_role;
grant execute on function public.restore_course_session(uuid, date) to authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'course-cancellation-notices';
    perform cron.schedule('course-cancellation-notices', '*/15 * * * *', 'select public.run_course_cancellation_notices()');
  end if;
end;
$$;

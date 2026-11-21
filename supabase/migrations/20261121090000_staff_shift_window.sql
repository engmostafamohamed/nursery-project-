-- Clocking in and out belongs to the shift a member of staff actually works.
--
-- Three things were wrong with the day a member of staff records.
--
-- Lateness was measured against the nursery's opening time for everybody, while each person's own
-- shift already sat in staff_schedules and was never read. Nobody is bitten today because every
-- shift on file happens to match the nursery's hours, but the first person put on a later shift
-- would have been marked hours late every morning.
--
-- Clocking had no window at all: the button worked at three in the morning and again at midnight.
--
-- And a day whose owner forgot to clock out stayed open for ever, so the hours were never counted
-- and the next morning's clock-in was refused.
--
-- A shift now comes from the person's own schedule, falling back to the nursery's hours when they
-- have none. Two settings say how wide the window around it is. A day left open is closed at the
-- shift's end and marked for review, the way a child's day already is, so the hours are counted
-- without the record claiming a departure time nobody saw. And a departure only needs the
-- manager's word when it differs from the shift — leaving early, leaving unrecorded, or staying on.

-- 1 · How wide the window around a shift is. One policy for the nursery; the shift itself is each
--     person's own.
alter table public.nursery_settings
  add column if not exists clock_in_opens_minutes_before integer not null default 60,
  add column if not exists clock_out_closes_minutes_after integer not null default 120,
  -- Leaving within this many minutes of the shift's end needs nobody's approval.
  add column if not exists clock_out_grace_minutes integer not null default 15;

alter table public.nursery_settings
  drop constraint if exists nursery_settings_clock_window_ck;
alter table public.nursery_settings
  add constraint nursery_settings_clock_window_ck check (
    clock_in_opens_minutes_before between 0 and 600
    and clock_out_closes_minutes_after between 0 and 600
    and clock_out_grace_minutes between 0 and 240
  );

-- 2 · The shift a member of staff works on a day: their own if they have one, the nursery's hours
--     otherwise. Returns nothing when the day is not one they work.
create or replace function public.staff_shift_on(p_user_id uuid, p_day date)
returns table(starts_at time, ends_at time, from_schedule boolean)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with own as (
    select sch.start_time, sch.end_time
      from public.staff_schedules sch
      join public.staff_profiles sp on sp.id = sch.staff_id
     where sp.user_id = p_user_id
       and sch.day_of_week = extract(dow from p_day)::int
       and sch.is_working_day
       and sch.start_time is not null
     limit 1
  ),
  -- The nursery's own opening hours, which is what lateness was always measured against. Not
  -- nursery_settings.standard_start_time: that is the children's day, the one late pickup is
  -- charged from, and it is nobody's shift.
  house as (
    select n.opens_at as start_time, n.closes_at as end_time
      from public.users u
      join public.nurseries n on n.id = u.nursery_id
     where u.id = p_user_id
  )
  select o.start_time, o.end_time, true from own o
  union all
  select h.start_time, h.end_time, false from house h where not exists (select 1 from own)
$function$;

-- 3 · Lateness against the person's own shift, not the nursery's door. Whose day it is has to be
--     said: the admin recording somebody else's morning must not have it measured against her own
--     shift, which is what reading auth.uid() here would have done.
drop function if exists public.staff_late_minutes(uuid, date, timestamptz);
create or replace function public.staff_late_minutes(p_user_id uuid, p_nursery_id uuid, p_day date, p_at timestamptz)
returns integer
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_start time;
  v_tz text;
begin
  if p_at is null or p_user_id is null then
    return null;
  end if;
  select s.starts_at into v_start from public.staff_shift_on(p_user_id, p_day) s;
  if v_start is null then
    select n.opens_at into v_start from public.nurseries n where n.id = p_nursery_id;
  end if;
  if v_start is null then
    return null;
  end if;
  v_tz := coalesce((select s.timezone from public.nursery_settings s where s.nursery_id = p_nursery_id), 'Africa/Cairo');
  return greatest(0, floor(extract(epoch from (p_at - ((p_day + v_start) at time zone v_tz))) / 60)::integer);
end;
$function$;

-- Nobody calls it from the app: it is only ever asked inside the functions that write a day.
revoke execute on function public.staff_late_minutes(uuid, uuid, date, timestamptz) from public, anon, authenticated;

-- 4 · A day may need the manager's word before it counts, and may have been closed for its owner.
alter table public.staff_attendance
  add column if not exists needs_review boolean not null default false,
  add column if not exists review_reason text,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references public.users(id) on delete set null;

create index if not exists staff_attendance_needs_review
  on public.staff_attendance (nursery_id, work_date desc) where needs_review;

/*
 * Clocking in or out, within the window around the person's own shift.
 *   'in'  opens clock_in_opens_minutes_before the shift starts and closes at its end.
 *   'out' is refused before the shift starts, and a departure that is early, or long after the
 *         shift ended, is recorded and left for the manager rather than silently counted.
 */
create or replace function public.clock_staff(p_action text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user public.users%rowtype;
  v_today date;
  v_now timestamptz := now();
  v_row public.staff_attendance%rowtype;
  v_tz text;
  v_shift record;
  v_opens_before integer;
  v_closes_after integer;
  v_grace integer;
  v_shift_start timestamptz;
  v_shift_end timestamptz;
  v_window_opens timestamptz;
  v_window_closes timestamptz;
  v_late integer;
  v_early boolean;
begin
  select * into v_user from public.users where id = auth.uid();
  if v_user.id is null or v_user.role not in ('teacher', 'manager', 'branch_admin') or v_user.nursery_id is null then
    raise exception 'staff_clock_forbidden' using errcode = '42501';
  end if;
  if coalesce(p_action, '') not in ('in', 'out') then
    raise exception 'staff_clock_invalid' using errcode = '22023';
  end if;

  v_today := public.nursery_today(v_user.nursery_id);
  v_tz := coalesce((select s.timezone from public.nursery_settings s where s.nursery_id = v_user.nursery_id), 'Africa/Cairo');
  select * into v_shift from public.staff_shift_on(v_user.id, v_today);
  select s.clock_in_opens_minutes_before, s.clock_out_closes_minutes_after, s.clock_out_grace_minutes
    into v_opens_before, v_closes_after, v_grace
    from public.nursery_settings s where s.nursery_id = v_user.nursery_id;
  -- A nursery with no settings row still clocks, on the defaults.
  v_opens_before := coalesce(v_opens_before, 60);
  v_closes_after := coalesce(v_closes_after, 120);
  v_grace := coalesce(v_grace, 15);

  if v_shift.starts_at is null then
    raise exception 'staff_clock_no_shift' using errcode = '22023';
  end if;

  v_shift_start := (v_today + v_shift.starts_at) at time zone v_tz;
  v_shift_end := (v_today + coalesce(v_shift.ends_at, v_shift.starts_at)) at time zone v_tz;
  v_window_opens := v_shift_start - make_interval(mins => v_opens_before);
  v_window_closes := v_shift_end + make_interval(mins => v_closes_after);

  select * into v_row from public.staff_attendance
   where user_id = v_user.id and work_date = v_today;

  if p_action = 'in' then
    if coalesce(v_row.check_in_at, v_row.clock_in) is not null then
      raise exception 'staff_clock_already_in' using errcode = 'P0001';
    end if;
    -- Too early for the shift, or after it has ended: the manager records those by hand.
    if v_now < v_window_opens then
      raise exception 'staff_clock_too_early' using errcode = 'P0001';
    end if;
    if v_now > v_shift_end then
      raise exception 'staff_clock_shift_over' using errcode = 'P0001';
    end if;

    v_late := public.staff_late_minutes(v_user.id, v_user.nursery_id, v_today, v_now);
    insert into public.staff_attendance (user_id, nursery_id, work_date, clock_in, check_in_at, status, late_minutes, source, check_in_by)
    values (v_user.id, v_user.nursery_id, v_today, v_now, v_now,
            case when v_late > 5 then 'late' else 'present' end, v_late, 'self', v_user.id)
    on conflict (user_id, work_date) do update
      set clock_in = excluded.clock_in, check_in_at = excluded.check_in_at, status = excluded.status,
          late_minutes = excluded.late_minutes, source = excluded.source, check_in_by = excluded.check_in_by,
          updated_at = now();
  else
    if coalesce(v_row.check_in_at, v_row.clock_in) is null then
      raise exception 'staff_clock_not_in' using errcode = 'P0001';
    end if;
    if coalesce(v_row.check_out_at, v_row.clock_out) is not null then
      raise exception 'staff_clock_already_out' using errcode = 'P0001';
    end if;
    if v_now < v_shift_start then
      raise exception 'staff_clock_too_early' using errcode = 'P0001';
    end if;

    -- Leaving before the shift ends (beyond the grace), or long after it, is the manager's to settle.
    v_early := v_now < v_shift_end - make_interval(mins => v_grace);
    update public.staff_attendance
       set clock_out = v_now, check_out_at = v_now, check_out_by = v_user.id,
           work_hours = round(extract(epoch from (v_now - coalesce(check_in_at, clock_in))) / 3600.0, 2),
           needs_review = (v_early or v_now > v_window_closes),
           review_reason = case when v_early then 'left_early' when v_now > v_window_closes then 'late_departure' end,
           updated_at = now()
     where user_id = v_user.id and work_date = v_today;
  end if;

  return public.get_my_staff_day();
end;
$function$;

/*
 * Closes the days whose owner forgot. Run after the nursery's day is over: a day with an arrival
 * and no departure is closed at the end of that person's shift and marked for review, so the hours
 * are counted while the record is honest that nobody saw them leave.
 */
create or replace function public.close_forgotten_staff_days(p_nursery_id uuid, p_day date default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_day date := coalesce(p_day, public.nursery_today(p_nursery_id));
  v_tz text := coalesce((select s.timezone from public.nursery_settings s where s.nursery_id = p_nursery_id), 'Africa/Cairo');
  -- While somebody can still clock out for themselves, the day is theirs to close.
  v_closes_after integer := coalesce((select s.clock_out_closes_minutes_after from public.nursery_settings s where s.nursery_id = p_nursery_id), 120);
  v_closed integer := 0;
begin
  with open_days as (
    select sa.id, sa.user_id, coalesce(sa.check_in_at, sa.clock_in) as came,
           (v_day + coalesce(sh.ends_at, sh.starts_at)) at time zone v_tz as shift_end
      from public.staff_attendance sa
      cross join lateral public.staff_shift_on(sa.user_id, v_day) sh
     where sa.nursery_id = p_nursery_id
       and sa.work_date = v_day
       and coalesce(sa.check_in_at, sa.clock_in) is not null
       and coalesce(sa.check_out_at, sa.clock_out) is null
  )
  update public.staff_attendance sa
     set check_out_at = o.shift_end,
         clock_out = o.shift_end,
         work_hours = greatest(0, round(extract(epoch from (o.shift_end - o.came)) / 3600.0, 2)),
         needs_review = true,
         review_reason = 'no_departure',
         updated_at = now()
    from open_days o
   where sa.id = o.id
     and o.shift_end > o.came
     and now() > o.shift_end + make_interval(mins => v_closes_after);
  get diagnostics v_closed = row_count;
  return v_closed;
end;
$function$;

revoke all on function public.close_forgotten_staff_days(uuid, date) from public, anon;
revoke all on function public.staff_shift_on(uuid, date) from public, anon;
grant execute on function public.staff_shift_on(uuid, date) to authenticated;

/*
 * The manager settles a day that was left for review: the times as they really were, in the
 * nursery's clock, and the day then counts. Leaving a time out keeps the one on record. Only the
 * people who may manage the nursery's attendance may call it.
 */
drop function if exists public.approve_staff_day(uuid, timestamptz, timestamptz);
create or replace function public.approve_staff_day(
  p_attendance_id uuid,
  p_check_in time default null,
  p_check_out time default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row public.staff_attendance%rowtype;
  v_tz text;
  v_in timestamptz;
  v_out timestamptz;
  v_late integer;
begin
  select * into v_row from public.staff_attendance where id = p_attendance_id;
  if v_row.id is null then
    raise exception 'staff_clock_not_found' using errcode = 'P0002';
  end if;
  if not public.staff_attendance_can_manage(v_row.nursery_id) then
    raise exception 'staff_clock_forbidden' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_note, ''))) > 200 then
    raise exception 'staff_clock_invalid' using errcode = '22023';
  end if;

  v_tz := coalesce((select s.timezone from public.nursery_settings s where s.nursery_id = v_row.nursery_id), 'Africa/Cairo');
  v_in := case when p_check_in is null then coalesce(v_row.check_in_at, v_row.clock_in)
               else (v_row.work_date + p_check_in) at time zone v_tz end;
  v_out := case when p_check_out is null then coalesce(v_row.check_out_at, v_row.clock_out)
                else (v_row.work_date + p_check_out) at time zone v_tz end;
  if v_in is null or v_out is null or v_out <= v_in or v_out > now() then
    raise exception 'staff_clock_invalid_times' using errcode = '22023';
  end if;
  v_late := public.staff_late_minutes(v_row.user_id, v_row.nursery_id, v_row.work_date, v_in);

  update public.staff_attendance
     set check_in_at = v_in, clock_in = v_in,
         check_out_at = v_out, clock_out = v_out,
         late_minutes = v_late,
         status = case when v_late > 5 then 'late' else 'present' end,
         work_hours = round(extract(epoch from (v_out - v_in)) / 3600.0, 2),
         needs_review = false,
         approved_at = now(),
         approved_by = auth.uid(),
         notes = coalesce(nullif(btrim(coalesce(p_note, '')), ''), notes),
         updated_at = now()
   where id = p_attendance_id;

  return public.staff_attendance_json((select sa from public.staff_attendance sa where sa.id = p_attendance_id));
end;
$function$;

revoke all on function public.approve_staff_day(uuid, time, time, text) from public, anon;
grant execute on function public.approve_staff_day(uuid, time, time, text) to authenticated;

/*
 * The days waiting for the manager's word, newest first, with the name of whose day it is.
 */
create or replace function public.get_staff_days_to_review(p_nursery_id uuid, p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not public.staff_attendance_can_manage(p_nursery_id) then
    raise exception 'staff_clock_forbidden' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(line order by line ->> 'work_date' desc) from (
      select jsonb_build_object(
        'id', sa.id,
        'work_date', sa.work_date,
        'reason', sa.review_reason,
        'check_in_at', coalesce(sa.check_in_at, sa.clock_in),
        'check_out_at', coalesce(sa.check_out_at, sa.clock_out),
        'late_minutes', coalesce(sa.late_minutes, 0),
        'who', jsonb_build_object('id', u.id, 'ar', u.name_ar, 'en', u.name_en)
      ) line
        from public.staff_attendance sa
        join public.users u on u.id = sa.user_id
       where sa.nursery_id = p_nursery_id and sa.needs_review
       order by sa.work_date desc
       limit least(greatest(coalesce(p_limit, 50), 1), 200)
    ) d
  ), '[]'::jsonb);
end;
$function$;

revoke all on function public.get_staff_days_to_review(uuid, integer) from public, anon;
grant execute on function public.get_staff_days_to_review(uuid, integer) to authenticated;

/*
 * 8 · A day now carries whether it waits for the manager, so every screen that already reads one —
 *     the class page's team, a member of staff's own card, the month — says so without asking again.
 */
create or replace function public.staff_attendance_json(p_row public.staff_attendance)
returns jsonb
language sql
stable
as $function$
  select case when p_row.id is null then null else jsonb_build_object(
    'id', p_row.id, 'work_date', p_row.work_date,
    'check_in_at', coalesce(p_row.check_in_at, p_row.clock_in), 'check_out_at', coalesce(p_row.check_out_at, p_row.clock_out),
    'status', p_row.status, 'late_minutes', p_row.late_minutes, 'work_hours', p_row.work_hours,
    'source', p_row.source, 'notes', p_row.notes,
    'needs_review', p_row.needs_review, 'review_reason', p_row.review_reason,
    'approved_at', p_row.approved_at) end
$function$;

/*
 * 9 · A member of staff's own day, with the shift it belongs to and the window around it. The
 *     screen shows the hour clocking opens and why the button is quiet; the rule itself stays here,
 *     the same one clock_staff enforces, so the two can never disagree.
 */
create or replace function public.get_my_staff_day()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_user public.users%rowtype;
  v_nursery public.nurseries%rowtype;
  v_today date;
  v_row public.staff_attendance%rowtype;
  v_tz text;
  v_shift record;
  v_opens_before integer;
  v_closes_after integer;
  v_grace integer;
  v_now timestamptz := now();
  v_shift_start timestamptz;
  v_shift_end timestamptz;
  v_window_opens timestamptz;
begin
  select * into v_user from public.users where id = auth.uid();
  if v_user.id is null or v_user.role not in ('teacher', 'manager', 'branch_admin') or v_user.nursery_id is null then
    raise exception 'staff_clock_forbidden' using errcode = '42501';
  end if;
  select * into v_nursery from public.nurseries where id = v_user.nursery_id;
  v_today := public.nursery_today(v_nursery.id);
  select * into v_row from public.staff_attendance where user_id = v_user.id and work_date = v_today;
  select s.timezone, s.clock_in_opens_minutes_before, s.clock_out_closes_minutes_after, s.clock_out_grace_minutes
    into v_tz, v_opens_before, v_closes_after, v_grace
    from public.nursery_settings s where s.nursery_id = v_nursery.id;
  v_tz := coalesce(v_tz, 'Africa/Cairo');
  v_opens_before := coalesce(v_opens_before, 60);
  v_closes_after := coalesce(v_closes_after, 120);
  v_grace := coalesce(v_grace, 15);
  select * into v_shift from public.staff_shift_on(v_user.id, v_today);
  if v_shift.starts_at is not null then
    v_shift_start := (v_today + v_shift.starts_at) at time zone v_tz;
    v_shift_end := (v_today + coalesce(v_shift.ends_at, v_shift.starts_at)) at time zone v_tz;
    v_window_opens := v_shift_start - make_interval(mins => v_opens_before);
  end if;

  return jsonb_build_object(
    'today', v_today,
    'school_day', public.attendance_is_school_day(v_nursery.id, v_today),
    'opens_at', v_nursery.opens_at,
    'closes_at', v_nursery.closes_at,
    'timezone', v_tz,
    'day', public.staff_attendance_json(v_row),
    'shift', case when v_shift.starts_at is null then null else jsonb_build_object(
      'starts_at', v_shift.starts_at,
      'ends_at', v_shift.ends_at,
      'mine', v_shift.from_schedule,
      'window_opens_at', v_window_opens,
      'window_closes_at', v_shift_end + make_interval(mins => v_closes_after),
      -- What clocking in would do right now, which is what the button may say: 'open', or why not.
      'arrival', case when v_now < v_window_opens then 'early'
                      when v_now > v_shift_end then 'over'
                      else 'open' end,
      -- Leaving now would be early, and the manager would have to settle it.
      'leaving_early', v_now < v_shift_end - make_interval(mins => v_grace)
    ) end,
    'absence', (select jsonb_build_object('reason', a.reason, 'starts_on', a.starts_on, 'ends_on', a.ends_on)
                  from public.staff_absences a
                 where a.user_id = v_user.id and a.cancelled_at is null and v_today between a.starts_on and a.ends_on
                 order by a.starts_on limit 1)
  );
end;
$function$;

/*
 * 10 · Recording somebody's day by hand, unchanged but for one thing: lateness is now measured
 *      against that person's own shift. It used to read the caller's, which was the admin's.
 */
create or replace function public.record_staff_attendance(
  p_user_id uuid, p_day date, p_check_in time, p_check_out time default null, p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  v_late := public.staff_late_minutes(v_person.id, v_person.nursery_id, p_day, v_in);

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
        -- A day the admin writes out in full is settled by that act; nothing is left waiting.
        needs_review = false, review_reason = null,
        staff_id = coalesce(public.staff_attendance.staff_id, excluded.staff_id), updated_at = now()
  returning * into v_row;
  return public.staff_attendance_json(v_row);
end;
$function$;

/*
 * 11 · The sweep that closes the days nobody closed. A day stays open only until an hour past the
 *      end of that person's shift; after that it is closed at the shift's end and left for the
 *      manager, so the hours are counted and the next morning's clock-in is not refused.
 *
 *      It runs every hour because shifts end at different hours, and it only ever touches a day
 *      whose shift is already over by that margin.
 */
create extension if not exists pg_cron;

create or replace function public.run_staff_day_close_sweep()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_closed integer := 0;
  v_nursery record;
begin
  for v_nursery in
    select n.id, coalesce(s.timezone, 'Africa/Cairo') as tz
      from public.nurseries n
      left join public.nursery_settings s on s.nursery_id = n.id
     where n.deleted_at is null
  loop
    -- Yesterday as well as today: a nursery whose evening shift ends late is swept after midnight.
    v_closed := v_closed
      + public.close_forgotten_staff_days(v_nursery.id, (now() at time zone v_nursery.tz)::date)
      + public.close_forgotten_staff_days(v_nursery.id, (now() at time zone v_nursery.tz)::date - 1);
  end loop;
  return v_closed;
end;
$function$;

revoke execute on function public.run_staff_day_close_sweep() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('staff-day-close-sweep');
exception when others then null;
end $$;

select cron.schedule('staff-day-close-sweep', '20 * * * *',
  $$select public.run_staff_day_close_sweep()$$);

-- Database test · clocking in and out around the shift a member of staff actually works.
--
-- A shift comes from the person's own schedule and falls back to the nursery's hours. Lateness is
-- measured against that shift, not the nursery's door — so somebody on a later shift arriving on
-- time is not late. Clocking in is refused before the window opens and after the shift is over.
-- Leaving early is recorded and left for the manager. A day left open is closed at the shift's end
-- and marked for review, and the manager settles it.
--
-- clock_staff reads the real clock, so the nursery here is given whichever timezone puts its own
-- midday at this moment. The shifts are then plain times — and the test says the same thing at
-- three in the morning as it does at noon. Rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(28);

-- The timezone in which it is now midday: an hour's offset either side of UTC, never a summer-time
-- one, so the nursery's day is the same date the session is on.
create function pg_temp.noon_tz() returns text language sql stable as $$
  select case
    when h = 12 then 'UTC'
    when h < 12 then 'Etc/GMT-' || (12 - h)::text
    else 'Etc/GMT+' || (h - 12)::text
  end
  from (select extract(hour from now() at time zone 'UTC')::int as h) t
$$;
create function pg_temp.today() returns date language sql stable as $$
  select public.nursery_today('00000000-0000-4000-9f18-00000000000a')
$$;
-- A time of day at the nursery, as the moment it is.
create function pg_temp.at(p_time time) returns timestamptz language sql stable as $$
  select (pg_temp.today() + p_time) at time zone pg_temp.noon_tz()
$$;

create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end;
$$;
create function pg_temp.day_of(p_user uuid) returns public.staff_attendance language sql as $$
  select sa from public.staff_attendance sa
   where sa.user_id = p_user and sa.work_date = pg_temp.today()
$$;

insert into public.nurseries (id, name_ar, name_en, opens_at, closes_at) values
  ('00000000-0000-4000-9f18-00000000000a', 'حضانة', 'Shift Nursery', '08:00', '17:00');
update public.nursery_settings
   set timezone = pg_temp.noon_tz(), standard_start_time = '08:00', standard_end_time = '17:00',
       clock_in_opens_minutes_before = 60, clock_out_closes_minutes_after = 120, clock_out_grace_minutes = 15
 where nursery_id = '00000000-0000-4000-9f18-00000000000a';

insert into auth.users (id, email) values
  ('00000000-0000-4000-9f18-000000000a01', 'sw.admin@test.local'),
  ('00000000-0000-4000-9f18-000000000a02', 'sw.house@test.local'),
  ('00000000-0000-4000-9f18-000000000a03', 'sw.later@test.local'),
  ('00000000-0000-4000-9f18-000000000a04', 'sw.onduty@test.local'),
  ('00000000-0000-4000-9f18-000000000a05', 'sw.done@test.local'),
  ('00000000-0000-4000-9f18-000000000a06', 'sw.forgot@test.local'),
  ('00000000-0000-4000-9f18-000000000a07', 'sw.onshift@test.local');
update public.users u
   set role = v.role::public.user_role, nursery_id = '00000000-0000-4000-9f18-00000000000a',
       name_en = v.name_en, name_ar = v.name_en, status = 'active'
  from (values
    ('00000000-0000-4000-9f18-000000000a01', 'branch_admin', 'Admin'),
    ('00000000-0000-4000-9f18-000000000a02', 'teacher', 'Sara'),
    ('00000000-0000-4000-9f18-000000000a03', 'teacher', 'Hoda'),
    ('00000000-0000-4000-9f18-000000000a04', 'teacher', 'Nour'),
    ('00000000-0000-4000-9f18-000000000a05', 'teacher', 'Mona'),
    ('00000000-0000-4000-9f18-000000000a06', 'teacher', 'Dalia'),
    ('00000000-0000-4000-9f18-000000000a07', 'teacher', 'Salma')
  ) as v(id, role, name_en)
 where u.id = v.id::uuid;

-- Sara has no schedule and keeps the nursery's hours. The others have shifts of their own: Hoda and
-- Nour are on a ten-to-seven that is running now, Mona and Dalia on a morning that is already over.
insert into public.staff_profiles (id, user_id, nursery_id, employee_id, department, position, hire_date, contract_type)
select ('00000000-0000-4000-9f18-0000000000f' || v.n)::uuid, v.user_id::uuid,
       '00000000-0000-4000-9f18-00000000000a', 'SW-00' || v.n, 'teaching', 'Co-teacher', current_date - 100, 'full_time'
  from (values
    ('3', '00000000-0000-4000-9f18-000000000a03'),
    ('4', '00000000-0000-4000-9f18-000000000a04'),
    ('5', '00000000-0000-4000-9f18-000000000a05'),
    ('6', '00000000-0000-4000-9f18-000000000a06'),
    ('7', '00000000-0000-4000-9f18-000000000a07')
  ) as v(n, user_id);
insert into public.staff_schedules (staff_id, nursery_id, day_of_week, start_time, end_time, is_working_day)
select v.staff_id::uuid, '00000000-0000-4000-9f18-00000000000a', d, v.starts::time, v.ends::time, true
  from (values
    ('00000000-0000-4000-9f18-0000000000f3', '10:00', '19:00'),
    ('00000000-0000-4000-9f18-0000000000f4', '10:00', '19:00'),
    ('00000000-0000-4000-9f18-0000000000f5', '06:00', '09:00'),
    ('00000000-0000-4000-9f18-0000000000f6', '06:00', '09:00'),
    ('00000000-0000-4000-9f18-0000000000f7', '10:00', '19:00')
  ) as v(staff_id, starts, ends), generate_series(0, 6) d;
-- Dalia arrived at six this morning and nobody ever saw her leave. Salma arrived at ten and is
-- still at work: her shift has hours to run, so her day is hers to close.
insert into public.staff_attendance (user_id, nursery_id, work_date, clock_in, check_in_at, status, source)
values ('00000000-0000-4000-9f18-000000000a06', '00000000-0000-4000-9f18-00000000000a',
        pg_temp.today(), pg_temp.at('06:00'), pg_temp.at('06:00'), 'present', 'self'),
       ('00000000-0000-4000-9f18-000000000a07', '00000000-0000-4000-9f18-00000000000a',
        pg_temp.today(), pg_temp.at('10:00'), pg_temp.at('10:00'), 'present', 'self');

-- 1-3 · whose shift is whose.
select is((select starts_at::text from public.staff_shift_on('00000000-0000-4000-9f18-000000000a02', pg_temp.today())),
          '08:00:00', 'someone with no schedule keeps the nursery''s hours');
select is((select starts_at::text from public.staff_shift_on('00000000-0000-4000-9f18-000000000a03', pg_temp.today())),
          '10:00:00', 'someone with a shift of their own keeps it');
select is((select from_schedule from public.staff_shift_on('00000000-0000-4000-9f18-000000000a03', pg_temp.today())),
          true, 'and the shift is known to be their own');

-- 4-6 · lateness follows the person's own shift, which is the fault being fixed: the same clock
--       time is on time for one of them and two hours late for the other.
select is(public.staff_late_minutes('00000000-0000-4000-9f18-000000000a03', '00000000-0000-4000-9f18-00000000000a', pg_temp.today(), pg_temp.at('10:00')),
          0, 'arriving at her own shift''s start is not late');
select is(public.staff_late_minutes('00000000-0000-4000-9f18-000000000a03', '00000000-0000-4000-9f18-00000000000a', pg_temp.today(), pg_temp.at('10:20')),
          20, 'and twenty minutes after it is twenty minutes late');
select is(public.staff_late_minutes('00000000-0000-4000-9f18-000000000a02', '00000000-0000-4000-9f18-00000000000a', pg_temp.today(), pg_temp.at('10:00')),
          120, 'someone on the nursery''s own hours arriving at ten is two hours late');

-- 7-9 · the window, for the teacher whose shift is running right now.
select pg_temp.act_as('00000000-0000-4000-9f18-000000000a04');
select throws_ok($$ select public.clock_staff('out') $$, 'P0001', 'staff_clock_not_in',
                 'leaving before arriving is refused');
select lives_ok($$ select public.clock_staff('in') $$, 'she clocks in inside the window');
select throws_ok($$ select public.clock_staff('in') $$, 'P0001', 'staff_clock_already_in',
                 'and cannot clock in twice');

-- 10-12 · leaving hours before the shift ends is recorded and left for the manager.
select lives_ok($$ select public.clock_staff('out') $$, 'she clocks out');
select is((pg_temp.day_of('00000000-0000-4000-9f18-000000000a04')).needs_review, true,
          'leaving well before the shift ends waits for the manager');
select is((pg_temp.day_of('00000000-0000-4000-9f18-000000000a04')).review_reason, 'left_early',
          'and the reason says why');

-- 13 · a teacher whose morning is already over cannot clock in at all.
select pg_temp.act_as('00000000-0000-4000-9f18-000000000a05');
select throws_ok($$ select public.clock_staff('in') $$, 'P0001', 'staff_clock_shift_over',
                 'arriving after the shift has ended is refused');

-- 14-15 · the day left open is closed at that person's shift end and marked, not left hanging.
reset role;
select is(public.close_forgotten_staff_days('00000000-0000-4000-9f18-00000000000a'), 1,
          'the one day left open is closed');
select is((pg_temp.day_of('00000000-0000-4000-9f18-000000000a06')).review_reason, 'no_departure',
          'and says nobody saw her leave');
select is((pg_temp.day_of('00000000-0000-4000-9f18-000000000a07')).check_out_at, null,
          'somebody still inside her shift is left alone to clock out herself');
select is(public.run_staff_day_close_sweep(), 0,
          'and the sweep finds nothing left to close');

-- 16-18 · the manager settles them.
select pg_temp.act_as('00000000-0000-4000-9f18-000000000a01');
select is(jsonb_array_length(public.get_staff_days_to_review('00000000-0000-4000-9f18-00000000000a')), 2,
          'both days wait for the manager');
select lives_ok(
  $$ select public.approve_staff_day(
       (select id from public.staff_attendance
         where user_id = '00000000-0000-4000-9f18-000000000a06' and work_date = pg_temp.today()),
       null, '08:30') $$,
  'the manager settles the times as they really were');
select is((pg_temp.day_of('00000000-0000-4000-9f18-000000000a06')).needs_review, false,
          'and the day stops waiting');

-- 19-23 · what a member of staff's own card is told: the shift it belongs to, whose it is, whether
--         the button may be pressed, and that her day is waiting for the manager.
select pg_temp.act_as('00000000-0000-4000-9f18-000000000a04');
select is(public.get_my_staff_day() -> 'shift' ->> 'starts_at', '10:00:00', 'her card knows the shift it belongs to');
select is(public.get_my_staff_day() -> 'shift' ->> 'mine', 'true', 'and that the shift is her own');
select is(public.get_my_staff_day() -> 'shift' ->> 'arrival', 'open', 'and that clocking in was open to her');
select is(public.get_my_staff_day() -> 'day' ->> 'needs_review', 'true', 'and that the day she just closed waits for the manager');
select pg_temp.act_as('00000000-0000-4000-9f18-000000000a05');
select is(public.get_my_staff_day() -> 'shift' ->> 'arrival', 'over', 'somebody whose shift has ended is told so instead of a dead button');

-- 24-26 · the admin writing somebody else's morning by hand. Her own shift must have nothing to do
--         with it: Hoda is on a ten o'clock shift, and ten o'clock is when Hoda is on time.
select pg_temp.act_as('00000000-0000-4000-9f18-000000000a01');
select lives_ok($$ select public.record_staff_attendance('00000000-0000-4000-9f18-000000000a03', pg_temp.today(), '10:00', '11:00') $$,
                'the admin records a day that was never clocked');
select is((pg_temp.day_of('00000000-0000-4000-9f18-000000000a03')).late_minutes, 0,
          'and it is read against that person''s shift, not the admin''s');
select is((pg_temp.day_of('00000000-0000-4000-9f18-000000000a03')).needs_review, false,
          'a day written out in full leaves nothing waiting');

select * from finish();
rollback;

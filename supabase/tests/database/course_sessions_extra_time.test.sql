-- Database test · courses during extra hours. Closing time 14:00, extra time billed by the quarter
-- hour from closing at 60 EGP an hour. Art runs 14:30–15:30 and Drama 15:00–16:00 every day.
-- A child's courses cover the time from closing until their last course ends (the wait before a
-- course included); only the time after it is extra. A cancelled session covers nothing: the day is
-- billed again, the families of a session still to come are told at once (and told again if it is
-- back on), and after the nursery's end of the day the parents of a child whose extra time grew get
-- one notice with the reason. Only the nursery's admins and the course's teacher manage sessions.
-- The days tested are yesterday, today and tomorrow. Rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(32);

-- Yesterday in the nursery's time zone, and a moment of a day there.
create function pg_temp.d() returns date language sql as $$ select (now() at time zone 'Africa/Cairo')::date - 1 $$;
create function pg_temp.at(p_day date, p_time time) returns timestamptz language sql as $$ select (p_day + p_time) at time zone 'Africa/Cairo' $$;
-- The day's charge as "(extra hours,fee)".
create function pg_temp.charge(p_attendance uuid) returns text language sql as $$
  select (coalesce(extra_hours, 0)::numeric(6,2), coalesce(extra_fee, 0)::numeric(8,2))::text from public.attendance_records where id = p_attendance
$$;
-- The day's charge and its extra-hours invoice.
create function pg_temp.billed(p_attendance uuid) returns text language sql as $$
  select pg_temp.charge(p_attendance) || ' ' || coalesce((select i.amount::numeric(8,2)::text from public.invoices i where i.id = a.late_charge_invoice_id), 'no invoice')
    from public.attendance_records a where a.id = p_attendance
$$;
-- What the calculation gives for a day as of its checkout: "(late minutes,hours)".
create function pg_temp.calc(p_attendance uuid) returns text language sql as $$
  select (c.late_minutes, c.target_hours::numeric(6,2))::text
    from public.attendance_records a
    join public.children ch on ch.id = a.child_id
    join public.nursery_settings ns on ns.nursery_id = ch.nursery_id
   cross join lateral public.attendance_compute_extra_time(a, ns, a.check_out) c
   where a.id = p_attendance
$$;
-- The notices of a template for a day, as "count | course | reason".
create function pg_temp.notices(p_template text, p_day date) returns text language sql as $$
  select format('%s | %s | %s', count(*), min(n.template_params -> 'course' ->> 'en'), coalesce(min(n.template_params ->> 'reason'), '-'))
    from public.notifications n
   where n.template_key = p_template and n.nursery_id = '00000000-0000-4000-9400-00000000000a' and n.template_params ->> 'date' = p_day::text
$$;
create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end;
$$;

insert into public.nurseries (id, name_ar, name_en) values ('00000000-0000-4000-9400-00000000000a', 'حضانة الكورسات', 'Courses Nursery');
update public.nursery_settings
   set standard_start_time = '08:00', standard_end_time = '14:00', late_pickup_fee_per_hour = 60,
       late_pickup_grace_minutes = 0, late_billing_unit_minutes = 15, late_billing_from = 'end_time',
       late_billing_base = 'closing_time', early_arrival_billing_enabled = false, timezone = 'Africa/Cairo',
       end_of_day_checklist_time = '17:00', late_invoice_mode = 'daily'
 where nursery_id = '00000000-0000-4000-9400-00000000000a';

insert into auth.users (id, email) values
  ('00000000-0000-4000-9400-000000000a01', 'courses.admin@test.local'),
  ('00000000-0000-4000-9400-000000000a02', 'courses.art@test.local'),
  ('00000000-0000-4000-9400-000000000a03', 'courses.drama@test.local'),
  ('00000000-0000-4000-9400-000000000a04', 'courses.mona@test.local'),
  ('00000000-0000-4000-9400-000000000a05', 'courses.karim@test.local');
update public.users u
   set role = v.role::public.user_role, nursery_id = '00000000-0000-4000-9400-00000000000a', name_en = v.name_en, name_ar = v.name_en, status = 'active'
  from (values
    ('00000000-0000-4000-9400-000000000a01', 'branch_admin', 'Admin'),
    ('00000000-0000-4000-9400-000000000a02', 'teacher', 'Art Teacher'),
    ('00000000-0000-4000-9400-000000000a03', 'teacher', 'Drama Teacher'),
    ('00000000-0000-4000-9400-000000000a04', 'parent', 'Mona'),
    ('00000000-0000-4000-9400-000000000a05', 'parent', 'Karim')
  ) as v(id, role, name_en)
 where u.id = v.id::uuid;

insert into public.children (id, nursery_id, full_name_ar, full_name_en, dob, status, enrollment_date) values
  ('00000000-0000-4000-9400-0000000000c1', '00000000-0000-4000-9400-00000000000a', 'ليلى', 'Laila', '2022-01-01', 'active', '2026-01-01'),
  ('00000000-0000-4000-9400-0000000000c2', '00000000-0000-4000-9400-00000000000a', 'عمر', 'Omar', '2022-01-01', 'active', '2026-01-01'),
  ('00000000-0000-4000-9400-0000000000c3', '00000000-0000-4000-9400-00000000000a', 'سارة', 'Sara', '2022-01-01', 'active', '2026-01-01'),
  ('00000000-0000-4000-9400-0000000000c4', '00000000-0000-4000-9400-00000000000a', 'نور', 'Nour', '2022-01-01', 'active', '2026-01-01'),
  ('00000000-0000-4000-9400-0000000000c5', '00000000-0000-4000-9400-00000000000a', 'يارا', 'Yara', '2022-01-01', 'active', '2026-01-01');
insert into public.parent_children (parent_id, child_id, is_primary) values
  ('00000000-0000-4000-9400-000000000a04', '00000000-0000-4000-9400-0000000000c1', true),
  ('00000000-0000-4000-9400-000000000a05', '00000000-0000-4000-9400-0000000000c2', true),
  ('00000000-0000-4000-9400-000000000a04', '00000000-0000-4000-9400-0000000000c3', true),
  ('00000000-0000-4000-9400-000000000a04', '00000000-0000-4000-9400-0000000000c4', true),
  ('00000000-0000-4000-9400-000000000a05', '00000000-0000-4000-9400-0000000000c5', true);

insert into public.courses (id, nursery_id, title_ar, title_en, schedule_days, schedule_time_start, schedule_time_end, status, teacher_user_id) values
  ('00000000-0000-4000-9400-0000000000e1', '00000000-0000-4000-9400-00000000000a', 'رسم', 'Art',
   array['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'], '14:30', '15:30', 'active', '00000000-0000-4000-9400-000000000a02'),
  ('00000000-0000-4000-9400-0000000000e2', '00000000-0000-4000-9400-00000000000a', 'مسرح', 'Drama',
   array['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'], '15:00', '16:00', 'active', '00000000-0000-4000-9400-000000000a03'),
  -- Music runs only on today's weekday, so not yesterday.
  ('00000000-0000-4000-9400-0000000000e3', '00000000-0000-4000-9400-00000000000a', 'موسيقى', 'Music',
   array[(array['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'])[extract(dow from pg_temp.d() + 1)::int + 1]], '14:30', '15:30', 'active', '00000000-0000-4000-9400-000000000a02'),
  ('00000000-0000-4000-9400-0000000000e4', '00000000-0000-4000-9400-00000000000a', 'تحفيظ', 'Quran',
   array['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'], '07:00', '07:45', 'active', null),
  ('00000000-0000-4000-9400-0000000000e5', '00000000-0000-4000-9400-00000000000a', 'سباحة', 'Swimming',
   array['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'], 'after lunch', '15:30', 'active', null);
insert into public.course_enrollments (course_id, child_id, status, enrolled_at) values
  ('00000000-0000-4000-9400-0000000000e1', '00000000-0000-4000-9400-0000000000c1', 'active', now() - interval '30 days'),
  ('00000000-0000-4000-9400-0000000000e2', '00000000-0000-4000-9400-0000000000c1', 'active', now() - interval '30 days'),
  ('00000000-0000-4000-9400-0000000000e1', '00000000-0000-4000-9400-0000000000c3', 'active', now() - interval '30 days'),
  ('00000000-0000-4000-9400-0000000000e1', '00000000-0000-4000-9400-0000000000c4', 'active', now() - interval '30 days'),
  ('00000000-0000-4000-9400-0000000000e2', '00000000-0000-4000-9400-0000000000c5', 'active', now() - interval '30 days');

-- Yesterday: Laila (Art and Drama) and Omar (no course) picked up at 16:15, Sara (Art) at 15:45,
-- Yara (Drama) at 14:40, still waiting for it. Today: Nour (Art) picked up at 16:15.
insert into public.attendance_records (id, child_id, attendance_date, check_in, check_out) values
  ('00000000-0000-4000-9400-0000000007a1', '00000000-0000-4000-9400-0000000000c1', pg_temp.d(), pg_temp.at(pg_temp.d(), '08:00'), pg_temp.at(pg_temp.d(), '16:15')),
  ('00000000-0000-4000-9400-0000000007a2', '00000000-0000-4000-9400-0000000000c2', pg_temp.d(), pg_temp.at(pg_temp.d(), '08:00'), pg_temp.at(pg_temp.d(), '16:15')),
  ('00000000-0000-4000-9400-0000000007a3', '00000000-0000-4000-9400-0000000000c3', pg_temp.d(), pg_temp.at(pg_temp.d(), '08:00'), pg_temp.at(pg_temp.d(), '15:45')),
  ('00000000-0000-4000-9400-0000000007a5', '00000000-0000-4000-9400-0000000000c5', pg_temp.d(), pg_temp.at(pg_temp.d(), '08:00'), pg_temp.at(pg_temp.d(), '14:40')),
  ('00000000-0000-4000-9400-0000000007a4', '00000000-0000-4000-9400-0000000000c4', pg_temp.d() + 1, pg_temp.at(pg_temp.d() + 1, '08:00'), pg_temp.at(pg_temp.d() + 1, '16:15'));

-- ---------------------------------------------------------------------------------------------
-- The courses and the wait before them are not extra time
select is(pg_temp.calc('00000000-0000-4000-9400-0000000007a2'), '(135,2.25)',
  'a child in no course: 14:00 to 16:15 is 2 h 15 of extra time');
select is(pg_temp.calc('00000000-0000-4000-9400-0000000007a1'), '(15,0.25)',
  'a child in Art and Drama: 14:00 until Drama ends at 16:00 is covered (the wait and both courses), so 15 minutes are extra');
select is(pg_temp.calc('00000000-0000-4000-9400-0000000007a5'), '(0,0.00)',
  'a child picked up at 14:40 while waiting for Drama pays nothing for the wait');
select is(
  (select public.course_runs_on(c, pg_temp.d())::text from public.courses c where c.id = '00000000-0000-4000-9400-0000000000e5'),
  'false',
  'a course whose time cannot be read has no sessions (nothing is covered by mistake)'
);

-- Each child picked up and billed.
select set_config('test.billed', (select string_agg(public.apply_attendance_late_charge(a.id, a.check_out, 'checkout', true)::text, ',')
  from public.attendance_records a where a.attendance_date = pg_temp.d() and a.child_id::text like '00000000-0000-4000-9400-%'), true);
select is(
  pg_temp.charge('00000000-0000-4000-9400-0000000007a1') || pg_temp.charge('00000000-0000-4000-9400-0000000007a2')
  || pg_temp.charge('00000000-0000-4000-9400-0000000007a3') || pg_temp.charge('00000000-0000-4000-9400-0000000007a5'),
  '(0.25,15.00)(2.25,135.00)(0.25,15.00)(0.00,0.00)',
  'at pickup: Laila 15 minutes, Omar 2 h 15, Sara the 15 minutes after Art, Yara nothing'
);

-- ---------------------------------------------------------------------------------------------
-- Who may cancel a session, and how
select pg_temp.act_as('00000000-0000-4000-9400-000000000a03');
select throws_ok(
  format($$ select public.cancel_course_session('00000000-0000-4000-9400-0000000000e1', %L, 'sick') $$, pg_temp.d()),
  '42501', 'course_forbidden', 'another course''s teacher cannot cancel an Art session'
);
select pg_temp.act_as('00000000-0000-4000-9400-000000000a04');
select throws_ok(
  format($$ select public.cancel_course_session('00000000-0000-4000-9400-0000000000e1', %L, 'sick') $$, pg_temp.d()),
  '42501', 'course_forbidden', 'nor a parent'
);
select throws_ok(
  format($$ select public.get_course_sessions('00000000-0000-4000-9400-0000000000e1', %L, %L) $$, pg_temp.d(), pg_temp.d()),
  '42501', 'course_forbidden', 'and a parent does not read the course''s session list'
);

select pg_temp.act_as('00000000-0000-4000-9400-000000000a01');
select throws_ok(
  format($$ select public.cancel_course_session('00000000-0000-4000-9400-0000000000e1', %L, '   ') $$, pg_temp.d()),
  '22023', 'course_session_reason_required', 'a cancellation needs a reason'
);
select throws_ok(
  format($$ select public.cancel_course_session('00000000-0000-4000-9400-0000000000e1', %L, repeat('x', 301)) $$, pg_temp.d()),
  '22023', 'course_session_reason_too_long', 'of at most 300 characters'
);
select throws_ok(
  format($$ select public.cancel_course_session('00000000-0000-4000-9400-0000000000e3', %L, 'sick') $$, pg_temp.d()),
  '22023', 'course_session_not_scheduled', 'only a day the course runs can be cancelled'
);
select throws_ok(
  format($$ select public.cancel_course_session('00000000-0000-4000-9400-0000000000e1', %L, 'sick') $$, pg_temp.d() - 8),
  '22023', 'course_session_out_of_window', 'and not more than a week back'
);

-- The Art teacher cancels yesterday's session after the fact.
select pg_temp.act_as('00000000-0000-4000-9400-000000000a02');
select is(
  (select format('%s / %s / %s', r ->> 'reason', r ->> 'rebilled', r ->> 'notified')
     from (select public.cancel_course_session('00000000-0000-4000-9400-0000000000e1', pg_temp.d(), '  The teacher is sick  ') r) x),
  'The teacher is sick / 2 / 0',
  'the course''s teacher cancels a past session with its reason: its two children who came are billed again; nobody is told at once'
);
reset role;
select is(pg_temp.billed('00000000-0000-4000-9400-0000000007a3'), '(1.75,105.00) 105.00',
  'Sara had no other course: 14:00 to 15:45 is extra time now, and her invoice grows with it');
select is(pg_temp.charge('00000000-0000-4000-9400-0000000007a1'), '(0.25,15.00)',
  'Laila pays the same: Drama still covers 14:00 to 16:00');

select pg_temp.act_as('00000000-0000-4000-9400-000000000a02');
select is(
  (select format('%s %s %s %s', s ->> 'date', s ->> 'cancelled', s ->> 'reason', s -> 'cancelled_by' ->> 'en')
     from jsonb_array_elements(public.get_course_sessions('00000000-0000-4000-9400-0000000000e1', pg_temp.d(), pg_temp.d()) -> 'sessions') s),
  format('%s true The teacher is sick Art Teacher', pg_temp.d()),
  'the session list shows the cancelled session, why, and who cancelled it'
);

-- ---------------------------------------------------------------------------------------------
-- The end-of-day notice
reset role;
select is(public.run_course_cancellation_notices(), 1, 'after the day: one notice (Sara); Laila''s extra time did not change');
select is(
  (select format('%s|%s|%s|%s|%s|%s|%s|%s', (n.user_id = '00000000-0000-4000-9400-000000000a04')::text, p -> 'course' ->> 'en', p ->> 'reason', p ->> 'minutes',
                 p ->> 'hours', p ->> 'fee', p ->> 'date', p -> 'segments')
     from public.notifications n cross join lateral (select n.template_params as p) x
    where n.template_key = 'course_session_cancelled' and n.nursery_id = '00000000-0000-4000-9400-00000000000a'),
  format('true|Art|The teacher is sick|90|1.75|105.00|%s|["fee"]', pg_temp.d()),
  'Sara''s mother is told the course, the reason, the 90 minutes Art would have covered, and the day''s extra time and fee'
);
select is(public.run_course_cancellation_notices(), 0, 'each child and day is told once');

-- Undoing the cancellation bills the day again, with less extra time.
select pg_temp.act_as('00000000-0000-4000-9400-000000000a01');
select is(
  (select format('%s / %s', r ->> 'rebilled', r ->> 'notified') from (select public.restore_course_session('00000000-0000-4000-9400-0000000000e1', pg_temp.d()) r) x),
  '2 / 0',
  'the admin restores the past session'
);
reset role;
select is(pg_temp.billed('00000000-0000-4000-9400-0000000007a3'), '(0.25,15.00) 15.00',
  'Sara is back to 15 minutes, and the unpaid invoice goes down again');

-- An admin's correction still bills the corrected day (through the shared re-billing).
select pg_temp.act_as('00000000-0000-4000-9400-000000000a01');
select lives_ok(
  format($$ select public.admin_correct_attendance('00000000-0000-4000-9400-0000000007a2', %L, %L, 'Picked up at three') $$,
         pg_temp.at(pg_temp.d(), '08:00'), pg_temp.at(pg_temp.d(), '15:00')),
  'the admin corrects Omar''s pickup to 15:00'
);
reset role;
select is(pg_temp.charge('00000000-0000-4000-9400-0000000007a2'), '(1.00,60.00)', 'and Omar pays for one hour');

-- ---------------------------------------------------------------------------------------------
-- A session still to come: the families are told at once, and again if it is back on
select pg_temp.act_as('00000000-0000-4000-9400-000000000a01');
select is(
  (select format('%s / %s', r ->> 'rebilled', r ->> 'notified')
     from (select public.cancel_course_session('00000000-0000-4000-9400-0000000000e1', pg_temp.d() + 2, 'Trip to the zoo') r) x),
  '0 / 3',
  'cancelling tomorrow''s Art tells the parents of its three children at once'
);
reset role;
select is(pg_temp.notices('course_session_cancelled_ahead', pg_temp.d() + 2), '3 | Art | Trip to the zoo',
  'with the course and the reason (and the day and time)');
select pg_temp.act_as('00000000-0000-4000-9400-000000000a01');
select is(
  (public.cancel_course_session('00000000-0000-4000-9400-0000000000e1', pg_temp.d() + 2, 'Trip to the zoo (bus booked)') ->> 'notified'),
  '0',
  'changing the reason does not tell the families twice'
);
select is(
  (public.restore_course_session('00000000-0000-4000-9400-0000000000e1', pg_temp.d() + 2) ->> 'notified') || ' / ' ||
  pg_temp.notices('course_session_restored', pg_temp.d() + 2),
  '3 / 3 | Art | -',
  'undoing it tells them the session is back on'
);

-- ---------------------------------------------------------------------------------------------
-- Today: the end-of-day notice waits for the nursery's end of the day
select set_config('test.today', public.cancel_course_session('00000000-0000-4000-9400-0000000000e1', pg_temp.d() + 1, 'Room is being painted')::text, true);
reset role;
update public.nursery_settings set end_of_day_checklist_time = '23:59:59' where nursery_id = '00000000-0000-4000-9400-00000000000a';
select is(public.run_course_cancellation_notices(), 0, 'today''s cancellation is not told as extra time before the end of the day');
update public.nursery_settings set end_of_day_checklist_time = '00:00' where nursery_id = '00000000-0000-4000-9400-00000000000a';
select is(public.run_course_cancellation_notices(), 1, 'and is once the end of the day has come and the child has gone home');
select is(pg_temp.notices('course_session_cancelled', pg_temp.d() + 1), '1 | Art | Room is being painted', 'with today''s reason');

-- ---------------------------------------------------------------------------------------------
-- Before opening: a morning course covers the whole early arrival
update public.nursery_settings set early_arrival_billing_enabled = true where nursery_id = '00000000-0000-4000-9400-00000000000a';
insert into public.course_enrollments (course_id, child_id, status, enrolled_at)
values ('00000000-0000-4000-9400-0000000000e4', '00000000-0000-4000-9400-0000000000c2', 'active', now() - interval '30 days');
update public.attendance_records set check_in = pg_temp.at(pg_temp.d(), '06:30'), early_minutes = 90 where id = '00000000-0000-4000-9400-0000000007a2';
select is(pg_temp.calc('00000000-0000-4000-9400-0000000007a2'), '(60,1.00)',
  'Omar came at 06:30 for Quran (07:00–07:45): the wait and the course before opening are covered; only the hour after closing is extra');

-- ---------------------------------------------------------------------------------------------
select ok(
  not has_function_privilege('authenticated', 'public.attendance_rebill_late_charge(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.course_cover_minutes(uuid, date, timestamptz, timestamptz, timestamptz, timestamptz, boolean)', 'execute')
  and not has_function_privilege('authenticated', 'public.course_session_tell_families(public.courses, date, text, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.course_session_rebill(uuid, date)', 'execute')
  and not has_function_privilege('authenticated', 'public.run_course_cancellation_notices()', 'execute')
  and not has_table_privilege('authenticated', 'public.course_session_cancellations', 'select')
  and has_function_privilege('authenticated', 'public.cancel_course_session(uuid, date, text)', 'execute')
  and not has_function_privilege('anon', 'public.get_course_sessions(uuid, date, date)', 'execute')
  and to_regprocedure('public.child_course_minutes(uuid, date, timestamptz, timestamptz, boolean)') is null,
  'signed-in users reach sessions only through the three course functions; the billing and notice parts are not callable'
);

select * from finish();
rollback;

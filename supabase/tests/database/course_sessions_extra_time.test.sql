-- Database test · courses during extra hours. Closing time 14:00, extra time billed by the quarter
-- hour from closing at 60 EGP an hour. Art runs 14:30–15:30 and Drama 15:00–16:00 every day.
-- A child's course time is not extra time (two courses at once count once); a cancelled session's
-- time is, the day is billed again when a session is cancelled or restored, and after the
-- nursery's end of the day the parents get one notice with the course and the reason. Only the
-- nursery's admins and the course's teacher manage sessions. The day tested is yesterday, plus
-- today for the end-of-day timing. Rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(27);

-- Yesterday in the nursery's time zone, and a moment of a day there.
create function pg_temp.d() returns date language sql as $$ select (now() at time zone 'Africa/Cairo')::date - 1 $$;
create function pg_temp.at(p_day date, p_time time) returns timestamptz language sql as $$ select (p_day + p_time) at time zone 'Africa/Cairo' $$;
-- The day's charge as "(extra hours,fee)".
create function pg_temp.charge(p_attendance uuid) returns text language sql as $$
  select (extra_hours::numeric(6,2), extra_fee::numeric(8,2))::text from public.attendance_records where id = p_attendance
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
  ('00000000-0000-4000-9400-0000000000c4', '00000000-0000-4000-9400-00000000000a', 'نور', 'Nour', '2022-01-01', 'active', '2026-01-01');
insert into public.parent_children (parent_id, child_id, is_primary) values
  ('00000000-0000-4000-9400-000000000a04', '00000000-0000-4000-9400-0000000000c1', true),
  ('00000000-0000-4000-9400-000000000a05', '00000000-0000-4000-9400-0000000000c2', true),
  ('00000000-0000-4000-9400-000000000a04', '00000000-0000-4000-9400-0000000000c3', true),
  ('00000000-0000-4000-9400-000000000a04', '00000000-0000-4000-9400-0000000000c4', true);

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
  ('00000000-0000-4000-9400-0000000000e1', '00000000-0000-4000-9400-0000000000c4', 'active', now() - interval '30 days');

-- Yesterday: Laila and Omar picked up at 16:15, Sara at 14:10. Today: Nour picked up at 16:15.
insert into public.attendance_records (id, child_id, attendance_date, check_in, check_out) values
  ('00000000-0000-4000-9400-0000000007a1', '00000000-0000-4000-9400-0000000000c1', pg_temp.d(), pg_temp.at(pg_temp.d(), '08:00'), pg_temp.at(pg_temp.d(), '16:15')),
  ('00000000-0000-4000-9400-0000000007a2', '00000000-0000-4000-9400-0000000000c2', pg_temp.d(), pg_temp.at(pg_temp.d(), '08:00'), pg_temp.at(pg_temp.d(), '16:15')),
  ('00000000-0000-4000-9400-0000000007a3', '00000000-0000-4000-9400-0000000000c3', pg_temp.d(), pg_temp.at(pg_temp.d(), '08:00'), pg_temp.at(pg_temp.d(), '14:10')),
  ('00000000-0000-4000-9400-0000000007a4', '00000000-0000-4000-9400-0000000000c4', pg_temp.d() + 1, pg_temp.at(pg_temp.d() + 1, '08:00'), pg_temp.at(pg_temp.d() + 1, '16:15'));

-- ---------------------------------------------------------------------------------------------
-- Course time is not extra time
select is(pg_temp.calc('00000000-0000-4000-9400-0000000007a2'), '(135,2.25)',
  'a child in no course: 14:00 to 16:15 is 2 h 15 of extra time');
select is(pg_temp.calc('00000000-0000-4000-9400-0000000007a1'), '(45,0.75)',
  'a child in Art and Drama: 14:30 to 16:00 is course time (counted once), so 45 minutes are extra time');
select is(
  (select public.course_runs_on(c, pg_temp.d())::text from public.courses c where c.id = '00000000-0000-4000-9400-0000000000e5'),
  'false',
  'a course whose time cannot be read has no sessions (nothing is taken off by mistake)'
);

-- Each child picked up and billed.
select set_config('test.billed', (select string_agg(public.apply_attendance_late_charge(a.id, a.check_out, 'checkout', true)::text, ',')
  from public.attendance_records a where a.id in ('00000000-0000-4000-9400-0000000007a1', '00000000-0000-4000-9400-0000000007a2', '00000000-0000-4000-9400-0000000007a3')), true);
select is(
  pg_temp.charge('00000000-0000-4000-9400-0000000007a1') || pg_temp.charge('00000000-0000-4000-9400-0000000007a2') || pg_temp.charge('00000000-0000-4000-9400-0000000007a3'),
  '(0.75,45.00)(2.25,135.00)(0.25,15.00)',
  'at pickup Laila pays for 45 minutes, Omar for 2 h 15, Sara (gone before her course) for 10 minutes rounded to a quarter'
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
  (select format('%s / %s', r ->> 'reason', r ->> 'rebilled')
     from (select public.cancel_course_session('00000000-0000-4000-9400-0000000000e1', pg_temp.d(), '  The teacher is sick  ') r) x),
  'The teacher is sick / 2',
  'the course''s teacher cancels a session with its reason; the day of its two children who came is billed again'
);
reset role;
select is(
  pg_temp.charge('00000000-0000-4000-9400-0000000007a1') || ' ' ||
  (select i.amount::numeric(8,2)::text from public.invoices i join public.attendance_records a on a.late_charge_invoice_id = i.id
    where a.id = '00000000-0000-4000-9400-0000000007a1'),
  '(1.25,75.00) 75.00',
  'Art''s time is extra time now: Laila pays for 1 h 15 (Drama still covers 15:00–16:00), and her invoice grows with it'
);
select is(pg_temp.charge('00000000-0000-4000-9400-0000000007a3'), '(0.25,15.00)',
  'Sara, who went home before Art, pays the same');

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
select is(public.run_course_cancellation_notices(), 1, 'after the day: one notice (Laila); Sara''s extra time had nothing to do with Art');
select is(
  (select format('%s|%s|%s|%s|%s|%s|%s|%s', (n.user_id = '00000000-0000-4000-9400-000000000a04')::text, p -> 'course' ->> 'en', p ->> 'reason', p ->> 'minutes',
                 p ->> 'hours', p ->> 'fee', p ->> 'date', p -> 'segments')
     from public.notifications n cross join lateral (select n.template_params as p) x
    where n.template_key = 'course_session_cancelled' and n.nursery_id = '00000000-0000-4000-9400-00000000000a'),
  format('true|Art|The teacher is sick|30|1.25|75.00|%s|["fee"]', pg_temp.d()),
  'Laila''s mother is told the course, the reason, the 30 minutes no course covered, and the day''s extra time and fee'
);
select is(public.run_course_cancellation_notices(), 0, 'each child and day is told once');

-- Undoing the cancellation bills the day again, with less extra time.
select pg_temp.act_as('00000000-0000-4000-9400-000000000a01');
select is(
  (public.restore_course_session('00000000-0000-4000-9400-0000000000e1', pg_temp.d()) ->> 'rebilled'),
  '2',
  'the admin restores the session'
);
reset role;
select is(
  pg_temp.charge('00000000-0000-4000-9400-0000000007a1') || ' ' ||
  (select i.amount::numeric(8,2)::text from public.invoices i join public.attendance_records a on a.late_charge_invoice_id = i.id
    where a.id = '00000000-0000-4000-9400-0000000007a1'),
  '(0.75,45.00) 45.00',
  'Laila is back to 45 minutes, and the unpaid invoice goes down again'
);

-- An admin's correction still bills the corrected day (now through the shared re-billing).
select pg_temp.act_as('00000000-0000-4000-9400-000000000a01');
select lives_ok(
  format($$ select public.admin_correct_attendance('00000000-0000-4000-9400-0000000007a2', %L, %L, 'Picked up at three') $$,
         pg_temp.at(pg_temp.d(), '08:00'), pg_temp.at(pg_temp.d(), '15:00')),
  'the admin corrects Omar''s pickup to 15:00'
);
reset role;
select is(pg_temp.charge('00000000-0000-4000-9400-0000000007a2'), '(1.00,60.00)', 'and Omar pays for one hour');

-- ---------------------------------------------------------------------------------------------
-- Today: the notice waits for the nursery's end of the day
select pg_temp.act_as('00000000-0000-4000-9400-000000000a01');
select set_config('test.today', public.cancel_course_session('00000000-0000-4000-9400-0000000000e1', pg_temp.d() + 1, 'Room is being painted')::text, true);
reset role;
update public.nursery_settings set end_of_day_checklist_time = '23:59:59' where nursery_id = '00000000-0000-4000-9400-00000000000a';
select is(public.run_course_cancellation_notices(), 0, 'today''s cancellation is not told before the end of the day');
update public.nursery_settings set end_of_day_checklist_time = '00:00' where nursery_id = '00000000-0000-4000-9400-00000000000a';
select is(public.run_course_cancellation_notices(), 1, 'and is once the end of the day has come and the child has gone home');
select is(
  (select format('%s|%s', n.template_params ->> 'reason', n.template_params ->> 'date') from public.notifications n
    where n.template_key = 'course_session_cancelled' and n.template_params ->> 'date' = (pg_temp.d() + 1)::text),
  format('Room is being painted|%s', pg_temp.d() + 1),
  'with today''s reason'
);

-- ---------------------------------------------------------------------------------------------
-- Before opening: a morning course is not early-arrival time
update public.nursery_settings set early_arrival_billing_enabled = true where nursery_id = '00000000-0000-4000-9400-00000000000a';
insert into public.course_enrollments (course_id, child_id, status, enrolled_at)
values ('00000000-0000-4000-9400-0000000000e4', '00000000-0000-4000-9400-0000000000c2', 'active', now() - interval '30 days');
update public.attendance_records set check_in = pg_temp.at(pg_temp.d(), '07:00'), early_minutes = 60 where id = '00000000-0000-4000-9400-0000000007a2';
select is(pg_temp.calc('00000000-0000-4000-9400-0000000007a2'), '(60,1.25)',
  'Omar came at 07:00 for Quran (07:00–07:45): only 15 minutes before opening are extra, plus the hour after closing');

-- ---------------------------------------------------------------------------------------------
select ok(
  not has_function_privilege('authenticated', 'public.attendance_rebill_late_charge(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.child_course_minutes(uuid, date, timestamptz, timestamptz, boolean)', 'execute')
  and not has_function_privilege('authenticated', 'public.course_session_rebill(uuid, date)', 'execute')
  and not has_function_privilege('authenticated', 'public.run_course_cancellation_notices()', 'execute')
  and not has_table_privilege('authenticated', 'public.course_session_cancellations', 'select')
  and has_function_privilege('authenticated', 'public.cancel_course_session(uuid, date, text)', 'execute')
  and not has_function_privilege('anon', 'public.get_course_sessions(uuid, date, date)', 'execute'),
  'signed-in users reach sessions only through the three course functions; the billing parts are not callable'
);

select * from finish();
rollback;

-- Database test · the nursery's staff attendance over a span of days.
--
-- Everybody's days in one call, with the shift behind each so "expected" can be worked out: the
-- nursery's open days, each person's weekly shift, somebody with no shift of their own, somebody who
-- has left but whose days are in the span, and a day waiting for the manager. The branch's admin
-- reads it, a teacher does not, nor does another branch's admin. Rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(18);

create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end;
$$;
create function pg_temp.answer() returns jsonb language sql as $$
  select public.get_nursery_staff_days('00000000-0000-4000-9f20-00000000000a', current_date - 6, current_date)
$$;
-- One person's entry in the answer, by name.
create function pg_temp.person(p_name text) returns jsonb language sql as $$
  select s from jsonb_array_elements(pg_temp.answer() -> 'staff') s where s ->> 'en' = p_name
$$;

insert into public.nurseries (id, name_ar, name_en, opens_at, closes_at, working_days) values
  ('00000000-0000-4000-9f20-00000000000a', 'حضانة', 'Days Nursery', '08:00', '17:00',
   '["sun", "mon", "tue", "wed", "thu", "fri", "sat"]'),
  ('00000000-0000-4000-9f20-00000000000b', 'حضانة أخرى', 'Other Nursery', '08:00', '17:00', '["sun"]');
update public.nursery_settings set timezone = 'Africa/Cairo'
 where nursery_id in ('00000000-0000-4000-9f20-00000000000a', '00000000-0000-4000-9f20-00000000000b');

insert into auth.users (id, email) values
  ('00000000-0000-4000-9f20-000000000a01', 'nd.admin@test.local'),
  ('00000000-0000-4000-9f20-000000000a02', 'nd.hoda@test.local'),
  ('00000000-0000-4000-9f20-000000000a03', 'nd.sara@test.local'),
  ('00000000-0000-4000-9f20-000000000a04', 'nd.gone@test.local'),
  ('00000000-0000-4000-9f20-000000000a05', 'nd.quiet@test.local'),
  ('00000000-0000-4000-9f20-000000000a06', 'nd.other@test.local');
update public.users u
   set role = v.role::public.user_role, nursery_id = v.nursery::uuid,
       name_en = v.name_en, name_ar = v.name_en, status = v.status
  from (values
    ('00000000-0000-4000-9f20-000000000a01', 'branch_admin', 'Admin',  'active',   '00000000-0000-4000-9f20-00000000000a'),
    ('00000000-0000-4000-9f20-000000000a02', 'teacher',      'Hoda',   'active',   '00000000-0000-4000-9f20-00000000000a'),
    ('00000000-0000-4000-9f20-000000000a03', 'teacher',      'Sara',   'active',   '00000000-0000-4000-9f20-00000000000a'),
    -- Left the nursery, but worked days inside the span.
    ('00000000-0000-4000-9f20-000000000a04', 'teacher',      'Gone',   'inactive', '00000000-0000-4000-9f20-00000000000a'),
    -- Left the nursery and worked none: she belongs to no span.
    ('00000000-0000-4000-9f20-000000000a05', 'teacher',      'Quiet',  'inactive', '00000000-0000-4000-9f20-00000000000a'),
    ('00000000-0000-4000-9f20-000000000a06', 'branch_admin', 'Other',  'active',   '00000000-0000-4000-9f20-00000000000b')
  ) as v(id, role, name_en, status, nursery)
 where u.id = v.id::uuid;

-- Hoda works ten to seven, every day of the week. Sara has no shift of her own.
insert into public.staff_profiles (id, user_id, nursery_id, employee_id, department, position, hire_date, contract_type) values
  ('00000000-0000-4000-9f20-0000000000f2', '00000000-0000-4000-9f20-000000000a02', '00000000-0000-4000-9f20-00000000000a',
   'ND-002', 'teaching', 'Lead teacher', current_date - 200, 'full_time');
insert into public.staff_schedules (staff_id, nursery_id, day_of_week, start_time, end_time, is_working_day)
select '00000000-0000-4000-9f20-0000000000f2', '00000000-0000-4000-9f20-00000000000a', d, '10:00', '19:00', true
  from generate_series(0, 6) d;

insert into public.staff_attendance (user_id, nursery_id, work_date, clock_in, check_in_at, clock_out, check_out_at,
                                     status, late_minutes, work_hours, source, needs_review, review_reason)
values
  -- Hoda: one day on time, one twenty minutes late.
  ('00000000-0000-4000-9f20-000000000a02', '00000000-0000-4000-9f20-00000000000a', current_date - 3,
   (current_date - 3 + time '10:00') at time zone 'Africa/Cairo', (current_date - 3 + time '10:00') at time zone 'Africa/Cairo',
   (current_date - 3 + time '19:00') at time zone 'Africa/Cairo', (current_date - 3 + time '19:00') at time zone 'Africa/Cairo',
   'present', 0, 9, 'self', false, null),
  ('00000000-0000-4000-9f20-000000000a02', '00000000-0000-4000-9f20-00000000000a', current_date - 2,
   (current_date - 2 + time '10:20') at time zone 'Africa/Cairo', (current_date - 2 + time '10:20') at time zone 'Africa/Cairo',
   (current_date - 2 + time '19:00') at time zone 'Africa/Cairo', (current_date - 2 + time '19:00') at time zone 'Africa/Cairo',
   'late', 20, 8.67, 'self', false, null),
  -- Sara: a day nobody closed, waiting for the manager.
  ('00000000-0000-4000-9f20-000000000a03', '00000000-0000-4000-9f20-00000000000a', current_date - 2,
   (current_date - 2 + time '08:00') at time zone 'Africa/Cairo', (current_date - 2 + time '08:00') at time zone 'Africa/Cairo',
   (current_date - 2 + time '17:00') at time zone 'Africa/Cairo', (current_date - 2 + time '17:00') at time zone 'Africa/Cairo',
   'present', 0, 9, 'self', true, 'no_departure'),
  -- Gone: a day inside the span, from before she left.
  ('00000000-0000-4000-9f20-000000000a04', '00000000-0000-4000-9f20-00000000000a', current_date - 5,
   (current_date - 5 + time '08:00') at time zone 'Africa/Cairo', (current_date - 5 + time '08:00') at time zone 'Africa/Cairo',
   null, null, 'present', 0, null, 'admin', false, null),
  -- A day outside the span is never read.
  ('00000000-0000-4000-9f20-000000000a02', '00000000-0000-4000-9f20-00000000000a', current_date - 20,
   (current_date - 20 + time '10:00') at time zone 'Africa/Cairo', (current_date - 20 + time '10:00') at time zone 'Africa/Cairo',
   null, null, 'present', 0, null, 'self', false, null);

-- ---------------------------------------------------------------------------------------------
-- 1-3 · who may read it
select pg_temp.act_as('00000000-0000-4000-9f20-000000000a02');
select throws_ok($$ select pg_temp.answer() $$, '42501', 'staff_clock_forbidden',
                 'a teacher does not read the whole nursery''s days');
select pg_temp.act_as('00000000-0000-4000-9f20-000000000a06');
select throws_ok($$ select pg_temp.answer() $$, '42501', 'staff_clock_forbidden',
                 'nor does another branch''s admin');
select pg_temp.act_as('00000000-0000-4000-9f20-000000000a01');
select lives_ok($$ select pg_temp.answer() $$, 'the branch''s own admin does');

-- 4-6 · the span itself
select is(pg_temp.answer() ->> 'from', (current_date - 6)::text, 'the span starts where it was asked to');
select is(jsonb_array_length(pg_temp.answer() -> 'school_days'), 7, 'and every day of it was a school day');
select throws_ok(
  $$ select public.get_nursery_staff_days('00000000-0000-4000-9f20-00000000000a', current_date - 200, current_date) $$,
  '22023', 'staff_clock_range_too_long', 'a span longer than a quarter is refused');
select throws_ok(
  $$ select public.get_nursery_staff_days('00000000-0000-4000-9f20-00000000000a', current_date, current_date - 1) $$,
  '22023', 'staff_clock_invalid', 'and so is one that ends before it starts');

-- 7-11 · the people
select is(
  (select string_agg(s ->> 'en', ',' order by s ->> 'en') from jsonb_array_elements(pg_temp.answer() -> 'staff') s),
  'Admin,Gone,Hoda,Sara',
  'everybody who could have a day: the staff now, and whoever worked inside the span and has since left');
select is((pg_temp.person('Hoda')) ->> 'position', 'Lead teacher', 'each one carries what they do');
select is(jsonb_array_length((pg_temp.person('Hoda')) -> 'schedule'), 7, 'and the shift they work each day');
select is((pg_temp.person('Hoda')) -> 'schedule' -> 0 ->> 'from', '10:00:00', 'with its hours');
select is(jsonb_array_length((pg_temp.person('Sara')) -> 'schedule'), 0,
          'somebody with no shift of her own carries none, and the nursery''s hours stand in');
select is(pg_temp.answer() -> 'house' ->> 'from', '08:00:00', 'which the answer carries too');

-- 12-16 · the days
select is(jsonb_array_length(pg_temp.answer() -> 'days'), 4, 'only the days inside the span');
select is(
  (select d ->> 'late_minutes' from jsonb_array_elements(pg_temp.answer() -> 'days') d
    where d ->> 'user_id' = '00000000-0000-4000-9f20-000000000a02' and d ->> 'work_date' = (current_date - 2)::text),
  '20', 'a late morning says by how much');
select is(
  (select d ->> 'review_reason' from jsonb_array_elements(pg_temp.answer() -> 'days') d
    where d ->> 'user_id' = '00000000-0000-4000-9f20-000000000a03'),
  'no_departure', 'a day waiting for the manager says why');
select is(
  (select count(*)::int from jsonb_array_elements(pg_temp.answer() -> 'days') d where (d ->> 'needs_review')::boolean),
  1, 'and it is the only one waiting');
select is(
  (select d ->> 'source' from jsonb_array_elements(pg_temp.answer() -> 'days') d
    where d ->> 'user_id' = '00000000-0000-4000-9f20-000000000a04'),
  'admin', 'a day the admin wrote says so');

select * from finish();
rollback;

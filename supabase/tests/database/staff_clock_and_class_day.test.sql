-- Database test · staff clocking and the class page's day: a member of staff clocks in once and out
-- once, the hours counted; a parent cannot; an admin records and corrects a day (late from the
-- opening time, the hours, never in the future, never out before in) and clears it; a teacher cannot
-- record someone else's; a nanny joins a class team after its teachers and is not a teacher on duty;
-- the class page shows the team's clocking, and a child who has not come is expected while the
-- nursery is open, absent after it closes.
-- Rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(22);

insert into public.nurseries (id, name_ar, name_en, working_days, opens_at, closes_at) values
  ('00000000-0000-4000-9900-00000000000a', 'حضانة الدوام', 'Clock Nursery', '["sun", "mon", "tue", "wed", "thu", "fri", "sat"]', '08:00', '23:59');
update public.nursery_settings set timezone = 'Africa/Cairo' where nursery_id = '00000000-0000-4000-9900-00000000000a';

insert into auth.users (id, email) values
  ('00000000-0000-4000-9900-000000000a01', 'c.admin@test.local'),
  ('00000000-0000-4000-9900-000000000a02', 'c.teacher@test.local'),
  ('00000000-0000-4000-9900-000000000a03', 'c.parent@test.local'),
  ('00000000-0000-4000-9900-000000000a04', 'c.nanny@test.local');
update public.users u
   set role = v.role::public.user_role, nursery_id = '00000000-0000-4000-9900-00000000000a', name_ar = v.name_en, name_en = v.name_en, status = 'active'
  from (values
    ('00000000-0000-4000-9900-000000000a01', 'branch_admin', 'Admin'),
    ('00000000-0000-4000-9900-000000000a02', 'teacher', 'Teacher Hoda'),
    ('00000000-0000-4000-9900-000000000a03', 'parent', 'Mona'),
    ('00000000-0000-4000-9900-000000000a04', 'teacher', 'Nanny Samia')
  ) as v(id, role, name_en)
 where u.id = v.id::uuid;
insert into public.classes (id, nursery_id, name_ar, name_en) values
  ('00000000-0000-4000-9900-0000000000b1', '00000000-0000-4000-9900-00000000000a', 'النجوم', 'Stars');
insert into public.class_staff (class_id, user_id, role) values
  ('00000000-0000-4000-9900-0000000000b1', '00000000-0000-4000-9900-000000000a02', 'lead');
insert into public.children (id, nursery_id, class_id, full_name_ar, full_name_en, dob, status, enrollment_date) values
  ('00000000-0000-4000-9900-0000000000c1', '00000000-0000-4000-9900-00000000000a', '00000000-0000-4000-9900-0000000000b1', 'ليلى', 'Laila', '2023-01-01', 'active', '2026-01-01');

create function pg_temp.act_as(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end;
$$;
create function pg_temp.today() returns date language sql as $$ select public.nursery_today('00000000-0000-4000-9900-00000000000a') $$;
create function pg_temp.day(p_user uuid, p_day date) returns text language sql security definer as $$
  select format('%s %s %s %s %s', to_char(check_in_at at time zone 'Africa/Cairo', 'HH24:MI'), coalesce(to_char(check_out_at at time zone 'Africa/Cairo', 'HH24:MI'), '-'),
                status, late_minutes, coalesce(work_hours::text, '-'))
    from public.staff_attendance where user_id = p_user and work_date = p_day
$$;

-- ---------------------------------------------------------------------------------------------
-- Clocking in and out
select pg_temp.act_as('00000000-0000-4000-9900-000000000a03');
select throws_ok($$ select public.clock_staff('in') $$, '42501', 'staff_clock_forbidden', 'a parent does not clock in');

select pg_temp.act_as('00000000-0000-4000-9900-000000000a02');
select is(public.get_my_staff_day() -> 'day', 'null'::jsonb, 'before clocking in, the day is empty');
select throws_ok($$ select public.clock_staff('out') $$, 'P0001', 'staff_clock_not_in', 'nobody clocks out before clocking in');
select set_config('t.in', public.clock_staff('in')::text, true);
select ok(current_setting('t.in')::jsonb -> 'day' ->> 'check_in_at' is not null
          and current_setting('t.in')::jsonb -> 'day' ->> 'status' in ('present', 'late')
          and current_setting('t.in')::jsonb -> 'day' ->> 'source' = 'self', 'a teacher clocks in, on time or late');
select throws_ok($$ select public.clock_staff('in') $$, 'P0001', 'staff_clock_already_in', 'only once a day');
select set_config('t.out', public.clock_staff('out')::text, true);
select ok((current_setting('t.out')::jsonb -> 'day' ->> 'work_hours')::numeric >= 0, 'clocking out counts the hours');
select throws_ok($$ select public.clock_staff('out') $$, 'P0001', 'staff_clock_already_out', 'and out only once');
select throws_ok($$ select public.clock_staff('lunch') $$, '22023', 'staff_clock_invalid', 'in or out only');

-- A teacher records only their own day.
select throws_ok(
  format($$ select public.record_staff_attendance('00000000-0000-4000-9900-000000000a04', %L, '08:00', '15:00') $$, pg_temp.today() - 1),
  '42501', 'staff_clock_forbidden', 'a teacher cannot record someone else''s day'
);

-- ---------------------------------------------------------------------------------------------
-- The admin records and corrects
select pg_temp.act_as('00000000-0000-4000-9900-000000000a01');
select lives_ok(
  format($$ select public.record_staff_attendance('00000000-0000-4000-9900-000000000a04', %L, '07:50', '15:30', 'Forgot her phone') $$, pg_temp.today() - 1),
  'the admin records a day someone forgot to clock'
);
select is(pg_temp.day('00000000-0000-4000-9900-000000000a04', pg_temp.today() - 1), '07:50 15:30 present 0 7.67', 'before opening is on time; the hours are counted');
select lives_ok(
  format($$ select public.record_staff_attendance('00000000-0000-4000-9900-000000000a04', %L, '08:20', null) $$, pg_temp.today() - 1),
  'and corrects it'
);
select is(pg_temp.day('00000000-0000-4000-9900-000000000a04', pg_temp.today() - 1), '08:20 - late 20 -', '20 minutes after opening is late');
select throws_ok(
  format($$ select public.record_staff_attendance('00000000-0000-4000-9900-000000000a04', %L, '10:00', '09:00') $$, pg_temp.today() - 1),
  '22023', 'staff_clock_invalid', 'never out before in'
);
select throws_ok(
  format($$ select public.record_staff_attendance('00000000-0000-4000-9900-000000000a04', %L, '08:00', null) $$, pg_temp.today() + 1),
  '22023', 'staff_clock_invalid', 'never a day still to come'
);
select throws_ok(
  format($$ select public.record_staff_attendance('00000000-0000-4000-9900-000000000a03', %L, '08:00', null) $$, pg_temp.today() - 1),
  '22023', 'staff_clock_person', 'nor a parent'
);
select is(
  public.record_staff_attendance('00000000-0000-4000-9900-000000000a04', pg_temp.today() - 1, null, null),
  null, 'both times empty clears the day'
);
reset role;
select is((select count(*)::int from public.staff_attendance where user_id = '00000000-0000-4000-9900-000000000a04'), 0, 'and it is gone');

-- ---------------------------------------------------------------------------------------------
-- The nanny and the class page
select pg_temp.act_as('00000000-0000-4000-9900-000000000a01');
select lives_ok(
  $$ select public.set_class_team_member('00000000-0000-4000-9900-0000000000b1', '00000000-0000-4000-9900-000000000a04', 'nanny') $$,
  'a nanny joins the class team'
);
select is(
  (select string_agg(m ->> 'role' || ':' || (m ->> 'on_duty') || ':' || (m ->> 'clock_in' is not null), ',')
     from jsonb_array_elements(public.get_class_profile('00000000-0000-4000-9900-0000000000b1') -> 'team') m),
  'lead:true:true,nanny:false:false',
  'the class page lists the teacher, then the nanny (not a teacher on duty), with today''s clocking'
);
select is(
  (select c ->> 'attendance' from jsonb_array_elements(public.get_class_profile('00000000-0000-4000-9900-0000000000b1') -> 'children') c),
  'expected', 'while the nursery is open, a child who has not come yet is expected'
);
reset role;
update public.nurseries set closes_at = '00:00:01' where id = '00000000-0000-4000-9900-00000000000a';
select pg_temp.act_as('00000000-0000-4000-9900-000000000a01');
select is(
  (select c ->> 'attendance' from jsonb_array_elements(public.get_class_profile('00000000-0000-4000-9900-0000000000b1') -> 'children') c),
  'absent', 'once it has closed, absent'
);

select * from finish();
rollback;

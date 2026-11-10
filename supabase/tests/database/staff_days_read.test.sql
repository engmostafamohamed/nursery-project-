-- Database test · a member of staff's days, read for their page (get_staff_days): the admin reads
-- anyone's at the branch, including someone with no HR record, oldest first with how late and who
-- recorded it, and the branch's school days in the range (a holiday is not one); the person reads their own; another teacher, a parent and another branch's admin
-- cannot; the dates are checked.
-- Rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(11);

insert into public.nurseries (id, name_ar, name_en, working_days, opens_at, closes_at) values
  ('00000000-0000-4000-9910-00000000000a', 'حضانة الأيام', 'Days Nursery', '["sun", "mon", "tue", "wed", "thu", "fri", "sat"]', '08:00', '17:00'),
  ('00000000-0000-4000-9910-00000000000b', 'حضانة أخرى', 'Other Nursery', '["sun", "mon", "tue", "wed", "thu", "fri", "sat"]', '08:00', '17:00');

insert into auth.users (id, email) values
  ('00000000-0000-4000-9910-000000000a01', 'd.admin@test.local'),
  ('00000000-0000-4000-9910-000000000a02', 'd.teacher@test.local'),
  ('00000000-0000-4000-9910-000000000a03', 'd.nanny@test.local'),
  ('00000000-0000-4000-9910-000000000a04', 'd.parent@test.local'),
  ('00000000-0000-4000-9910-000000000a05', 'd.other.admin@test.local');
update public.users u
   set role = v.role::public.user_role, nursery_id = v.nursery::uuid, name_ar = v.name_en, name_en = v.name_en, status = 'active'
  from (values
    ('00000000-0000-4000-9910-000000000a01', 'branch_admin', 'Admin', '00000000-0000-4000-9910-00000000000a'),
    ('00000000-0000-4000-9910-000000000a02', 'teacher', 'Teacher Hoda', '00000000-0000-4000-9910-00000000000a'),
    ('00000000-0000-4000-9910-000000000a03', 'teacher', 'Nanny Samia', '00000000-0000-4000-9910-00000000000a'),
    ('00000000-0000-4000-9910-000000000a04', 'parent', 'Mona', '00000000-0000-4000-9910-00000000000a'),
    ('00000000-0000-4000-9910-000000000a05', 'branch_admin', 'Other Admin', '00000000-0000-4000-9910-00000000000b')
  ) as v(id, role, name_en, nursery)
 where u.id = v.id::uuid;

-- Three days ago is a holiday at the branch.
insert into public.academic_calendars (nursery_id, year, holidays_json)
values ('00000000-0000-4000-9910-00000000000a', extract(year from current_date - 3)::integer, jsonb_build_array((current_date - 3)::text));

-- Two days for the nanny (no HR record, so no staff_id): one late and clocked by herself, one recorded by the admin.
insert into public.staff_attendance (user_id, nursery_id, work_date, check_in_at, check_out_at, status, late_minutes, source, notes)
values
  ('00000000-0000-4000-9910-000000000a03', '00000000-0000-4000-9910-00000000000a', current_date - 2,
   now() - interval '2 days', now() - interval '2 days' + interval '7 hours', 'late', 20, 'self', null),
  ('00000000-0000-4000-9910-000000000a03', '00000000-0000-4000-9910-00000000000a', current_date - 1,
   now() - interval '1 day', null, 'present', 0, 'admin', 'Forgot her phone');

create function pg_temp.act_as(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end;
$$;

select pg_temp.act_as('00000000-0000-4000-9910-000000000a01');
select set_config('t.days', public.get_staff_days('00000000-0000-4000-9910-000000000a03', current_date - 30, current_date)::text, true);
select is(jsonb_array_length(current_setting('t.days')::jsonb -> 'days'), 2, 'the admin reads the nanny''s days, though she has no HR record');
select is(
  (select string_agg(format('%s:%s:%s', d ->> 'status', d ->> 'late_minutes', d ->> 'source'), ' ') from jsonb_array_elements(current_setting('t.days')::jsonb -> 'days') d),
  'late:20:self present:0:admin',
  'oldest first, with how late and who recorded each'
);
select is(current_setting('t.days')::jsonb -> 'days' -> 1 ->> 'notes', 'Forgot her phone', 'with the admin''s note');
select ok(not ((current_setting('t.days')::jsonb -> 'school_days') @> to_jsonb((current_date - 3)::text)), 'a holiday is not a school day');
select ok((current_setting('t.days')::jsonb -> 'school_days') @> to_jsonb((current_date - 4)::text), 'the day before it is');
select is(current_setting('t.days')::jsonb ->> 'today', public.nursery_today('00000000-0000-4000-9910-00000000000a')::text, 'with the branch''s today');
select throws_ok(
  $$ select public.get_staff_days('00000000-0000-4000-9910-000000000a03', current_date, current_date - 1) $$,
  '22023', 'staff_clock_invalid', 'the dates are checked'
);

select pg_temp.act_as('00000000-0000-4000-9910-000000000a03');
select is(jsonb_array_length(public.get_staff_days('00000000-0000-4000-9910-000000000a03', current_date - 30, current_date) -> 'days'), 2, 'she reads her own days');

select pg_temp.act_as('00000000-0000-4000-9910-000000000a02');
select throws_ok(
  $$ select public.get_staff_days('00000000-0000-4000-9910-000000000a03', current_date - 30, current_date) $$,
  '42501', 'staff_clock_forbidden', 'another teacher cannot'
);

select pg_temp.act_as('00000000-0000-4000-9910-000000000a04');
select throws_ok(
  $$ select public.get_staff_days('00000000-0000-4000-9910-000000000a03', current_date - 30, current_date) $$,
  '42501', 'staff_clock_forbidden', 'a parent cannot'
);

select pg_temp.act_as('00000000-0000-4000-9910-000000000a05');
select throws_ok(
  $$ select public.get_staff_days('00000000-0000-4000-9910-000000000a03', current_date - 30, current_date) $$,
  '42501', 'staff_clock_forbidden', 'another branch''s admin cannot'
);

select * from finish();
rollback;

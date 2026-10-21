-- Database test · A child's attendance history (get_attendance_days): who brought the child in
-- (parent QR, delegate QR, nobody for a manual check-in), who reported an absence and when, and
-- that only the child's parents and the nursery's staff can read it.
-- Everything runs in one transaction that is rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(14);

insert into public.nurseries (id, name_ar, name_en, working_days) values
  ('00000000-0000-4000-c000-00000000000a', 'حضانة أ', 'Nursery A', '["sun","mon","tue","wed","thu","fri","sat"]'),
  ('00000000-0000-4000-c000-00000000000b', 'حضانة ب', 'Nursery B', '["sun","mon","tue","wed","thu","fri","sat"]');

insert into auth.users (id, email) values
  ('00000000-0000-4000-c000-000000000a01', 'history.admin@test.local'),
  ('00000000-0000-4000-c000-000000000a02', 'history.teacher@test.local'),
  ('00000000-0000-4000-c000-000000000a06', 'history.parent@test.local'),
  ('00000000-0000-4000-c000-000000000a07', 'history.other.parent@test.local'),
  ('00000000-0000-4000-c000-000000000b01', 'history.admin.b@test.local');

update public.users u
   set role = v.role::public.user_role,
       nursery_id = v.nursery_id::uuid,
       name_ar = v.name_ar,
       name_en = v.name_en,
       status = 'active'
  from (values
    ('00000000-0000-4000-c000-000000000a01', 'branch_admin', '00000000-0000-4000-c000-00000000000a', 'المديرة', 'Head Admin'),
    ('00000000-0000-4000-c000-000000000a02', 'teacher',      '00000000-0000-4000-c000-00000000000a', 'المعلمة سارة', 'Ms Sara'),
    ('00000000-0000-4000-c000-000000000a06', 'parent',       '00000000-0000-4000-c000-00000000000a', 'منى', 'Mona Parent'),
    ('00000000-0000-4000-c000-000000000a07', 'parent',       '00000000-0000-4000-c000-00000000000a', 'ولي آخر', 'Other Parent'),
    ('00000000-0000-4000-c000-000000000b01', 'branch_admin', '00000000-0000-4000-c000-00000000000b', 'مديرة ب', 'Admin B')
  ) as v(id, role, nursery_id, name_ar, name_en)
 where u.id = v.id::uuid;

insert into public.children (id, nursery_id, full_name_ar, full_name_en, dob, status, enrollment_date) values
  ('00000000-0000-4000-c000-0000000000c1', '00000000-0000-4000-c000-00000000000a', 'ليلى', 'Laila', '2023-01-01', 'active', '2026-09-01'),
  ('00000000-0000-4000-c000-0000000000c2', '00000000-0000-4000-c000-00000000000a', 'آدم', 'Adam', '2023-01-01', 'active', '2026-09-01');

insert into public.parent_children (parent_id, child_id) values
  ('00000000-0000-4000-c000-000000000a06', '00000000-0000-4000-c000-0000000000c1'),
  ('00000000-0000-4000-c000-000000000a07', '00000000-0000-4000-c000-0000000000c2');

insert into public.qr_tokens (id, child_id, nursery_id, token, expires_at, purpose, issued_by, pickup_person_full_name, pickup_relationship) values
  ('00000000-0000-4000-c000-0000000000d1', '00000000-0000-4000-c000-0000000000c1', '00000000-0000-4000-c000-00000000000a',
   'history-parent-token', now() + interval '1 day', 'parent', '00000000-0000-4000-c000-000000000a06', null, null),
  ('00000000-0000-4000-c000-0000000000d2', '00000000-0000-4000-c000-0000000000c1', '00000000-0000-4000-c000-00000000000a',
   'history-delegate-token', now() + interval '1 day', 'delegate', '00000000-0000-4000-c000-000000000a06', ' Aunt Salma ', 'Aunt');

-- Past days written directly: the working-hours guard is for live scans (and looks up a saved row
-- for a check-out), so it is off while the fixtures are inserted.
alter table public.attendance_records disable trigger attendance_qr_working_hours_guard;

insert into public.attendance_records
  (child_id, attendance_date, check_in, check_out, check_in_by, check_out_by, check_in_method, check_out_method,
   check_in_qr_token_id, pickup_person_name, pickup_relationship)
values
  -- Brought by the parent with their QR, picked up by the grandmother.
  ('00000000-0000-4000-c000-0000000000c1', '2026-09-06', '2026-09-06 06:00+00', '2026-09-06 13:00+00',
   '00000000-0000-4000-c000-000000000a02', '00000000-0000-4000-c000-000000000a02', 'qr_parent', 'qr_custom',
   '00000000-0000-4000-c000-0000000000d1', 'Grandma Huda', 'Grandmother'),
  -- Brought by a delegate, not picked up yet.
  ('00000000-0000-4000-c000-0000000000c1', '2026-09-07', '2026-09-07 06:15+00', null,
   '00000000-0000-4000-c000-000000000a02', null, 'qr_custom', null,
   '00000000-0000-4000-c000-0000000000d2', null, null),
  -- Checked in by hand: nobody recorded as bringing the child.
  ('00000000-0000-4000-c000-0000000000c1', '2026-09-08', '2026-09-08 06:30+00', '2026-09-08 12:00+00',
   '00000000-0000-4000-c000-000000000a01', '00000000-0000-4000-c000-000000000a01', 'manual', 'manual',
   null, null, null);

alter table public.attendance_records enable trigger attendance_qr_working_hours_guard;

insert into public.attendance_absence_reports (nursery_id, child_id, absence_date, reason, note, reported_by, created_at) values
  ('00000000-0000-4000-c000-00000000000a', '00000000-0000-4000-c000-0000000000c1', '2026-09-09', 'sick', 'Fever since last night',
   '00000000-0000-4000-c000-000000000a06', '2026-09-08 18:30+00');

create function pg_temp.act_as(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end;
$$;

-- What a reader sees for one day, as one comparable text.
create function pg_temp.day_of(p_day date) returns text
language sql as $$
  select (d.day_status, d.dropoff_name_ar, d.dropoff_name_en, d.dropoff_relationship,
          d.pickup_person_name, d.pickup_relationship, d.checked_in_by_en)::text
    from public.get_attendance_days(array['00000000-0000-4000-c000-0000000000c1'::uuid], '2026-09-06', '2026-09-10') d
   where d.day = p_day
$$;

-- ---------------------------------------------------------------------------------------------
-- The child's parent.
select pg_temp.act_as('00000000-0000-4000-c000-000000000a06');

select is(
  (select count(*)::int from public.get_attendance_days(array['00000000-0000-4000-c000-0000000000c1'::uuid], '2026-09-06', '2026-09-10')),
  5, 'the parent gets one row per day of the range'
);

select is(pg_temp.day_of('2026-09-06'),
  '(present,منى,"Mona Parent",,"Grandma Huda",Grandmother,"Ms Sara")',
  'parent QR at check-in: the parent who showed it brought the child; the pickup person is kept');

select is(pg_temp.day_of('2026-09-07'),
  '(partial,"Aunt Salma","Aunt Salma",Aunt,,,"Ms Sara")',
  'delegate QR at check-in: the delegate''s name (trimmed) and relation');

select is(pg_temp.day_of('2026-09-08'),
  '(present,,,,,,"Head Admin")',
  'manual check-in: nobody recorded as bringing the child, only the staff member');

select is(
  (select (d.day_status, d.absence_reason, d.absence_note, d.absence_reported_by_ar, d.absence_reported_by_en, d.absence_reported_at)::text
     from public.get_attendance_days(array['00000000-0000-4000-c000-0000000000c1'::uuid], '2026-09-06', '2026-09-10') d
    where d.day = '2026-09-09'),
  '(excused,sick,"Fever since last night",منى,"Mona Parent","2026-09-08 18:30:00+00")',
  'an absence notice: its reason, note, who sent it and when'
);

select is(
  (select (d.day_status, d.absence_reason, d.absence_reported_by_en, d.absence_reported_at)::text
     from public.get_attendance_days(array['00000000-0000-4000-c000-0000000000c1'::uuid], '2026-09-06', '2026-09-10') d
    where d.day = '2026-09-10'),
  '(absent,,,)',
  'an absence without notice has no reason or reporter'
);

-- ---------------------------------------------------------------------------------------------
-- The nursery's staff see the same history.
select pg_temp.act_as('00000000-0000-4000-c000-000000000a01');
select is(
  (select count(*)::int from public.get_attendance_days(array['00000000-0000-4000-c000-0000000000c1'::uuid], '2026-09-06', '2026-09-10')),
  5, 'the branch admin sees the child''s history'
);
select is(pg_temp.day_of('2026-09-07'),
  '(partial,"Aunt Salma","Aunt Salma",Aunt,,,"Ms Sara")',
  'and who brought the child, like the parent');

select pg_temp.act_as('00000000-0000-4000-c000-000000000a02');
select is(
  (select count(*)::int from public.get_attendance_days(array['00000000-0000-4000-c000-0000000000c1'::uuid], '2026-09-06', '2026-09-10')),
  5, 'a teacher of the nursery sees it too'
);

-- ---------------------------------------------------------------------------------------------
-- Nobody else.
select pg_temp.act_as('00000000-0000-4000-c000-000000000a07');
select is(
  (select count(*)::int from public.get_attendance_days(array['00000000-0000-4000-c000-0000000000c1'::uuid], '2026-09-06', '2026-09-10')),
  0, 'another child''s parent gets nothing'
);

select pg_temp.act_as('00000000-0000-4000-c000-000000000b01');
select is(
  (select count(*)::int from public.get_attendance_days(array['00000000-0000-4000-c000-0000000000c1'::uuid], '2026-09-06', '2026-09-10')),
  0, 'another nursery''s admin gets nothing'
);

select pg_temp.act_as('00000000-0000-4000-c000-000000000a06');
select throws_ok(
  $$ select * from public.get_attendance_days(array['00000000-0000-4000-c000-0000000000c1'::uuid], '2025-01-01', '2026-09-10') $$,
  '22023', 'attendance_invalid_range',
  'a range longer than 400 days is refused'
);

reset role;
select ok(
  not has_function_privilege('anon', 'public.get_attendance_days(uuid[], date, date)', 'execute'),
  'signed-out visitors cannot call it'
);
select ok(
  has_function_privilege('authenticated', 'public.get_attendance_days(uuid[], date, date)', 'execute'),
  'signed-in users can call it (the function checks each child)'
);

select * from finish();
rollback;

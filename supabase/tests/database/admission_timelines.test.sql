-- Database test · A child's admission journey (get_admission_timelines): the exact time of each
-- step from the application to the first day, who approved it, when the child joined (in the
-- nursery's own day), and that only the child's parents and the nursery's staff can read it.
-- Everything runs in one transaction that is rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(12);

insert into public.nurseries (id, name_ar, name_en) values
  ('00000000-0000-4000-e000-00000000000a', 'حضانة أ', 'Nursery A'),
  ('00000000-0000-4000-e000-00000000000b', 'حضانة ب', 'Nursery B');

insert into auth.users (id, email) values
  ('00000000-0000-4000-e000-000000000a01', 'journey.admin@test.local'),
  ('00000000-0000-4000-e000-000000000a02', 'journey.teacher@test.local'),
  ('00000000-0000-4000-e000-000000000a06', 'journey.parent@test.local'),
  ('00000000-0000-4000-e000-000000000a07', 'journey.other.parent@test.local'),
  ('00000000-0000-4000-e000-000000000b01', 'journey.admin.b@test.local');

update public.users u
   set role = v.role::public.user_role,
       nursery_id = v.nursery_id::uuid,
       name_ar = v.name_ar,
       name_en = v.name_en,
       status = 'active'
  from (values
    ('00000000-0000-4000-e000-000000000a01', 'branch_admin', '00000000-0000-4000-e000-00000000000a', 'المديرة', 'Head Admin'),
    ('00000000-0000-4000-e000-000000000a02', 'teacher',      '00000000-0000-4000-e000-00000000000a', 'المعلمة', 'Teacher'),
    ('00000000-0000-4000-e000-000000000a06', 'parent',       '00000000-0000-4000-e000-00000000000a', 'منى', 'Mona'),
    ('00000000-0000-4000-e000-000000000a07', 'parent',       '00000000-0000-4000-e000-00000000000a', 'ولي آخر', 'Other Parent'),
    ('00000000-0000-4000-e000-000000000b01', 'branch_admin', '00000000-0000-4000-e000-00000000000b', 'مديرة ب', 'Admin B')
  ) as v(id, role, nursery_id, name_ar, name_en)
 where u.id = v.id::uuid;

-- Three children of nursery A (Cairo time):
--   c1 joined from an application, approved 1 Sep 10:00 Cairo (07:00 UTC);
--   c2 was added directly, with an enrollment date set to an earlier day than its record;
--   c3 was added directly at 00:30 Cairo on 3 Sep, which is still 2 Sep in UTC;
--   c4 was approved at 00:45 Cairo on 5 Sep, and dated 4 Sep in UTC as approvals were before.
insert into public.children (id, nursery_id, full_name_ar, full_name_en, dob, status, enrollment_date, created_at, enrollment_extended_json) values
  ('00000000-0000-4000-e000-0000000000c1', '00000000-0000-4000-e000-00000000000a', 'ليلى', 'Laila', '2023-01-01', 'active',
   '2026-09-01', '2026-09-01 07:00+00', '{"source_application_id": "00000000-0000-4000-e000-0000000000f1"}'),
  ('00000000-0000-4000-e000-0000000000c2', '00000000-0000-4000-e000-00000000000a', 'آدم', 'Adam', '2023-01-01', 'active',
   '2026-09-01', '2026-09-05 08:00+00', '{}'),
  ('00000000-0000-4000-e000-0000000000c3', '00000000-0000-4000-e000-00000000000a', 'سلمى', 'Salma', '2023-01-01', 'active',
   '2026-09-03', '2026-09-02 21:30+00', '{}'),
  ('00000000-0000-4000-e000-0000000000c4', '00000000-0000-4000-e000-00000000000a', 'يوسف', 'Youssef', '2023-01-01', 'active',
   '2026-09-04', '2026-09-04 21:45+00', '{}');

insert into public.parent_children (parent_id, child_id) values
  ('00000000-0000-4000-e000-000000000a06', '00000000-0000-4000-e000-0000000000c1'),
  ('00000000-0000-4000-e000-000000000a06', '00000000-0000-4000-e000-0000000000c3'),
  ('00000000-0000-4000-e000-000000000a07', '00000000-0000-4000-e000-0000000000c2'),
  ('00000000-0000-4000-e000-000000000a07', '00000000-0000-4000-e000-0000000000c4');

-- The approved application behind c1. Written directly as approved: the documents check is for
-- live submissions, so it is off while the fixture is inserted.
alter table public.applications disable trigger trg_require_application_documents_before_submit;
insert into public.applications (id, nursery_id, parent_id, child_id, status, created_at, submitted_at, reviewed_at, reviewed_by) values
  ('00000000-0000-4000-e000-0000000000f1', '00000000-0000-4000-e000-00000000000a', '00000000-0000-4000-e000-000000000a06',
   '00000000-0000-4000-e000-0000000000c1', 'approved', '2026-08-25 10:00+00', '2026-08-26 09:15+00', '2026-09-01 07:00+00',
   '00000000-0000-4000-e000-000000000a01');
alter table public.applications enable trigger trg_require_application_documents_before_submit;

-- Its admission invoice: a payment still waiting, and the confirmed one.
insert into public.invoices (id, nursery_id, parent_id, amount, due_date, status, invoice_type, line_items_json) values
  ('00000000-0000-4000-e000-0000000000d1', '00000000-0000-4000-e000-00000000000a', '00000000-0000-4000-e000-000000000a06',
   3000, '2026-08-30', 'paid', 'other', '{"application_id": "00000000-0000-4000-e000-0000000000f1"}');
insert into public.payments (invoice_id, amount, method, status, paid_at, created_at) values
  ('00000000-0000-4000-e000-0000000000d1', 3000, 'instapay', 'pending', '2026-08-26 09:16+00', '2026-08-26 09:16+00'),
  ('00000000-0000-4000-e000-0000000000d1', 3000, 'instapay', 'completed', '2026-08-27 12:00+00', '2026-08-26 09:17+00');

insert into public.attendance_records (child_id, attendance_date, check_in, check_in_method) values
  ('00000000-0000-4000-e000-0000000000c1', '2026-09-03', '2026-09-03 06:05+00', 'manual'),
  ('00000000-0000-4000-e000-0000000000c1', '2026-09-02', '2026-09-02 06:10+00', 'manual');

create function pg_temp.act_as(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end;
$$;

create function pg_temp.journey_of(p_child uuid) returns text
language sql as $$
  select (t.application_id, t.application_started_at, t.submitted_at, t.payment_confirmed_at, t.approved_at,
          t.approved_by_ar, t.approved_by_en, t.enrollment_date, t.joined_at, t.first_check_in)::text
    from public.get_admission_timelines(array[p_child]) t
$$;

set local timezone = 'UTC';

-- ---------------------------------------------------------------------------------------------
-- The parent.
select pg_temp.act_as('00000000-0000-4000-e000-000000000a06');

select is(
  (select array_agg(t.child_id order by t.child_id)::text from public.get_admission_timelines(array[
    '00000000-0000-4000-e000-0000000000c1', '00000000-0000-4000-e000-0000000000c2', '00000000-0000-4000-e000-0000000000c3']::uuid[]) t),
  '{00000000-0000-4000-e000-0000000000c1,00000000-0000-4000-e000-0000000000c3}',
  'a parent gets their own children only'
);

select is(pg_temp.journey_of('00000000-0000-4000-e000-0000000000c1'),
  '(00000000-0000-4000-e000-0000000000f1,"2026-08-25 10:00:00+00","2026-08-26 09:15:00+00","2026-08-27 12:00:00+00","2026-09-01 07:00:00+00",المديرة,"Head Admin",2026-09-01,"2026-09-01 07:00:00+00","2026-09-02 06:10:00+00")',
  'from an application: started, submitted, first confirmed payment, approved and by whom, joined, first check-in'
);

select is(pg_temp.journey_of('00000000-0000-4000-e000-0000000000c3'),
  '(,,,,,,,2026-09-03,"2026-09-02 21:30:00+00",)',
  'added directly: no application steps; joined at 00:30 Cairo counts as its 3 September enrollment day'
);

-- ---------------------------------------------------------------------------------------------
-- The nursery's staff.
select pg_temp.act_as('00000000-0000-4000-e000-000000000a01');
select is(
  (select count(*)::int from public.get_admission_timelines(array[
    '00000000-0000-4000-e000-0000000000c1', '00000000-0000-4000-e000-0000000000c2', '00000000-0000-4000-e000-0000000000c3',
    '00000000-0000-4000-e000-0000000000c4']::uuid[])),
  4, 'the branch admin gets every child of the nursery'
);
select is(pg_temp.journey_of('00000000-0000-4000-e000-0000000000c2'),
  '(,,,,,,,2026-09-01,,)',
  'an enrollment date set to another day than the record: only the date is known'
);
select is(pg_temp.journey_of('00000000-0000-4000-e000-0000000000c4'),
  '(,,,,,,,2026-09-04,"2026-09-04 21:45:00+00",)',
  'an enrollment dated in UTC (approvals before the nursery-day fix) still has its time'
);

select pg_temp.act_as('00000000-0000-4000-e000-000000000a02');
select is(
  (select count(*)::int from public.get_admission_timelines(array['00000000-0000-4000-e000-0000000000c1']::uuid[])),
  1, 'a teacher of the nursery can read it'
);

-- ---------------------------------------------------------------------------------------------
-- Nobody else.
select pg_temp.act_as('00000000-0000-4000-e000-000000000a07');
select is(
  (select count(*)::int from public.get_admission_timelines(array['00000000-0000-4000-e000-0000000000c1']::uuid[])),
  0, 'another child''s parent gets nothing'
);

select pg_temp.act_as('00000000-0000-4000-e000-000000000b01');
select is(
  (select count(*)::int from public.get_admission_timelines(array['00000000-0000-4000-e000-0000000000c1']::uuid[])),
  0, 'another nursery''s admin gets nothing'
);

select throws_ok(
  $$ select * from public.get_admission_timelines((select array_agg(gen_random_uuid()) from generate_series(1, 201))) $$,
  '22023', 'admission_timeline_invalid_children',
  'more than 200 children at once is refused'
);

reset role;
select ok(
  not has_function_privilege('anon', 'public.get_admission_timelines(uuid[])', 'execute'),
  'signed-out visitors cannot call it'
);
select ok(
  has_function_privilege('authenticated', 'public.get_admission_timelines(uuid[])', 'execute'),
  'signed-in users can call it (the function checks each child)'
);

select * from finish();
rollback;

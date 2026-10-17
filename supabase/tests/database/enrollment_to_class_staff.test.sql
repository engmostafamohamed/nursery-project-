-- Database test · Admissions → classes: confirming the admission payment, enrolling the child,
-- and staffing a class with a lead and a backup teacher. Covers the RPCs and the RLS each role
-- goes through. Everything runs in one transaction that is rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(25);

-- ---------------------------------------------------------------------------------------------
-- Test data (as the database owner, so RLS does not apply yet)
-- ---------------------------------------------------------------------------------------------

-- Nursery A has the family and the staff; nursery B is someone else's nursery.
insert into public.nurseries (id, name_ar, name_en) values
  ('00000000-0000-4000-8000-00000000000a', 'حضانة أ', 'Nursery A'),
  ('00000000-0000-4000-8000-00000000000b', 'حضانة ب', 'Nursery B');

-- Creating an auth user also creates its public.users row (as a parent); roles are set after.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000a01', 'admin.a@test.local'),
  ('00000000-0000-4000-8000-000000000a02', 'manager.a@test.local'),
  ('00000000-0000-4000-8000-000000000a03', 'lead.teacher@test.local'),
  ('00000000-0000-4000-8000-000000000a04', 'backup.teacher@test.local'),
  ('00000000-0000-4000-8000-000000000a05', 'other.teacher@test.local'),
  ('00000000-0000-4000-8000-000000000a06', 'parent@test.local'),
  ('00000000-0000-4000-8000-000000000b02', 'manager.b@test.local');

update public.users u
   set role = v.role::public.user_role,
       nursery_id = v.nursery_id::uuid,
       department = v.department::public.user_department,
       status = 'active'
  from (values
    ('00000000-0000-4000-8000-000000000a01', 'branch_admin', '00000000-0000-4000-8000-00000000000a', null),
    ('00000000-0000-4000-8000-000000000a02', 'manager',      '00000000-0000-4000-8000-00000000000a', 'operations'),
    ('00000000-0000-4000-8000-000000000a03', 'teacher',      '00000000-0000-4000-8000-00000000000a', null),
    ('00000000-0000-4000-8000-000000000a04', 'teacher',      '00000000-0000-4000-8000-00000000000a', null),
    ('00000000-0000-4000-8000-000000000a05', 'teacher',      '00000000-0000-4000-8000-00000000000a', null),
    ('00000000-0000-4000-8000-000000000a06', 'parent',       '00000000-0000-4000-8000-00000000000a', null),
    ('00000000-0000-4000-8000-000000000b02', 'manager',      '00000000-0000-4000-8000-00000000000b', 'operations')
  ) as v(id, role, nursery_id, department)
 where u.id = v.id::uuid;

-- An older class: before this change a new child was dropped into the nursery's oldest class.
insert into public.classes (id, nursery_id, name_ar, name_en, created_at) values
  ('00000000-0000-4000-8000-000000000c01', '00000000-0000-4000-8000-00000000000a', 'الفصل القديم', 'Old class', now() - interval '1 year'),
  ('00000000-0000-4000-8000-000000000c0b', '00000000-0000-4000-8000-00000000000b', 'فصل ب', 'Class B', now());

-- A submitted application, its admission invoice, and the parent's InstaPay payment awaiting finance.
insert into public.applications (id, nursery_id, parent_id, status, submitted_at, parent_info_json, child_info_json) values (
  '00000000-0000-4000-8000-000000000d01',
  '00000000-0000-4000-8000-00000000000a',
  '00000000-0000-4000-8000-000000000a06',
  'under_review',
  now(),
  '{"mother": {"full_name": "Mona"}}',
  '{"full_name_ar": "آدم", "full_name_en": "Adam", "dob": "2023-05-10", "gender": "male"}'
);

insert into public.invoices (id, nursery_id, parent_id, amount, due_date, status, line_items_json) values (
  '00000000-0000-4000-8000-000000000e01',
  '00000000-0000-4000-8000-00000000000a',
  '00000000-0000-4000-8000-000000000a06',
  1000,
  current_date + 7,
  'pending',
  '{"application_id": "00000000-0000-4000-8000-000000000d01", "items": []}'
);

insert into public.payment_attempts (id, invoice_id, parent_id, nursery_id, amount, payment_method, status, reference) values (
  '00000000-0000-4000-8000-000000000f01',
  '00000000-0000-4000-8000-000000000e01',
  '00000000-0000-4000-8000-000000000a06',
  '00000000-0000-4000-8000-00000000000a',
  1000,
  'instapay',
  'pending_confirmation',
  '3333'
);

-- Acts as a signed-in user for the statements that follow: RLS and auth.uid() apply.
create function pg_temp.act_as(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 1. Finance confirms the payment
-- ---------------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-000000000a01');

select lives_ok(
  $$ select public.confirm_invoice_payment_attempt('00000000-0000-4000-8000-000000000f01') $$,
  'the branch admin confirms the parent''s payment'
);

reset role;
select is(
  (select status from public.invoices where id = '00000000-0000-4000-8000-000000000e01'),
  'paid',
  'the admission invoice is paid in full'
);

-- ---------------------------------------------------------------------------------------------
-- 2. The child is enrolled
-- ---------------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-000000000a01');

select throws_ok(
  $$ select public.approve_application_enrollment(
       '00000000-0000-4000-8000-000000000d01', '00000000-0000-4000-8000-00000000000a', true,
       '00000000-0000-4000-8000-000000000c0b') $$,
  '22023', 'enrollment_class_not_found',
  'a class from another nursery cannot be chosen'
);

select lives_ok(
  $$ select public.approve_application_enrollment(
       '00000000-0000-4000-8000-000000000d01', '00000000-0000-4000-8000-00000000000a', true) $$,
  'approving the paid application enrolls the child'
);

reset role;
select set_config('test.child_id',
  (select child_id::text from public.applications where id = '00000000-0000-4000-8000-000000000d01'), true);

select is(
  (select status from public.applications where id = '00000000-0000-4000-8000-000000000d01'),
  'approved',
  'the application is approved'
);

select is(
  (select class_id from public.children where id = current_setting('test.child_id')::uuid),
  null,
  'the new child waits unassigned instead of being put in the oldest class'
);

-- ---------------------------------------------------------------------------------------------
-- 3. The manager opens a new class with a lead and a backup teacher
-- ---------------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-000000000a02');

select lives_ok(
  $$ insert into public.classes (id, nursery_id, name_ar, name_en)
     values ('00000000-0000-4000-8000-000000000c02', '00000000-0000-4000-8000-00000000000a', 'الفراشات', 'Butterflies') $$,
  'the manager creates a class'
);

select lives_ok(
  $$ select public.set_class_lead('00000000-0000-4000-8000-000000000c02', '00000000-0000-4000-8000-000000000a03') $$,
  'the manager sets the lead teacher'
);

select lives_ok(
  $$ select public.set_class_substitute('00000000-0000-4000-8000-000000000c02', '00000000-0000-4000-8000-000000000a04') $$,
  'the manager sets the backup teacher'
);

select throws_ok(
  $$ select public.set_class_substitute('00000000-0000-4000-8000-000000000c02', '00000000-0000-4000-8000-000000000a03') $$,
  '22023', 'class_backup_is_lead',
  'the lead teacher cannot also be the backup'
);

select lives_ok(
  $$ select public.set_class_substitute('00000000-0000-4000-8000-000000000c02', '00000000-0000-4000-8000-000000000a05') $$,
  'choosing another backup replaces the first one'
);

select results_eq(
  $$ select user_id::text, role::text from public.class_staff
      where class_id = '00000000-0000-4000-8000-000000000c02' order by role::text $$,
  $$ values ('00000000-0000-4000-8000-000000000a03', 'lead'), ('00000000-0000-4000-8000-000000000a05', 'substitute') $$,
  'the class keeps one lead and one backup'
);

select lives_ok(
  $$ select public.set_class_substitute('00000000-0000-4000-8000-000000000c02', '00000000-0000-4000-8000-000000000a04') $$,
  'the manager switches the backup back'
);

select lives_ok(
  $$ update public.children set class_id = '00000000-0000-4000-8000-000000000c02'
      where id = current_setting('test.child_id')::uuid $$,
  'the manager puts the new child in the class'
);

select is(
  (select class_id::text from public.children where id = current_setting('test.child_id')::uuid),
  '00000000-0000-4000-8000-000000000c02',
  'the child is in the new class'
);

-- ---------------------------------------------------------------------------------------------
-- 4. What each teacher sees
-- ---------------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-000000000a03');
select is(
  (select count(*)::int from public.children where class_id = '00000000-0000-4000-8000-000000000c02'),
  1,
  'the lead teacher sees the child'
);

select pg_temp.act_as('00000000-0000-4000-8000-000000000a04');
select is(
  (select count(*)::int from public.children where class_id = '00000000-0000-4000-8000-000000000c02'),
  1,
  'the backup teacher sees the child, ready to cover'
);

select results_eq(
  $$ select role::text from public.class_staff
      where class_id = '00000000-0000-4000-8000-000000000c02' order by role::text $$,
  $$ values ('lead'), ('substitute') $$,
  'the backup teacher sees who leads the class'
);

select results_eq(
  $$ select role::text, name_en from public.my_class_staff()
      where class_id = '00000000-0000-4000-8000-000000000c02' order by role::text $$,
  $$ values ('lead', 'lead.teacher'), ('substitute', 'backup.teacher') $$,
  'the backup teacher can read the name of the lead teacher they cover for'
);

select pg_temp.act_as('00000000-0000-4000-8000-000000000a05');
select is(
  (select count(*)::int from public.children where class_id = '00000000-0000-4000-8000-000000000c02'),
  0,
  'a teacher who is no longer on the class does not see its children'
);

select is(
  (select count(*)::int from public.my_class_staff()),
  0,
  'a teacher on no class sees no class staff names'
);

-- ---------------------------------------------------------------------------------------------
-- 5. Another nursery's manager cannot touch the class
-- ---------------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-000000000b02');

select is(
  (select count(*)::int from public.class_staff where class_id = '00000000-0000-4000-8000-000000000c02'),
  0,
  'a manager of another nursery does not see the class staff'
);

select throws_ok(
  $$ select public.set_class_substitute('00000000-0000-4000-8000-000000000c02', '00000000-0000-4000-8000-000000000a05') $$,
  null, null,
  'a manager of another nursery cannot change the backup teacher'
);

reset role;
select is(
  (select user_id::text from public.class_staff
    where class_id = '00000000-0000-4000-8000-000000000c02' and role = 'substitute'),
  '00000000-0000-4000-8000-000000000a04',
  'the backup teacher is unchanged'
);

-- ---------------------------------------------------------------------------------------------
-- 6. A deleted class cannot be chosen
-- ---------------------------------------------------------------------------------------------
reset role;
update public.classes set deleted_at = now() where id = '00000000-0000-4000-8000-000000000c01';

select pg_temp.act_as('00000000-0000-4000-8000-000000000a01');
select throws_ok(
  $$ select public.approve_application_enrollment(
       '00000000-0000-4000-8000-000000000d01', '00000000-0000-4000-8000-00000000000a', true,
       '00000000-0000-4000-8000-000000000c01') $$,
  '22023', 'enrollment_class_not_found',
  'a deleted class cannot be chosen'
);

reset role;
select * from finish();
rollback;

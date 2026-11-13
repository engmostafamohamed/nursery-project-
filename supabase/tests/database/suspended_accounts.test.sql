-- Database test · a deactivated staff member is shut out: the branch admin (or HR) deactivates a
-- teacher, who then is nobody to every rule (no role, no nursery, no events) and cannot sign in;
-- nobody changes their own status; only the right people deactivate whom; reactivating gives the
-- access back. Rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(17);

create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end;
$$;

insert into public.nurseries (id, name_ar, name_en) values
  ('00000000-0000-4000-9b00-00000000000a', 'حضانة', 'Staff Nursery'),
  ('00000000-0000-4000-9b00-00000000000b', 'أخرى', 'Other Nursery');
insert into auth.users (id, email) values
  ('00000000-0000-4000-9b00-000000000a01', 'suspend.admin@test.local'),
  ('00000000-0000-4000-9b00-000000000a02', 'suspend.teacher@test.local'),
  ('00000000-0000-4000-9b00-000000000a03', 'suspend.hr@test.local'),
  ('00000000-0000-4000-9b00-000000000a04', 'suspend.parent@test.local'),
  ('00000000-0000-4000-9b00-000000000a06', 'suspend.other.admin@test.local'),
  ('00000000-0000-4000-9b00-000000000a07', 'suspend.second.admin@test.local');
update public.users u
   set role = v.role::public.user_role, department = v.dept::public.user_department,
       nursery_id = v.nursery::uuid, name_en = v.name_en, status = 'active'
  from (values
    ('00000000-0000-4000-9b00-000000000a01', 'branch_admin', null, '00000000-0000-4000-9b00-00000000000a', 'Admin'),
    ('00000000-0000-4000-9b00-000000000a02', 'teacher', null, '00000000-0000-4000-9b00-00000000000a', 'Teacher'),
    ('00000000-0000-4000-9b00-000000000a03', 'manager', 'hr', '00000000-0000-4000-9b00-00000000000a', 'HR'),
    ('00000000-0000-4000-9b00-000000000a04', 'parent', null, '00000000-0000-4000-9b00-00000000000a', 'Parent'),
    ('00000000-0000-4000-9b00-000000000a06', 'branch_admin', null, '00000000-0000-4000-9b00-00000000000b', 'Other admin'),
    ('00000000-0000-4000-9b00-000000000a07', 'branch_admin', null, '00000000-0000-4000-9b00-00000000000a', 'Second admin')
  ) as v(id, role, dept, nursery, name_en)
 where u.id = v.id::uuid;
insert into public.events (nursery_id, title_ar, title_en, starts_at, category, target_scope, status) values
  ('00000000-0000-4000-9b00-00000000000a', 'حفل', 'Party', now() + interval '5 days', 'activity', 'individual', 'active');

create function pg_temp.teacher_sees() returns text language sql as $$
  select format('%s %s %s', coalesce(public.current_user_role()::text, '-'), (public.current_user_nursery_id() is not null)::text,
                (select count(*) from public.events where nursery_id = '00000000-0000-4000-9b00-00000000000a'))
$$;

select pg_temp.act_as('00000000-0000-4000-9b00-000000000a02');
select is(pg_temp.teacher_sees(), 'teacher true 1', 'active, the teacher has her role, her nursery and its events');
select throws_ok($$ update public.users set status = 'inactive' where id = auth.uid() $$, '42501', 'rbac_protected_column', 'nobody changes their own status');

-- Who may not deactivate her
select pg_temp.act_as('00000000-0000-4000-9b00-000000000a04');
select throws_ok($$ select public.set_staff_active('00000000-0000-4000-9b00-000000000a02', false) $$, '42501', 'staff_forbidden', 'not a parent');
select pg_temp.act_as('00000000-0000-4000-9b00-000000000a06');
select throws_ok($$ select public.set_staff_active('00000000-0000-4000-9b00-000000000a02', false) $$, '42501', 'staff_forbidden', 'not another nursery''s admin');
select pg_temp.act_as('00000000-0000-4000-9b00-000000000a01');
select throws_ok($$ select public.set_staff_active('00000000-0000-4000-9b00-000000000a07', false) $$, '42501', 'staff_forbidden', 'a branch admin does not deactivate another branch admin');
select throws_ok($$ select public.set_staff_active('00000000-0000-4000-9b00-000000000a01', false) $$, '22023', 'staff_not_yourself', 'nor herself');
select throws_ok($$ select public.set_staff_active('00000000-0000-4000-9b00-000000000a04', false) $$, 'P0002', 'staff_not_found', 'and a parent is not a staff member');

-- The branch admin deactivates the teacher.
select is(public.set_staff_active('00000000-0000-4000-9b00-000000000a02', false), '{"status": "inactive"}'::jsonb, 'the admin deactivates the teacher');
reset role;
select is((select status from public.users where id = '00000000-0000-4000-9b00-000000000a02'), 'inactive', 'her status is inactive');
select is((select banned_until from auth.users where id = '00000000-0000-4000-9b00-000000000a02'), 'infinity'::timestamptz, 'and she cannot sign in');

select pg_temp.act_as('00000000-0000-4000-9b00-000000000a02');
select is(pg_temp.teacher_sees(), '- false 0', 'deactivated, she is nobody: no role, no nursery, no events');
select throws_ok($$ update public.users set status = 'active' where id = auth.uid() $$, '42501', 'rbac_protected_column', 'and she cannot set herself active again');
select throws_ok($$ select public.set_staff_active('00000000-0000-4000-9b00-000000000a03', false) $$, '42501', 'staff_forbidden', 'nor act as staff');

-- HR reactivates her; HR does not deactivate an admin.
select pg_temp.act_as('00000000-0000-4000-9b00-000000000a03');
select throws_ok($$ select public.set_staff_active('00000000-0000-4000-9b00-000000000a01', false) $$, '42501', 'staff_forbidden', 'HR does not deactivate the branch admin');
select is(public.set_staff_active('00000000-0000-4000-9b00-000000000a02', true), '{"status": "active"}'::jsonb, 'HR reactivates the teacher');
reset role;
select is((select banned_until from auth.users where id = '00000000-0000-4000-9b00-000000000a02'), null, 'she may sign in again');
select pg_temp.act_as('00000000-0000-4000-9b00-000000000a02');
select is(pg_temp.teacher_sees(), 'teacher true 1', 'and has her access back');

select * from finish();
rollback;

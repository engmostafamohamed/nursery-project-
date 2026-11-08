-- Database test · The XO platform home page (get_xo_platform_dashboard): one nursery's row adds up its
-- active children, teachers, attendance on open days only, money collected this month from completed
-- payments and what its open invoices still owe; a deleted nursery is left out; only the platform's
-- super admin can call it. The dates are relative to today, so the test runs on any day.
-- Everything runs in one transaction that is rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(6);

insert into public.nurseries (id, name_ar, name_en, city, subscription_status, subscription_plan) values
  ('00000000-0000-4000-9100-00000000000a', 'حضانة أ', 'Dash Nursery A', 'Test City', 'trial', 'basic');
insert into public.nurseries (id, name_ar, name_en, deleted_at) values
  ('00000000-0000-4000-9100-00000000000d', 'حضانة محذوفة', 'Dash Deleted', now());

insert into auth.users (id, email) values
  ('00000000-0000-4000-9100-000000000a01', 'dash.xo@test.local'),
  ('00000000-0000-4000-9100-000000000a02', 'dash.admin@test.local'),
  ('00000000-0000-4000-9100-000000000a03', 'dash.teacher1@test.local'),
  ('00000000-0000-4000-9100-000000000a04', 'dash.teacher2@test.local'),
  ('00000000-0000-4000-9100-000000000a05', 'dash.parent@test.local');

update public.users u
   set role = v.role::public.user_role, nursery_id = v.nursery_id::uuid, name_en = v.name_en, status = 'active'
  from (values
    ('00000000-0000-4000-9100-000000000a01', 'xo_super_admin', null, 'XO'),
    ('00000000-0000-4000-9100-000000000a02', 'branch_admin', '00000000-0000-4000-9100-00000000000a', 'Admin'),
    ('00000000-0000-4000-9100-000000000a03', 'teacher', '00000000-0000-4000-9100-00000000000a', 'Teacher 1'),
    ('00000000-0000-4000-9100-000000000a04', 'teacher', '00000000-0000-4000-9100-00000000000a', 'Teacher 2'),
    ('00000000-0000-4000-9100-000000000a05', 'parent', '00000000-0000-4000-9100-00000000000a', 'Parent')
  ) as v(id, role, nursery_id, name_en)
 where u.id = v.id::uuid;

-- Laila and Adam enrolled long ago, Omar today; Sara is still pending. The deleted nursery has a child too.
insert into public.children (id, nursery_id, full_name_ar, full_name_en, dob, status, enrollment_date) values
  ('00000000-0000-4000-9100-0000000000c1', '00000000-0000-4000-9100-00000000000a', 'ليلى', 'Laila',
   (now() at time zone 'Africa/Cairo')::date - 900, 'active', '2025-09-01'),
  ('00000000-0000-4000-9100-0000000000c2', '00000000-0000-4000-9100-00000000000a', 'آدم', 'Adam',
   (now() at time zone 'Africa/Cairo')::date - 1500, 'active', '2025-09-01'),
  ('00000000-0000-4000-9100-0000000000c3', '00000000-0000-4000-9100-00000000000a', 'عمر', 'Omar',
   (now() at time zone 'Africa/Cairo')::date - 1200, 'active', (now() at time zone 'Africa/Cairo')::date),
  ('00000000-0000-4000-9100-0000000000c4', '00000000-0000-4000-9100-00000000000a', 'سارة', 'Sara',
   (now() at time zone 'Africa/Cairo')::date - 800, 'pending', null),
  ('00000000-0000-4000-9100-0000000000c9', '00000000-0000-4000-9100-00000000000d', 'محذوف', 'Gone',
   (now() at time zone 'Africa/Cairo')::date - 800, 'active', '2025-09-01');

-- Yesterday only Laila came (Omar was not enrolled yet): 1 of 2. Today Laila and Omar: 2 of 3.
-- Two days ago nobody was checked in: the nursery was closed, so the day counts nowhere.
alter table public.attendance_records disable trigger attendance_qr_working_hours_guard;
insert into public.attendance_records (child_id, attendance_date, check_in, check_in_method) values
  ('00000000-0000-4000-9100-0000000000c1', (now() at time zone 'Africa/Cairo')::date - 1, now() - interval '1 day', 'manual'),
  ('00000000-0000-4000-9100-0000000000c1', (now() at time zone 'Africa/Cairo')::date, now(), 'manual'),
  ('00000000-0000-4000-9100-0000000000c3', (now() at time zone 'Africa/Cairo')::date, now(), 'manual');
alter table public.attendance_records enable trigger attendance_qr_working_hours_guard;

insert into public.invoices (id, nursery_id, parent_id, amount, due_date, status, invoice_type, line_items_json) values
  -- Paid in full today.
  ('00000000-0000-4000-9100-000000000081', '00000000-0000-4000-9100-00000000000a', '00000000-0000-4000-9100-000000000a05',
   3000, (now() at time zone 'Africa/Cairo')::date, 'paid', 'monthly', '{}'::jsonb),
  -- 45 days late, 500 of it paid today: 1500 still owed.
  ('00000000-0000-4000-9100-000000000082', '00000000-0000-4000-9100-00000000000a', '00000000-0000-4000-9100-000000000a05',
   2000, (now() at time zone 'Africa/Cairo')::date - 45, 'overdue', 'monthly', '{}'::jsonb),
  -- Not due yet; a failed payment does not count.
  ('00000000-0000-4000-9100-000000000083', '00000000-0000-4000-9100-00000000000a', '00000000-0000-4000-9100-000000000a05',
   1000, (now() at time zone 'Africa/Cairo')::date + 5, 'pending', 'monthly', '{}'::jsonb),
  -- Cancelled: counts nowhere.
  ('00000000-0000-4000-9100-000000000084', '00000000-0000-4000-9100-00000000000a', '00000000-0000-4000-9100-000000000a05',
   999, (now() at time zone 'Africa/Cairo')::date - 45, 'cancelled', 'monthly', '{}'::jsonb);

insert into public.payments (invoice_id, amount, method, status, paid_at) values
  ('00000000-0000-4000-9100-000000000081', 3000, 'cash', 'completed', now()),
  ('00000000-0000-4000-9100-000000000082', 500, 'instapay', 'completed', now()),
  ('00000000-0000-4000-9100-000000000083', 700, 'card', 'failed', now());

create function pg_temp.act_as(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end;
$$;

-- ---------------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-9100-000000000a01');
select set_config('dash.out', public.get_xo_platform_dashboard()::text, true);
reset role;

select is(
  (select format('children=%s teachers=%s attendance=%s/%s collected=%s owed=%s overdue=%s %s/%s/%s',
                 r ->> 'active_children', r ->> 'teachers', r ->> 'present_30', r ->> 'expected_30',
                 r ->> 'collected_this_month', r ->> 'outstanding', r ->> 'overdue_count',
                 r ->> 'city', r ->> 'subscription_status', r ->> 'subscription_plan')
     from jsonb_array_elements(current_setting('dash.out')::jsonb -> 'by_nursery') r
    where r ->> 'id' = '00000000-0000-4000-9100-00000000000a'),
  'children=3 teachers=2 attendance=3/5 collected=3500.00 owed=2500.00 overdue=1 Test City/trial/basic',
  'a nursery''s row: active children, teachers, attendance on open days, money collected this month and still owed'
);

select ok(
  not exists (
    select 1 from jsonb_array_elements(current_setting('dash.out')::jsonb -> 'by_nursery') r
     where r ->> 'id' = '00000000-0000-4000-9100-00000000000d'
  ),
  'a deleted nursery is left out'
);

select is(
  (current_setting('dash.out')::jsonb -> 'nurseries' ->> 'total')::int,
  (select count(*)::int from public.nurseries where deleted_at is null),
  'the nursery count leaves deleted nurseries out'
);

-- ---------------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-9100-000000000a02');
select throws_ok(
  $$ select public.get_xo_platform_dashboard() $$,
  '42501', 'xo_dashboard_forbidden',
  'a nursery admin cannot read the platform'
);

select pg_temp.act_as('00000000-0000-4000-9100-000000000a03');
select throws_ok(
  $$ select public.get_xo_platform_dashboard() $$,
  '42501', 'xo_dashboard_forbidden',
  'nor a teacher'
);

reset role;
select ok(
  not has_function_privilege('anon', 'public.get_xo_platform_dashboard()', 'execute'),
  'signed-out visitors cannot call it'
);

select * from finish();
rollback;

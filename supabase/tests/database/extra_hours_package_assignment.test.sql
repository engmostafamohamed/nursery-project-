-- Database test · An extra-hours package the nursery assigns is billed (admin_assign_extra_hours_package):
-- one active package per child; a pending invoice to the paying parent at the package price less its
-- live deal, none for a free package; only the nursery's admins and the staff allowed packages:create
-- can assign, and nobody inserts packages directly any more. The packages page counts the invoice.
-- Everything runs in one transaction that is rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(17);

insert into public.nurseries (id, name_ar, name_en) values
  ('00000000-0000-4000-a100-00000000000a', 'حضانة أ', 'Nursery A'),
  ('00000000-0000-4000-a100-00000000000b', 'حضانة ب', 'Nursery B');

update public.nursery_settings set invoice_due_days = 10 where nursery_id = '00000000-0000-4000-a100-00000000000a';

insert into auth.users (id, email) values
  ('00000000-0000-4000-a100-000000000a01', 'xh.admin@test.local'),
  ('00000000-0000-4000-a100-000000000a02', 'xh.teacher@test.local'),
  ('00000000-0000-4000-a100-000000000a03', 'xh.finance@test.local'),
  ('00000000-0000-4000-a100-000000000a06', 'xh.mona@test.local'),
  ('00000000-0000-4000-a100-000000000a07', 'xh.karim@test.local'),
  ('00000000-0000-4000-a100-000000000a08', 'xh.huda@test.local'),
  ('00000000-0000-4000-a100-000000000b01', 'xh.admin.b@test.local');

update public.users u
   set role = v.role::public.user_role, nursery_id = v.nursery_id::uuid, name_ar = v.name_en, name_en = v.name_en, status = 'active'
  from (values
    ('00000000-0000-4000-a100-000000000a01', 'branch_admin', '00000000-0000-4000-a100-00000000000a', 'Head Admin'),
    ('00000000-0000-4000-a100-000000000a02', 'teacher',      '00000000-0000-4000-a100-00000000000a', 'Teacher'),
    ('00000000-0000-4000-a100-000000000a03', 'manager',      '00000000-0000-4000-a100-00000000000a', 'Finance Manager'),
    ('00000000-0000-4000-a100-000000000a06', 'parent',       '00000000-0000-4000-a100-00000000000a', 'Mona'),
    ('00000000-0000-4000-a100-000000000a07', 'parent',       '00000000-0000-4000-a100-00000000000a', 'Karim'),
    ('00000000-0000-4000-a100-000000000a08', 'parent',       '00000000-0000-4000-a100-00000000000a', 'Huda'),
    ('00000000-0000-4000-a100-000000000b01', 'branch_admin', '00000000-0000-4000-a100-00000000000b', 'Admin B')
  ) as v(id, role, nursery_id, name_en)
 where u.id = v.id::uuid;
update public.users set department = 'finance' where id = '00000000-0000-4000-a100-000000000a03';

-- Laila: Mona is her primary parent, Karim her second. Adam has no parent on file yet.
insert into public.children (id, nursery_id, full_name_ar, full_name_en, dob, status, enrollment_date) values
  ('00000000-0000-4000-a100-0000000000c1', '00000000-0000-4000-a100-00000000000a', 'ليلى', 'Laila', '2023-01-01', 'active', '2026-09-01'),
  ('00000000-0000-4000-a100-0000000000c2', '00000000-0000-4000-a100-00000000000a', 'آدم', 'Adam', '2023-01-01', 'active', '2026-09-01');

insert into public.parent_children (parent_id, child_id, is_primary) values
  ('00000000-0000-4000-a100-000000000a07', '00000000-0000-4000-a100-0000000000c1', false),
  ('00000000-0000-4000-a100-000000000a06', '00000000-0000-4000-a100-0000000000c1', true);

insert into public.deals (id, nursery_id, name_ar, name_en, discount_type, discount_value, active) values
  ('00000000-0000-4000-a100-0000000000d1', '00000000-0000-4000-a100-00000000000a', 'خصم ١٠٪', '10% off', 'percentage', 10, true);

insert into public.packages (id, nursery_id, name_ar, name_en, coverage_type, included_hours, price, active, deal_id) values
  ('00000000-0000-4000-a100-0000000000e1', '00000000-0000-4000-a100-00000000000a', '١٠ ساعات', '10 hours', 'hours_quota', 10, 600, true, '00000000-0000-4000-a100-0000000000d1'),
  ('00000000-0000-4000-a100-0000000000e2', '00000000-0000-4000-a100-00000000000a', 'تجربة', 'Trial', 'hours_quota', 2, 0, true, null),
  ('00000000-0000-4000-a100-0000000000e3', '00000000-0000-4000-a100-00000000000a', 'قديمة', 'Old', 'hours_quota', 5, 500, false, null),
  ('00000000-0000-4000-a100-0000000000eb', '00000000-0000-4000-a100-00000000000b', 'باقة ب', 'Pack B', 'hours_quota', 5, 400, true, null);

create function pg_temp.act_as(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end;
$$;

-- What the last assignment returned.
create function pg_temp.assigned(p_key text) returns uuid
language sql as $$ select (current_setting('test.assigned')::jsonb ->> p_key)::uuid $$;

-- ---------------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-a100-000000000a01');
select set_config('test.assigned', public.admin_assign_extra_hours_package(
  '00000000-0000-4000-a100-0000000000c1', '00000000-0000-4000-a100-0000000000e1')::text, true);

select is(
  (select format('%s %s %s %s due+%s', i.invoice_type, i.status, i.amount,
                 case when i.parent_id = '00000000-0000-4000-a100-000000000a06' then 'Mona' else 'someone else' end,
                 i.due_date - current_date)
     from public.invoices i where i.id = pg_temp.assigned('invoiceId')),
  'other pending 540.00 Mona due+10',
  'a paid package bills the primary parent: its price less the live deal, due after the nursery''s days'
);

select is(
  (select string_agg(it ->> 'kind' || ' ' || (it ->> 'total'), ', ' order by n)
     from public.invoices i, jsonb_array_elements(i.line_items_json -> 'items') with ordinality as t(it, n)
    where i.id = pg_temp.assigned('invoiceId')),
  'extra_hours_package 600.00, discount -60.00',
  'the invoice lines: the package and the deal'
);

select is(
  (select i.line_items_json ->> 'child_package_id' from public.invoices i where i.id = pg_temp.assigned('invoiceId')),
  pg_temp.assigned('childPackageId')::text,
  'the invoice names the assignment it bills'
);

select is(
  (select format('%s %s', s.invoices, s.billed)
     from public.get_package_subscriptions('00000000-0000-4000-a100-00000000000a') s
    where s.subscription_id = pg_temp.assigned('childPackageId')),
  '1 540.00',
  'the packages page counts the invoice to its package'
);

select set_config('test.assigned', public.admin_assign_extra_hours_package(
  '00000000-0000-4000-a100-0000000000c1', '00000000-0000-4000-a100-0000000000e2')::text, true);

select is(pg_temp.assigned('invoiceId'), null, 'a free package gets no invoice');

select results_eq(
  $$ select package_id from public.child_packages
      where child_id = '00000000-0000-4000-a100-0000000000c1' and status = 'active' $$,
  $$ values ('00000000-0000-4000-a100-0000000000e2'::uuid) $$,
  'one active package per child: the new one replaces the old'
);

select set_config('test.assigned', public.admin_assign_extra_hours_package(
  '00000000-0000-4000-a100-0000000000c1', '00000000-0000-4000-a100-0000000000e1', '00000000-0000-4000-a100-000000000a07')::text, true);

select is(
  (select i.parent_id from public.invoices i where i.id = pg_temp.assigned('invoiceId')),
  '00000000-0000-4000-a100-000000000a07'::uuid,
  'the parent the nursery picks pays'
);

select throws_ok(
  $$ select public.admin_assign_extra_hours_package('00000000-0000-4000-a100-0000000000c1', '00000000-0000-4000-a100-0000000000e1',
                                                    '00000000-0000-4000-a100-000000000a08') $$,
  '22023', 'extra_hours_parent_not_linked',
  'a parent who is not the child''s cannot be billed'
);

select throws_ok(
  $$ select public.admin_assign_extra_hours_package('00000000-0000-4000-a100-0000000000c2', '00000000-0000-4000-a100-0000000000e1') $$,
  '22023', 'extra_hours_no_parent',
  'a paid package needs a parent to bill'
);

select lives_ok(
  $$ select public.admin_assign_extra_hours_package('00000000-0000-4000-a100-0000000000c2', '00000000-0000-4000-a100-0000000000e2') $$,
  'a free one does not'
);

select throws_ok(
  $$ select public.admin_assign_extra_hours_package('00000000-0000-4000-a100-0000000000c1', '00000000-0000-4000-a100-0000000000e3') $$,
  '42704', 'extra_hours_package_not_found',
  'a package no longer offered cannot be assigned'
);

select throws_ok(
  $$ select public.admin_assign_extra_hours_package('00000000-0000-4000-a100-0000000000c1', '00000000-0000-4000-a100-0000000000eb') $$,
  '42704', 'extra_hours_package_not_found',
  'nor another nursery''s package'
);

select throws_ok(
  $$ insert into public.child_packages (package_id, child_id, nursery_id, status)
     values ('00000000-0000-4000-a100-0000000000e1', '00000000-0000-4000-a100-0000000000c1', '00000000-0000-4000-a100-00000000000a', 'active') $$,
  '42501', null,
  'nobody inserts a package directly: it would skip the invoice'
);

select pg_temp.act_as('00000000-0000-4000-a100-000000000a03');
select lives_ok(
  $$ select public.admin_assign_extra_hours_package('00000000-0000-4000-a100-0000000000c1', '00000000-0000-4000-a100-0000000000e1') $$,
  'a manager allowed packages:create assigns'
);

select pg_temp.act_as('00000000-0000-4000-a100-000000000a02');
select throws_ok(
  $$ select public.admin_assign_extra_hours_package('00000000-0000-4000-a100-0000000000c1', '00000000-0000-4000-a100-0000000000e1') $$,
  '42501', 'extra_hours_forbidden',
  'a teacher without it cannot'
);

select pg_temp.act_as('00000000-0000-4000-a100-000000000b01');
select throws_ok(
  $$ select public.admin_assign_extra_hours_package('00000000-0000-4000-a100-0000000000c1', '00000000-0000-4000-a100-0000000000e1') $$,
  '42501', 'extra_hours_forbidden',
  'nor another nursery''s admin'
);

reset role;
select ok(
  not has_function_privilege('anon', 'public.admin_assign_extra_hours_package(uuid, uuid, uuid)', 'execute'),
  'signed-out visitors cannot call it'
);

select * from finish();
rollback;

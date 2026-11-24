-- Database test · The platform admin's nurseries list and a nursery's settings.
-- get_xo_nursery_list: one row per nursery (deleted ones too) with its users, children, active
-- children and invoices counted; only the platform's super admin can call it.
-- nursery_settings: the platform's super admin reads and changes any nursery's settings, a chain's
-- super admin those of their chain's branches only, and a branch's own staff still read theirs.
-- Every nursery gets its settings row when it is made.
-- Everything runs in one transaction that is rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(11);

-- Two branches of one chain, plus a deleted nursery outside it.
insert into public.chains (id, name) values ('00000000-0000-4000-9124-00000000000c', 'List Chain');
insert into public.nurseries (id, chain_id, name_ar, name_en, subscription_status) values
  ('00000000-0000-4000-9124-00000000000a', '00000000-0000-4000-9124-00000000000c', 'فرع أ', 'List Branch A', 'active'),
  ('00000000-0000-4000-9124-00000000000b', '00000000-0000-4000-9124-00000000000c', 'فرع ب', 'List Branch B', 'trial');
insert into public.nurseries (id, name_ar, name_en, deleted_at) values
  ('00000000-0000-4000-9124-00000000000d', 'حضانة محذوفة', 'List Deleted', now());

insert into auth.users (id, email) values
  ('00000000-0000-4000-9124-000000000a01', 'list.xo@test.local'),
  ('00000000-0000-4000-9124-000000000a02', 'list.admin@test.local'),
  ('00000000-0000-4000-9124-000000000a03', 'list.teacher@test.local'),
  ('00000000-0000-4000-9124-000000000a04', 'list.parent@test.local'),
  ('00000000-0000-4000-9124-000000000a05', 'list.chain@test.local'),
  ('00000000-0000-4000-9124-000000000a06', 'list.stranger@test.local');
update public.users u
   set role = v.role::public.user_role, nursery_id = v.nursery::uuid, name_en = v.name_en, status = 'active',
       chain_id = case when v.role = 'chain_super_admin' then '00000000-0000-4000-9124-00000000000c'::uuid end
  from (values
    ('00000000-0000-4000-9124-000000000a01', 'xo_super_admin', null, 'XO'),
    ('00000000-0000-4000-9124-000000000a02', 'branch_admin', '00000000-0000-4000-9124-00000000000a', 'Admin'),
    ('00000000-0000-4000-9124-000000000a03', 'teacher', '00000000-0000-4000-9124-00000000000a', 'Teacher'),
    ('00000000-0000-4000-9124-000000000a04', 'parent', '00000000-0000-4000-9124-00000000000a', 'Parent'),
    ('00000000-0000-4000-9124-000000000a05', 'chain_super_admin', '00000000-0000-4000-9124-00000000000a', 'Chain'),
    ('00000000-0000-4000-9124-000000000a06', 'teacher', '00000000-0000-4000-9124-00000000000d', 'Stranger')
  ) as v(id, role, nursery, name_en)
 where u.id = v.id::uuid;

-- Branch A: two active children and one pending, one invoice.
insert into public.children (nursery_id, full_name_ar, full_name_en, dob, status) values
  ('00000000-0000-4000-9124-00000000000a', 'ليلى', 'Laila', current_date - 900, 'active'),
  ('00000000-0000-4000-9124-00000000000a', 'آدم', 'Adam', current_date - 1200, 'active'),
  ('00000000-0000-4000-9124-00000000000a', 'سارة', 'Sara', current_date - 800, 'pending');
insert into public.invoices (nursery_id, parent_id, amount, due_date, status, invoice_type, line_items_json) values
  ('00000000-0000-4000-9124-00000000000a', '00000000-0000-4000-9124-000000000a04', 1000, current_date, 'pending', 'monthly', '{}'::jsonb);

create function pg_temp.act_as(p_user uuid) returns void
language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end;
$$;

-- The list -------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-9124-000000000a01');

select is(
  (select format('users=%s children=%s active=%s invoices=%s', user_count, child_count, active_child_count, invoice_count)
     from public.get_xo_nursery_list() where id = '00000000-0000-4000-9124-00000000000a'),
  'users=4 children=3 active=2 invoices=1',
  'a nursery''s row counts its users, children, active children and invoices'
);

select is(
  (select format('%s users=%s', case when deleted_at is not null then 'deleted' else 'live' end, user_count)
     from public.get_xo_nursery_list() where id = '00000000-0000-4000-9124-00000000000d'),
  'deleted users=1',
  'a deleted nursery is listed too, marked deleted'
);

select pg_temp.act_as('00000000-0000-4000-9124-000000000a02');
select throws_ok(
  $$ select * from public.get_xo_nursery_list() $$,
  '42501', 'xo_nursery_list_forbidden',
  'a branch admin cannot read the platform''s list'
);

reset role;
select ok(
  not has_function_privilege('anon', 'public.get_xo_nursery_list()', 'execute'),
  'signed-out visitors cannot call it'
);

-- Settings ------------------------------------------------------------------------------------
select is(
  (select count(*)::int from public.nursery_settings
    where nursery_id in ('00000000-0000-4000-9124-00000000000a', '00000000-0000-4000-9124-00000000000b',
                         '00000000-0000-4000-9124-00000000000d')),
  3,
  'every new nursery gets its settings row'
);

select pg_temp.act_as('00000000-0000-4000-9124-000000000a01');
select is(
  (select count(*)::int from public.nursery_settings
    where nursery_id in ('00000000-0000-4000-9124-00000000000a', '00000000-0000-4000-9124-00000000000d')),
  2,
  'the platform''s super admin reads any nursery''s settings'
);

with changed as (
  update public.nursery_settings set late_pickup_grace_minutes = 7
   where nursery_id = '00000000-0000-4000-9124-00000000000b'
  returning 1
)
select is((select count(*)::int from changed), 1, 'and changes them');

select pg_temp.act_as('00000000-0000-4000-9124-000000000a05');
select is(
  (select string_agg(n.name_en, ', ' order by n.name_en)
     from public.nursery_settings s join public.nurseries n on n.id = s.nursery_id
    where s.nursery_id in ('00000000-0000-4000-9124-00000000000a', '00000000-0000-4000-9124-00000000000b',
                           '00000000-0000-4000-9124-00000000000d')),
  'List Branch A, List Branch B',
  'a chain''s super admin reads both branches'' settings, not another nursery''s'
);

with changed as (
  update public.nursery_settings set late_pickup_grace_minutes = 9
   where nursery_id = '00000000-0000-4000-9124-00000000000d'
  returning 1
)
select is((select count(*)::int from changed), 0, 'nor changes another nursery''s');

select pg_temp.act_as('00000000-0000-4000-9124-000000000a03');
select is(
  (select count(*)::int from public.nursery_settings where nursery_id = '00000000-0000-4000-9124-00000000000a'),
  1,
  'a branch''s teacher still reads their own nursery''s settings'
);

select pg_temp.act_as('00000000-0000-4000-9124-000000000a06');
select is(
  (select count(*)::int from public.nursery_settings where nursery_id = '00000000-0000-4000-9124-00000000000a'),
  0,
  'a teacher of another nursery reads none of them'
);

reset role;
select * from finish();
rollback;

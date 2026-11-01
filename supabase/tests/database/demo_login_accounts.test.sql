-- Database test · The login page's demo panel (get_demo_login_accounts) lists only the active seed demo
-- accounts (demo-…@xonursery.com): never a staff member onboarded with a placeholder email, nor any
-- other address. It is callable before sign-in.
-- Everything runs in one transaction that is rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(4);

insert into public.nurseries (id, name_ar, name_en) values
  ('00000000-0000-4000-a200-00000000000a', 'حضانة أ', 'Nursery A');

insert into auth.users (id, email) values
  ('00000000-0000-4000-a200-000000000a01', 'demo-pgtap-teacher@xonursery.com'),
  ('00000000-0000-4000-a200-000000000a02', 'demo-pgtap-retired@xonursery.com'),
  ('00000000-0000-4000-a200-000000000a03', 'pgtap-owner@xonursery.com'),
  ('00000000-0000-4000-a200-000000000a04', 'pgtap-nadia@staff.placeholder.xo');

update public.users u
   set role = 'teacher', nursery_id = '00000000-0000-4000-a200-00000000000a', name_ar = u.email, name_en = u.email,
       status = case when u.email like 'demo-pgtap-retired%' then 'inactive' else 'active' end
 where u.id in ('00000000-0000-4000-a200-000000000a01', '00000000-0000-4000-a200-000000000a02',
                '00000000-0000-4000-a200-000000000a03', '00000000-0000-4000-a200-000000000a04');

set local role anon;

select results_eq(
  $$ select email from public.get_demo_login_accounts() where email like '%pgtap%' $$,
  $$ values ('demo-pgtap-teacher@xonursery.com'::text) $$,
  'only the active seed demo account is listed'
);

select is(
  (select count(*)::integer from public.get_demo_login_accounts() where email like '%@staff.placeholder.xo'),
  0,
  'no staff member onboarded with a placeholder email'
);

select is(
  (select count(*)::integer from public.get_demo_login_accounts() where email not like 'demo-%@xonursery.com'),
  0,
  'no address outside the demo seed'
);

reset role;
select ok(
  has_function_privilege('anon', 'public.get_demo_login_accounts()', 'execute'),
  'the login page can read it before sign-in'
);

select * from finish();
rollback;

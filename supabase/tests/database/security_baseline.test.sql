-- Database test · the rules every change keeps: each public table has row level security on and
-- sends live updates (but the logs kept out on purpose); each function that runs as its owner fixes
-- its search path; the signed-out reach none of the children's
-- routines and milestones, no family's email from a username, and only one nursery's class names
-- for the inquiry form; the staff reach the routines of their nursery only. Rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(10);

select is(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '-')
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity),
  '-', 'every public table has row level security on');

select is(
  (select coalesce(string_agg(p.proname, ', ' order by p.proname), '-')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')),
  '-', 'every function that runs as its owner fixes its search path');

select ok(not exists (select 1 from pg_proc where proname = 'auth_email_for_username'), 'no function hands out an email for a username');

select is(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '-')
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relname not in (select public.realtime_skipped_tables())
      and not exists (select 1 from pg_publication_tables p
                       where p.pubname = 'supabase_realtime' and p.schemaname = 'public' and p.tablename = c.relname)),
  '-', 'every table the screens read sends live updates (supabase_realtime)');

-- A nursery with a class, a child and a routine.
insert into public.nurseries (id, name_ar, name_en) values
  ('00000000-0000-4000-9c00-00000000000a', 'حضانة', 'Baseline Nursery'),
  ('00000000-0000-4000-9c00-00000000000b', 'أخرى', 'Other Nursery');
insert into public.classes (id, nursery_id, name_ar, name_en, capacity, room_number) values
  ('00000000-0000-4000-9c00-0000000000b1', '00000000-0000-4000-9c00-00000000000a', 'العصافير', 'Birds', 20, 'R1');
insert into public.children (id, nursery_id, class_id, full_name_ar, full_name_en, dob, status, enrollment_date) values
  ('00000000-0000-4000-9c00-0000000000c1', '00000000-0000-4000-9c00-00000000000a', '00000000-0000-4000-9c00-0000000000b1', 'ليلى', 'Laila', '2022-01-01', 'active', '2026-01-01');
insert into public.child_routine_items (nursery_id, child_id, title, category, scheduled_time) values
  ('00000000-0000-4000-9c00-00000000000a', '00000000-0000-4000-9c00-0000000000c1', 'Nap', 'nap', '12:00');
insert into auth.users (id, email) values
  ('00000000-0000-4000-9c00-000000000a01', 'baseline.teacher@test.local'),
  ('00000000-0000-4000-9c00-000000000a02', 'baseline.other@test.local');
update public.users u set role = 'teacher', nursery_id = v.nursery::uuid, status = 'active'
  from (values ('00000000-0000-4000-9c00-000000000a01', '00000000-0000-4000-9c00-00000000000a'),
               ('00000000-0000-4000-9c00-000000000a02', '00000000-0000-4000-9c00-00000000000b')) as v(id, nursery)
 where u.id = v.id::uuid;

-- Signed out
set local role anon;
select throws_ok($$ select count(*) from public.child_routine_items $$, '42501', null, 'signed out: no children''s routines');
select throws_ok($$ select count(*) from public.age_milestone_reminders $$, '42501', null, 'nor their milestone reminders');
select is((select count(*)::int from public.classes where nursery_id = '00000000-0000-4000-9c00-00000000000a'), 0, 'nor the classes table');
select is((select string_agg(name_en, ',') from public.inquiry_classes('00000000-0000-4000-9c00-00000000000a')), 'Birds', 'the inquiry form gets the class names of its nursery');
reset role;

-- Signed in staff
create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end;
$$;
select pg_temp.act_as('00000000-0000-4000-9c00-000000000a01');
select is((select count(*)::int from public.child_routine_items), 1, 'a teacher of the nursery reads its routines');
select pg_temp.act_as('00000000-0000-4000-9c00-000000000a02');
select is((select count(*)::int from public.child_routine_items), 0, 'another nursery''s teacher does not');

select * from finish();
rollback;

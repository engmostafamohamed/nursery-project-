-- Database test · the class roles the nursery works by, and the two screens that gained their own
-- permission. Every nursery gets a co-teacher and a nanny role; each carries what that work needs
-- and nothing beyond it; staff tasks no longer ride on the staff directory's permission, though
-- whoever could already reach the board keeps it. Rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(12);

-- What a role may do with a feature, as "view,create" — or '-' when it cannot reach it at all.
create function pg_temp.may(p_nursery uuid, p_role text, p_feature text) returns text language sql as $$
  select coalesce((
    select array_to_string(array(select unnest(rf.actions) order by 1), ',')
      from public.roles r
      join public.role_features rf on rf.role_id = r.id and rf.feature_id = p_feature
     where r.nursery_id = p_nursery and r.key = p_role
  ), '-')
$$;

insert into public.nurseries (id, name_ar, name_en) values
  ('00000000-0000-4000-9f14-00000000000a', 'حضانة', 'Roles Nursery');

-- 1-2 · both class roles reach every nursery, the new one included.
select is(
  (select count(*)::int from public.roles r
    where r.nursery_id = '00000000-0000-4000-9f14-00000000000a' and r.key in ('co_teacher', 'nanny')),
  2, 'a nursery has both class roles');
select is(
  (select count(*)::int from public.nurseries n
    where not exists (select 1 from public.roles r where r.nursery_id = n.id and r.key = 'co_teacher')),
  0, 'and so does every other nursery');

-- 3-6 · what a co-teacher may do: her class and its day, the reports she writes, and no more.
select is(pg_temp.may('00000000-0000-4000-9f14-00000000000a', 'co_teacher', 'daily_reports'), 'create,update,view',
          'a co-teacher writes the day''s reports');
select is(pg_temp.may('00000000-0000-4000-9f14-00000000000a', 'co_teacher', 'dashboard_attendance'), 'create,view',
          'and takes the register');
select is(pg_temp.may('00000000-0000-4000-9f14-00000000000a', 'co_teacher', 'classes'), 'view',
          'but only reads the class, never changes it');
select is(pg_temp.may('00000000-0000-4000-9f14-00000000000a', 'co_teacher', 'staff'), '-',
          'and cannot open the staff directory');

-- 7-9 · what a nanny may do: care beside the teachers, without writing home.
select is(pg_temp.may('00000000-0000-4000-9f14-00000000000a', 'nanny', 'dashboard_attendance'), 'create,view',
          'a nanny takes the register');
select is(pg_temp.may('00000000-0000-4000-9f14-00000000000a', 'nanny', 'daily_reports'), 'view',
          'reads the day''s reports without writing them');
select is(pg_temp.may('00000000-0000-4000-9f14-00000000000a', 'nanny', 'messages'), '-',
          'and does not message the families');

-- 10-11 · the two screens that gained a permission of their own.
select is(
  (select count(*)::int from public.features f where f.id in ('staff_tasks', 'reminders')),
  2, 'staff tasks and reminders are permissions of their own');
select isnt(pg_temp.may('00000000-0000-4000-9f14-00000000000a', 'co_teacher', 'staff_tasks'), '-',
            'a co-teacher still reaches the tasks set for her');

-- 12 · a role that could open the staff directory keeps the tasks board it used to reach through it.
select is(
  (select count(*)::int
     from public.role_features staff_rf
    where staff_rf.feature_id = 'staff'
      and not exists (
        select 1 from public.role_features t
         where t.role_id = staff_rf.role_id and t.feature_id = 'staff_tasks'
      )),
  0, 'every role that could open the staff directory keeps the tasks board');

select * from finish();
rollback;

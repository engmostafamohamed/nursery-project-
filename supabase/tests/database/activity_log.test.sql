-- Database test · the record of what was done to a class or to a member of staff.
--
-- Opening, renaming and closing a class, putting someone on a team and taking them off, a member
-- of staff changing role or being deactivated, and an absence recorded — each leaves one line that
-- names who did it and what changed. A touched timestamp leaves none. Only the nursery's own
-- admins and managers read it, and nobody writes it by hand. Rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(14);

create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end;
$$;
-- The lines recorded for this nursery, as "entity:action", newest last.
create function pg_temp.lines() returns text language sql as $$
  select coalesce(string_agg(entity || ':' || action, ', ' order by created_at, entity), '-')
    from public.activity_log where nursery_id = '00000000-0000-4000-9f15-00000000000a'
$$;
create function pg_temp.count_of(p_entity text) returns int language sql as $$
  select count(*)::int from public.activity_log
   where nursery_id = '00000000-0000-4000-9f15-00000000000a' and entity = p_entity
$$;

insert into public.nurseries (id, name_ar, name_en) values ('00000000-0000-4000-9f15-00000000000a', 'حضانة', 'Log Nursery');
insert into auth.users (id, email) values
  ('00000000-0000-4000-9f15-000000000a01', 'lg.admin@test.local'),
  ('00000000-0000-4000-9f15-000000000a02', 'lg.teacher@test.local'),
  ('00000000-0000-4000-9f15-000000000a03', 'lg.parent@test.local');
update public.users u
   set role = v.role::public.user_role, nursery_id = '00000000-0000-4000-9f15-00000000000a',
       name_en = v.name_en, name_ar = v.name_en, status = 'active'
  from (values
    ('00000000-0000-4000-9f15-000000000a01', 'branch_admin', 'Admin'),
    ('00000000-0000-4000-9f15-000000000a02', 'teacher', 'Sara'),
    ('00000000-0000-4000-9f15-000000000a03', 'parent', 'Mona')
  ) as v(id, role, name_en)
 where u.id = v.id::uuid;

-- Building the fixture is itself staff activity and is recorded; the test is about what follows,
-- so the log starts empty here.
delete from public.activity_log where nursery_id = '00000000-0000-4000-9f15-00000000000a';

-- Everything from here is done by the admin, so the lines name her.
select pg_temp.act_as('00000000-0000-4000-9f15-000000000a01');

-- 1-2 · a class opened and renamed.
insert into public.classes (id, nursery_id, name_ar, name_en) values
  ('00000000-0000-4000-9f15-0000000000b1', '00000000-0000-4000-9f15-00000000000a', 'الفراشات', 'Butterflies');
select is(pg_temp.count_of('class'), 1, 'opening a class is recorded');
update public.classes set name_en = 'Little Butterflies' where id = '00000000-0000-4000-9f15-0000000000b1';
select is(pg_temp.count_of('class'), 2, 'renaming it is recorded too');

-- 3 · the line says what changed, and who did it.
select is(
  (select summary -> 'changed' -> 'name_en' ->> 'to' from public.activity_log
    where entity = 'class' and action = 'updated' and nursery_id = '00000000-0000-4000-9f15-00000000000a'),
  'Little Butterflies', 'the line holds the new name');
select is(
  (select actor_id from public.activity_log where entity = 'class' and action = 'updated'
     and nursery_id = '00000000-0000-4000-9f15-00000000000a'),
  '00000000-0000-4000-9f15-000000000a01'::uuid, 'and who renamed it');

-- 5 · a touched timestamp alone is not worth a line.
select is((select count(*)::int from public.activity_log where nursery_id = '00000000-0000-4000-9f15-00000000000a'), 2, 'nothing else yet');
update public.classes set updated_at = now() where id = '00000000-0000-4000-9f15-0000000000b1';
select is((select count(*)::int from public.activity_log where nursery_id = '00000000-0000-4000-9f15-00000000000a'), 2,
          'a touched timestamp leaves no line');

-- 7-8 · a team change, and the class it was on.
insert into public.class_staff (class_id, user_id, role) values
  ('00000000-0000-4000-9f15-0000000000b1', '00000000-0000-4000-9f15-000000000a02', 'co_teacher');
select is(pg_temp.count_of('class_team'), 1, 'putting someone on a team is recorded');
select is(
  (select summary ->> 'role' from public.activity_log where entity = 'class_team' and action = 'created'),
  'co_teacher', 'with the place she was given');

-- 9-10 · a member of staff deactivated, and an absence recorded.
select pg_temp.act_as('00000000-0000-4000-9f15-000000000a02');
update public.users set phone = '+201000000001' where id = '00000000-0000-4000-9f15-000000000a02';
select pg_temp.act_as('00000000-0000-4000-9f15-000000000a01');
select is(pg_temp.count_of('staff'), 1, 'a member of staff changing her own details is recorded');
select public.report_staff_absence('00000000-0000-4000-9f15-000000000a02', current_date, current_date, 'sick');
select is(pg_temp.count_of('staff_absence'), 1, 'an absence is recorded');

-- 11 · the whole story reads in order.
select is(pg_temp.lines(),
          'class:created, class:updated, class_team:created, staff:updated, staff_absence:created',
          'the log reads in the order things happened');

-- 12 · the nursery's admin reads it through the function.
select is(
  (select jsonb_array_length(public.get_activity_log('00000000-0000-4000-9f15-00000000000a') -> 'lines')),
  5, 'the admin reads every line');

-- 13 · narrowing to the staff leaves the class lines out.
select is(
  (select jsonb_array_length(public.get_activity_log('00000000-0000-4000-9f15-00000000000a', 'staff') -> 'lines')),
  2, 'narrowing to staff leaves the class lines out');

-- 14 · a parent cannot read it at all.
select pg_temp.act_as('00000000-0000-4000-9f15-000000000a03');
select throws_ok(
  $$ select public.get_activity_log('00000000-0000-4000-9f15-00000000000a') $$,
  '42501', 'activity_forbidden', 'a parent cannot read the log');

select * from finish();
rollback;

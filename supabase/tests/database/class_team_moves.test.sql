-- Database test · moving a teacher from one class to another, and what she may then open.
--
-- The admin moves a co-teacher to another class: she leaves the first, joins the second, both
-- changes are logged, and she is told once with a notice that leads to the new class. Moving into
-- the lead's place pushes the teacher who held it out. A move to the same class, to a class of
-- another nursery, of someone who is not on the first class, or by a teacher, is refused. The
-- teacher may open the class she is on the team of, and no other. Rolled back.
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
-- Where a teacher stands, as "class:role".
create function pg_temp.place(p_user uuid) returns text language sql as $$
  select coalesce(string_agg(c.name_en || ':' || cs.role::text, ', ' order by c.name_en), '-')
    from public.class_staff cs join public.classes c on c.id = cs.class_id
   where cs.user_id = p_user
$$;

insert into public.nurseries (id, name_ar, name_en) values
  ('00000000-0000-4000-9f13-00000000000a', 'حضانة', 'Move Nursery'),
  ('00000000-0000-4000-9f13-00000000000b', 'حضانة ٢', 'Far Nursery');
insert into auth.users (id, email) values
  ('00000000-0000-4000-9f13-000000000a01', 'mv.admin@test.local'),
  ('00000000-0000-4000-9f13-000000000a02', 'mv.sara@test.local'),
  ('00000000-0000-4000-9f13-000000000a03', 'mv.nadia@test.local'),
  ('00000000-0000-4000-9f13-000000000a04', 'mv.hoda@test.local'),
  ('00000000-0000-4000-9f13-000000000a05', 'mv.far@test.local');
update public.users u
   set role = v.role::public.user_role, nursery_id = v.nursery::uuid, name_en = v.name_en, name_ar = v.name_en, status = 'active'
  from (values
    ('00000000-0000-4000-9f13-000000000a01', 'branch_admin', 'Admin',  '00000000-0000-4000-9f13-00000000000a'),
    ('00000000-0000-4000-9f13-000000000a02', 'teacher',      'Sara',   '00000000-0000-4000-9f13-00000000000a'),
    ('00000000-0000-4000-9f13-000000000a03', 'teacher',      'Nadia',  '00000000-0000-4000-9f13-00000000000a'),
    ('00000000-0000-4000-9f13-000000000a04', 'teacher',      'Hoda',   '00000000-0000-4000-9f13-00000000000a'),
    ('00000000-0000-4000-9f13-000000000a05', 'teacher',      'Far',    '00000000-0000-4000-9f13-00000000000b')
  ) as v(id, role, name_en, nursery)
 where u.id = v.id::uuid;

insert into public.classes (id, nursery_id, name_ar, name_en) values
  ('00000000-0000-4000-9f13-0000000000b1', '00000000-0000-4000-9f13-00000000000a', 'الفراشات', 'Butterflies'),
  ('00000000-0000-4000-9f13-0000000000b2', '00000000-0000-4000-9f13-00000000000a', 'النحل', 'Bees'),
  ('00000000-0000-4000-9f13-0000000000b3', '00000000-0000-4000-9f13-00000000000b', 'بعيد', 'Far Class');
insert into public.class_staff (class_id, user_id, role) values
  ('00000000-0000-4000-9f13-0000000000b1', '00000000-0000-4000-9f13-000000000a02', 'co_teacher'),
  ('00000000-0000-4000-9f13-0000000000b2', '00000000-0000-4000-9f13-000000000a03', 'lead');

-- 1-5 · the admin moves Sara from Butterflies to Bees, keeping her a co-teacher.
select pg_temp.act_as('00000000-0000-4000-9f13-000000000a01');
select is(pg_temp.place('00000000-0000-4000-9f13-000000000a02'), 'Butterflies:co_teacher', 'Sara starts as the co-teacher of Butterflies');
select lives_ok(
  $$ select public.move_class_team_member('00000000-0000-4000-9f13-0000000000b1', '00000000-0000-4000-9f13-0000000000b2', '00000000-0000-4000-9f13-000000000a02', 'co_teacher') $$,
  'the admin moves her to another class');
select is(pg_temp.place('00000000-0000-4000-9f13-000000000a02'), 'Bees:co_teacher', 'she is now on Bees only');
select is(
  (select string_agg(c.name_en || ' ' || tc.action, ', ' order by c.name_en)
     from public.class_team_changes tc join public.classes c on c.id = tc.class_id
    where tc.user_id = '00000000-0000-4000-9f13-000000000a02'),
  'Bees assigned, Butterflies removed',
  'both halves of the move are logged');
select is(
  (select count(*)::int from public.notifications n
    where n.user_id = '00000000-0000-4000-9f13-000000000a02' and n.template_key = 'class_team_moved'),
  1, 'she is told once');
select is(
  (select n.action_link from public.notifications n
    where n.user_id = '00000000-0000-4000-9f13-000000000a02' and n.template_key = 'class_team_moved'),
  '/teacher/classes/00000000-0000-4000-9f13-0000000000b2', 'and the notice leads to the class she moved to');

-- 6-8 · moving into the lead's place pushes out whoever held it.
select lives_ok(
  $$ select public.move_class_team_member('00000000-0000-4000-9f13-0000000000b2', '00000000-0000-4000-9f13-0000000000b1', '00000000-0000-4000-9f13-000000000a03', 'lead') $$,
  'the admin moves the lead to the other class as its lead');
select is(pg_temp.place('00000000-0000-4000-9f13-000000000a03'), 'Butterflies:lead', 'Nadia leads Butterflies now');
select is(
  (select count(*)::int from public.class_staff cs
    where cs.class_id = '00000000-0000-4000-9f13-0000000000b2' and cs.role = 'lead'),
  0, 'and Bees has no lead left behind');

-- 9-12 · what a move refuses.
select throws_ok(
  $$ select public.move_class_team_member('00000000-0000-4000-9f13-0000000000b1', '00000000-0000-4000-9f13-0000000000b1', '00000000-0000-4000-9f13-000000000a03', 'lead') $$,
  '22023', 'class_team_same_class', 'a move to the same class is refused');
select throws_ok(
  $$ select public.move_class_team_member('00000000-0000-4000-9f13-0000000000b1', '00000000-0000-4000-9f13-0000000000b3', '00000000-0000-4000-9f13-000000000a03', 'lead') $$,
  '22023', 'class_team_other_nursery', 'a move into another nursery''s class is refused');
select throws_ok(
  $$ select public.move_class_team_member('00000000-0000-4000-9f13-0000000000b2', '00000000-0000-4000-9f13-0000000000b1', '00000000-0000-4000-9f13-000000000a04', 'co_teacher') $$,
  '22023', 'class_team_not_on_that_class', 'moving someone who is not on the first class is refused');
select throws_ok(
  $$ select public.move_class_team_member('00000000-0000-4000-9f13-0000000000b1', '00000000-0000-4000-9f13-0000000000b2', '00000000-0000-4000-9f13-000000000a05', 'co_teacher') $$,
  '22023', 'class_team_not_a_teacher', 'moving a teacher of another nursery is refused');

-- 13 · a teacher cannot move anyone.
select pg_temp.act_as('00000000-0000-4000-9f13-000000000a02');
select throws_ok(
  $$ select public.move_class_team_member('00000000-0000-4000-9f13-0000000000b2', '00000000-0000-4000-9f13-0000000000b1', '00000000-0000-4000-9f13-000000000a02', 'co_teacher') $$,
  '42501', null, 'a teacher cannot move herself or anyone else');

-- 14-16 · what a teacher may open: the class she is on, and no other.
select lives_ok(
  $$ select public.get_class_profile('00000000-0000-4000-9f13-0000000000b2') $$,
  'Sara opens the class she is on the team of');
select throws_ok(
  $$ select public.get_class_profile('00000000-0000-4000-9f13-0000000000b1') $$,
  '42501', 'class_forbidden', 'and not a class she is not on');
select pg_temp.act_as('00000000-0000-4000-9f13-000000000a04');
select throws_ok(
  $$ select public.get_class_profile('00000000-0000-4000-9f13-0000000000b2') $$,
  '42501', 'class_forbidden', 'a teacher on no class opens none');

select * from finish();
rollback;

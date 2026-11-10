-- Database test · managing a class: a parent may not; a class needs a name (the other language is
-- filled from it), unique in the nursery, short texts, 1 to 100 places; the editor lists the class's
-- children, the others who could join (with their class) and the other classes; children move in
-- bulk, never over the places unless meant, only this nursery's, and their parents are told; a class
-- with children is deleted only once they move, and its team leaves it.
-- Rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(23);

insert into public.nurseries (id, name_ar, name_en) values
  ('00000000-0000-4000-9a00-00000000000a', 'حضانة الفصول', 'Classes Nursery'),
  ('00000000-0000-4000-9a00-00000000000b', 'حضانة أخرى', 'Other Nursery');
insert into auth.users (id, email) values
  ('00000000-0000-4000-9a00-000000000a01', 'm.admin@test.local'),
  ('00000000-0000-4000-9a00-000000000a02', 'm.teacher@test.local'),
  ('00000000-0000-4000-9a00-000000000a03', 'm.parent@test.local');
update public.users u
   set role = v.role::public.user_role, nursery_id = '00000000-0000-4000-9a00-00000000000a', name_ar = v.name_en, name_en = v.name_en, status = 'active'
  from (values
    ('00000000-0000-4000-9a00-000000000a01', 'branch_admin', 'Admin'),
    ('00000000-0000-4000-9a00-000000000a02', 'teacher', 'Teacher Hoda'),
    ('00000000-0000-4000-9a00-000000000a03', 'parent', 'Mona')
  ) as v(id, role, name_en)
 where u.id = v.id::uuid;
insert into public.classes (id, nursery_id, name_ar, name_en, grade_level, capacity) values
  ('00000000-0000-4000-9a00-0000000000b1', '00000000-0000-4000-9a00-00000000000a', 'الفراشات', 'Butterflies', 'KG1', 2),
  ('00000000-0000-4000-9a00-0000000000b2', '00000000-0000-4000-9a00-00000000000a', 'النحل', 'Bees', 'KG1', 25);
insert into public.class_staff (class_id, user_id, role) values
  ('00000000-0000-4000-9a00-0000000000b1', '00000000-0000-4000-9a00-000000000a02', 'lead');
insert into public.children (id, nursery_id, class_id, full_name_ar, full_name_en, dob, status, enrollment_date) values
  ('00000000-0000-4000-9a00-0000000000c1', '00000000-0000-4000-9a00-00000000000a', '00000000-0000-4000-9a00-0000000000b1', 'ليلى', 'Laila', '2023-01-01', 'active', '2026-01-01'),
  ('00000000-0000-4000-9a00-0000000000c2', '00000000-0000-4000-9a00-00000000000a', null, 'آدم', 'Adam', '2023-02-01', 'active', '2026-01-01'),
  ('00000000-0000-4000-9a00-0000000000c3', '00000000-0000-4000-9a00-00000000000a', '00000000-0000-4000-9a00-0000000000b2', 'سارة', 'Sara', '2023-03-01', 'active', '2026-01-01'),
  ('00000000-0000-4000-9a00-0000000000c4', '00000000-0000-4000-9a00-00000000000a', null, 'عمر', 'Omar', '2023-04-01', 'active', '2026-01-01'),
  ('00000000-0000-4000-9a00-0000000000c9', '00000000-0000-4000-9a00-00000000000b', null, 'غريب', 'Stranger', '2023-04-01', 'active', '2026-01-01');
insert into public.parent_children (parent_id, child_id, is_primary) values
  ('00000000-0000-4000-9a00-000000000a03', '00000000-0000-4000-9a00-0000000000c2', true);

create function pg_temp.act_as(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end;
$$;
create function pg_temp.class_of(p_child uuid) returns text language sql security definer as $$
  select coalesce((select k.name_en from public.children c join public.classes k on k.id = c.class_id where c.id = p_child), '-')
$$;

-- ---------------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-9a00-000000000a03');
select throws_ok($$ select public.get_class_editor('00000000-0000-4000-9a00-00000000000a') $$, '42501', 'class_forbidden', 'a parent cannot open the class editor');
select throws_ok($$ select public.save_class('00000000-0000-4000-9a00-00000000000a', null, 'x', 'x', null, null, null) $$, '42501', 'class_forbidden', 'nor create a class');

select pg_temp.act_as('00000000-0000-4000-9a00-000000000a01');
-- Saving
select throws_ok($$ select public.save_class('00000000-0000-4000-9a00-00000000000a', null, ' ', '', null, null, null) $$, '22023', 'class_name_required', 'a class needs a name');
select throws_ok($$ select public.save_class('00000000-0000-4000-9a00-00000000000a', null, null, ' bees ', null, null, null) $$, '23505', 'class_name_taken', 'not one another class has (any case)');
select throws_ok($$ select public.save_class('00000000-0000-4000-9a00-00000000000a', null, 'النجوم', null, null, null, 0) $$, '22023', 'class_capacity_invalid', 'at least one place');
select throws_ok($$ select public.save_class('00000000-0000-4000-9a00-00000000000a', null, 'النجوم', null, null, null, 101) $$, '22023', 'class_capacity_invalid', 'at most 100');
select throws_ok($$ select public.save_class('00000000-0000-4000-9a00-00000000000a', null, 'النجوم', null, repeat('x', 41), null, null) $$, '22023', 'class_text_too_long', 'a short age group');
select set_config('t.stars', public.save_class('00000000-0000-4000-9a00-00000000000a', null, 'النجوم', null, 'KG2', 'G01', 20)::text, true);
reset role;
select is(
  (select format('%s|%s|%s|%s|%s', name_ar, name_en, grade_level, room_number, capacity) from public.classes where id = current_setting('t.stars')::uuid),
  'النجوم|النجوم|KG2|G01|20', 'a class saved with one name has it in both'
);
select pg_temp.act_as('00000000-0000-4000-9a00-000000000a01');
select lives_ok(format($$ select public.save_class(null, %L, 'النجوم', 'Stars', 'KG2', 'G02', 18) $$, current_setting('t.stars')), 'and changes keep its own name free');

-- The editor
select is(
  (select string_agg(c ->> 'name_en', ',' order by c ->> 'name_en') from jsonb_array_elements(public.get_class_editor(null, '00000000-0000-4000-9a00-0000000000b1') -> 'children') c),
  'Laila', 'the editor lists the class''s children'
);
select is(
  (select string_agg((c ->> 'name_en') || ':' || coalesce(c ->> 'class_en', '-'), ',' order by c ->> 'name_en')
     from jsonb_array_elements(public.get_class_editor(null, '00000000-0000-4000-9a00-0000000000b1') -> 'candidates') c),
  'Adam:-,Omar:-,Sara:Bees', 'the nursery''s other children could join, each with their class'
);
select is(
  (select string_agg(c ->> 'name_en' || ':' || (c ->> 'children'), ',' order by c ->> 'name_en') from jsonb_array_elements(public.get_class_editor(null, '00000000-0000-4000-9a00-0000000000b1') -> 'classes') c),
  'Bees:1,Stars:0', 'and the other classes with their children'
);
select is(public.get_class_editor('00000000-0000-4000-9a00-00000000000a') -> 'grade_levels', '["KG1", "KG2"]'::jsonb, 'the age groups in use');

select is(
  (select string_agg((k ->> 'name_en') || ':' || (k ->> 'child_count') || ':' || jsonb_array_length(k -> 'staff'), ',' order by k ->> 'name_en')
     from jsonb_array_elements(public.get_nursery_classes('00000000-0000-4000-9a00-00000000000a')) k),
  'Bees:1:0,Butterflies:1:1,Stars:0:0', 'the classes list reads each class with its children and team'
);

-- Moving children
select throws_ok(
  $$ select public.move_children_to_class(array['00000000-0000-4000-9a00-0000000000c2', '00000000-0000-4000-9a00-0000000000c4']::uuid[], '00000000-0000-4000-9a00-0000000000b1') $$,
  'P0001', 'class_over_capacity', 'never over the places unless meant'
);
select throws_ok(
  $$ select public.move_children_to_class(array['00000000-0000-4000-9a00-0000000000c9']::uuid[], '00000000-0000-4000-9a00-0000000000b1') $$,
  '22023', 'class_children_invalid', 'only this nursery''s children'
);
select is(
  public.move_children_to_class(array['00000000-0000-4000-9a00-0000000000c2', '00000000-0000-4000-9a00-0000000000c4', '00000000-0000-4000-9a00-0000000000c1']::uuid[], '00000000-0000-4000-9a00-0000000000b1', true) ->> 'moved',
  '2', 'meant: the two who were not in it join (the one already there stays)'
);
reset role;
select is(
  (select count(*)::int from public.notifications where user_id = '00000000-0000-4000-9a00-000000000a03' and type = 'child_class_changed'),
  1, 'Adam''s parent is told his class'
);
select pg_temp.act_as('00000000-0000-4000-9a00-000000000a01');
select lives_ok($$ select public.move_children_to_class(array['00000000-0000-4000-9a00-0000000000c4']::uuid[], null) $$, 'a child can leave their class');
select is(pg_temp.class_of('00000000-0000-4000-9a00-0000000000c4'), '-', 'and has none');

-- Deleting
select throws_ok(
  $$ select public.delete_class('00000000-0000-4000-9a00-0000000000b1') $$,
  'P0001', 'class_has_children', 'a class with children is not deleted before they move'
);
select is(
  public.delete_class('00000000-0000-4000-9a00-0000000000b1', '00000000-0000-4000-9a00-0000000000b2') ->> 'moved',
  '2', 'they move to the class chosen'
);
reset role;
select is(
  (select format('%s|%s|%s|%s', (select deleted_at is not null from public.classes where id = '00000000-0000-4000-9a00-0000000000b1'),
                 pg_temp.class_of('00000000-0000-4000-9a00-0000000000c1'),
                 (select count(*) from public.class_staff where class_id = '00000000-0000-4000-9a00-0000000000b1'),
                 (select count(*) from public.class_team_changes where class_id = '00000000-0000-4000-9a00-0000000000b1' and action = 'removed'))),
  't|Bees|0|1', 'the class is gone, its children in Bees, its team out of it and the history says so'
);

select * from finish();
rollback;

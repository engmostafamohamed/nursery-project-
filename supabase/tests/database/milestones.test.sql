-- Database test · milestones: a teacher of the child's class (or an admin) records one, and the
-- family hears of it once, when it is first shared with them, and reads it and its photo. The
-- milestone is checked (text, kind, date, photo folder). Other classes' teachers and other families
-- see nothing; nobody writes the table directly; removing one hides it and keeps the row. Rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(25);

create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end;
$$;
-- A milestone as the form sends it, for Laila unless told otherwise.
create function pg_temp.m(p_extra jsonb default '{}'::jsonb) returns jsonb language sql as $$
  select jsonb_build_object('child_id', '00000000-0000-4000-9e00-0000000000c1', 'category', 'language',
                            'milestone_text', 'Said her first sentence', 'achieved_at', current_date - 1,
                            'shared_with_parent', true) || p_extra
$$;
create function pg_temp.told(p_user uuid) returns int language sql as $$
  select count(*)::int from public.notifications where user_id = p_user and type = 'milestone_shared'
$$;

-- A nursery with two classes: Laila (born 2023) in Birds with teacher Hoda, Omar in Lions with
-- teacher Rana; an admin; Laila's two parents and Omar's mother.
insert into public.nurseries (id, name_ar, name_en) values
  ('00000000-0000-4000-9e00-00000000000a', 'حضانة', 'Milestones Nursery');
insert into public.classes (id, nursery_id, name_ar, name_en) values
  ('00000000-0000-4000-9e00-0000000000b1', '00000000-0000-4000-9e00-00000000000a', 'العصافير', 'Birds'),
  ('00000000-0000-4000-9e00-0000000000b2', '00000000-0000-4000-9e00-00000000000a', 'الأسود', 'Lions');
insert into public.children (id, nursery_id, class_id, full_name_ar, full_name_en, dob, status, enrollment_date) values
  ('00000000-0000-4000-9e00-0000000000c1', '00000000-0000-4000-9e00-00000000000a', '00000000-0000-4000-9e00-0000000000b1', 'ليلى', 'Laila', '2023-01-01', 'active', '2026-01-01'),
  ('00000000-0000-4000-9e00-0000000000c2', '00000000-0000-4000-9e00-00000000000a', '00000000-0000-4000-9e00-0000000000b2', 'عمر', 'Omar', '2023-01-01', 'active', '2026-01-01');
insert into auth.users (id, email) values
  ('00000000-0000-4000-9e00-000000000a01', 'ms.admin@test.local'),
  ('00000000-0000-4000-9e00-000000000a02', 'ms.hoda@test.local'),
  ('00000000-0000-4000-9e00-000000000a03', 'ms.rana@test.local'),
  ('00000000-0000-4000-9e00-000000000a04', 'ms.mother@test.local'),
  ('00000000-0000-4000-9e00-000000000a05', 'ms.father@test.local'),
  ('00000000-0000-4000-9e00-000000000a06', 'ms.other@test.local');
update public.users u
   set role = v.role::public.user_role, nursery_id = '00000000-0000-4000-9e00-00000000000a', status = 'active'
  from (values
    ('00000000-0000-4000-9e00-000000000a01', 'branch_admin'),
    ('00000000-0000-4000-9e00-000000000a02', 'teacher'),
    ('00000000-0000-4000-9e00-000000000a03', 'teacher'),
    ('00000000-0000-4000-9e00-000000000a04', 'parent'),
    ('00000000-0000-4000-9e00-000000000a05', 'parent'),
    ('00000000-0000-4000-9e00-000000000a06', 'parent')) as v(id, role)
 where u.id = v.id::uuid;
insert into public.class_staff (class_id, user_id) values
  ('00000000-0000-4000-9e00-0000000000b1', '00000000-0000-4000-9e00-000000000a02'),
  ('00000000-0000-4000-9e00-0000000000b2', '00000000-0000-4000-9e00-000000000a03');
insert into public.parent_children (parent_id, child_id) values
  ('00000000-0000-4000-9e00-000000000a04', '00000000-0000-4000-9e00-0000000000c1'),
  ('00000000-0000-4000-9e00-000000000a05', '00000000-0000-4000-9e00-0000000000c1'),
  ('00000000-0000-4000-9e00-000000000a06', '00000000-0000-4000-9e00-0000000000c2');

-- Hoda records Laila's first sentence, with a photo, shared.
create temp table ids (name text primary key, id uuid) on commit drop;
grant all on ids to authenticated;
select pg_temp.act_as('00000000-0000-4000-9e00-000000000a02');
insert into ids values ('first', public.milestone_save(null, pg_temp.m(jsonb_build_object(
  'photo_path', '00000000-0000-4000-9e00-00000000000a/milestones/00000000-0000-4000-9e00-0000000000c1/1.jpg'))));
select isnt((select id from ids where name = 'first'), null, 'a teacher of the class records a milestone');
select is((select count(*)::int from public.milestones), 1, 'and reads it');
reset role;
select is(pg_temp.told('00000000-0000-4000-9e00-000000000a04') + pg_temp.told('00000000-0000-4000-9e00-000000000a05'), 2,
  'both parents hear of it');
select is((select action_link from public.notifications where user_id = '00000000-0000-4000-9e00-000000000a04' and type = 'milestone_shared'),
  '/parent/milestones?child=00000000-0000-4000-9e00-0000000000c1', 'the notice opens the child''s milestones');
select is((select template_params ->> 'milestone' from public.notifications where user_id = '00000000-0000-4000-9e00-000000000a04' and type = 'milestone_shared'),
  'Said her first sentence', 'and names the milestone');
select is((select teacher_id from public.milestones), '00000000-0000-4000-9e00-000000000a02'::uuid, 'the milestone keeps who recorded it');

-- Hoda corrects it: still shared, so no second notice.
select pg_temp.act_as('00000000-0000-4000-9e00-000000000a02');
select lives_ok($$ select public.milestone_save((select id from ids where name = 'first'),
  pg_temp.m(jsonb_build_object('milestone_text', 'Said her first full sentence',
    'photo_path', '00000000-0000-4000-9e00-00000000000a/milestones/00000000-0000-4000-9e00-0000000000c1/1.jpg'))) $$,
  'she corrects it');
reset role;
select is(pg_temp.told('00000000-0000-4000-9e00-000000000a04'), 1, 'a change to a shared milestone does not tell the family again');

-- The checks.
select pg_temp.act_as('00000000-0000-4000-9e00-000000000a02');
select throws_ok($$ select public.milestone_save(null, pg_temp.m('{"milestone_text": "  "}')) $$, 'P0001', 'milestone_text_required', 'the text is needed');
select throws_ok($$ select public.milestone_save(null, pg_temp.m('{"category": "dancing"}')) $$, 'P0001', 'milestone_category_invalid', 'the kind is one of the six');
select throws_ok($$ select public.milestone_save(null, pg_temp.m(jsonb_build_object('achieved_at', current_date + 3))) $$, 'P0001', 'milestone_date_invalid', 'not a day to come');
select throws_ok($$ select public.milestone_save(null, pg_temp.m('{"achieved_at": "2022-06-01"}')) $$, 'P0001', 'milestone_date_invalid', 'nor before the child was born');
select throws_ok($$ select public.milestone_save(null, pg_temp.m('{"photo_path": "00000000-0000-4000-9e00-00000000000a/2026/11/x.jpg"}')) $$, 'P0001', 'milestone_photo_invalid',
  'a photo is one uploaded to the child''s folder');
select throws_ok($$ select public.milestone_save(null, pg_temp.m('{"child_id": "00000000-0000-4000-9e00-0000000000c2"}')) $$, 'P0001', 'milestone_forbidden',
  'a teacher records only the children of her classes');
select throws_ok($$ insert into public.milestones (nursery_id, child_id, category, milestone_text, milestone_name_ar, milestone_name_en, achieved_at)
  values ('00000000-0000-4000-9e00-00000000000a', '00000000-0000-4000-9e00-0000000000c1', 'social', 'x', 'x', 'x', current_date) $$,
  '42501', null, 'nobody writes the table directly');

-- A milestone kept from the family, then shared.
insert into ids values ('private', public.milestone_save(null, pg_temp.m('{"milestone_text": "Ate alone", "category": "self_care", "shared_with_parent": false}')));
reset role;
select is(pg_temp.told('00000000-0000-4000-9e00-000000000a04'), 1, 'one kept from the family tells no one');
select pg_temp.act_as('00000000-0000-4000-9e00-000000000a04');
select is((select string_agg(milestone_text, ', ') from public.milestones), 'Said her first full sentence', 'the mother reads only the shared one');
select ok(public.storage_file_access('media', '00000000-0000-4000-9e00-00000000000a/milestones/00000000-0000-4000-9e00-0000000000c1/1.jpg', 'read'),
  'and its photo');
select pg_temp.act_as('00000000-0000-4000-9e00-000000000a02');
select lives_ok($$ select public.milestone_save((select id from ids where name = 'private'), pg_temp.m('{"milestone_text": "Ate alone", "category": "self_care"}')) $$,
  'Hoda shares it after all');
reset role;
select is(pg_temp.told('00000000-0000-4000-9e00-000000000a04'), 2, 'and then the family hears of it');

-- Others.
select pg_temp.act_as('00000000-0000-4000-9e00-000000000a06');
select is((select count(*)::int from public.milestones), 0, 'another family reads none');
select ok(not public.storage_file_access('media', '00000000-0000-4000-9e00-00000000000a/milestones/00000000-0000-4000-9e00-0000000000c1/1.jpg', 'read'),
  'nor the photo');
select pg_temp.act_as('00000000-0000-4000-9e00-000000000a03');
select is((select count(*)::int from public.milestones), 0, 'the teacher of another class reads none');

-- Removing one.
select pg_temp.act_as('00000000-0000-4000-9e00-000000000a01');
select public.milestone_remove((select id from ids where name = 'first'));
select pg_temp.act_as('00000000-0000-4000-9e00-000000000a04');
select is((select string_agg(milestone_text, ', ') from public.milestones), 'Ate alone', 'a removed milestone is gone from the family''s list');
reset role;
select is((select count(*)::int from public.milestones where deleted_at is not null and deleted_by = '00000000-0000-4000-9e00-000000000a01'), 1,
  'and kept in the table, set aside by the admin');

select * from finish();
rollback;

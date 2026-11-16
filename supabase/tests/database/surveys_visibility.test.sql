-- Database test · which surveys a family and a teacher can see: a sent survey (status 'active' or
-- the older 'published') shows; a draft, a closed one and a soft-deleted one do not; a survey sent
-- to chosen classes shows only to families with a child in one of them; a teacher sees only the
-- surveys addressed to teachers. Rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(12);

create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end;
$$;
-- The surveys the signed-in user sees, as "title, title".
create function pg_temp.seen() returns text language sql as $$
  select coalesce(string_agg(title, ', ' order by title), '-') from public.surveys
$$;

-- A nursery with two classes; Adam's child is in Birds, Omar's child is in Cats.
insert into public.nurseries (id, name_ar, name_en) values ('00000000-0000-4000-9f11-00000000000a', 'حضانة', 'Survey Nursery');
insert into public.classes (id, nursery_id, name_ar, name_en) values
  ('00000000-0000-4000-9f11-0000000000b1', '00000000-0000-4000-9f11-00000000000a', 'العصافير', 'Birds'),
  ('00000000-0000-4000-9f11-0000000000b2', '00000000-0000-4000-9f11-00000000000a', 'القطط', 'Cats');
insert into auth.users (id, email) values
  ('00000000-0000-4000-9f11-000000000a01', 'svy.admin@test.local'),
  ('00000000-0000-4000-9f11-000000000a02', 'svy.adam@test.local'),
  ('00000000-0000-4000-9f11-000000000a03', 'svy.omar@test.local'),
  ('00000000-0000-4000-9f11-000000000a04', 'svy.teacher@test.local');
update public.users u
   set role = v.role::public.user_role, nursery_id = '00000000-0000-4000-9f11-00000000000a', name_en = v.name_en, name_ar = v.name_en, status = 'active'
  from (values
    ('00000000-0000-4000-9f11-000000000a01', 'branch_admin', 'Admin'),
    ('00000000-0000-4000-9f11-000000000a02', 'parent', 'Adam'),
    ('00000000-0000-4000-9f11-000000000a03', 'parent', 'Omar'),
    ('00000000-0000-4000-9f11-000000000a04', 'teacher', 'Teacher')
  ) as v(id, role, name_en)
 where u.id = v.id::uuid;
insert into public.children (id, nursery_id, class_id, full_name_ar, full_name_en, dob, status) values
  ('00000000-0000-4000-9f11-0000000000c1', '00000000-0000-4000-9f11-00000000000a', '00000000-0000-4000-9f11-0000000000b1', 'طفل آدم', 'Adam Child', '2022-01-01', 'active'),
  ('00000000-0000-4000-9f11-0000000000c2', '00000000-0000-4000-9f11-00000000000a', '00000000-0000-4000-9f11-0000000000b2', 'طفل عمر', 'Omar Child', '2022-01-01', 'active');
insert into public.parent_children (parent_id, child_id, relationship) values
  ('00000000-0000-4000-9f11-000000000a02', '00000000-0000-4000-9f11-0000000000c1', 'father'),
  ('00000000-0000-4000-9f11-000000000a03', '00000000-0000-4000-9f11-0000000000c2', 'father');

-- The nursery's forms, one of each kind.
insert into public.surveys (id, nursery_id, title, title_ar, title_en, target_role, type, status, questions_json, target_class_ids, deleted_at) values
  ('00000000-0000-4000-9f11-0000000000d1', '00000000-0000-4000-9f11-00000000000a', 'All families',   'للجميع', 'All families',   'parent',  'questionnaire', 'active',    '[]', null, null),
  ('00000000-0000-4000-9f11-0000000000d2', '00000000-0000-4000-9f11-00000000000a', 'Birds only',     'للعصافير', 'Birds only',   'parent',  'questionnaire', 'active',    '[]', array['00000000-0000-4000-9f11-0000000000b1']::uuid[], null),
  ('00000000-0000-4000-9f11-0000000000d3', '00000000-0000-4000-9f11-00000000000a', 'Old published',  'قديم', 'Old published',    'parent',  'questionnaire', 'published', '[]', null, null),
  ('00000000-0000-4000-9f11-0000000000d4', '00000000-0000-4000-9f11-00000000000a', 'Still a draft',  'مسودة', 'Still a draft',   'parent',  'questionnaire', 'draft',     '[]', null, null),
  ('00000000-0000-4000-9f11-0000000000d5', '00000000-0000-4000-9f11-00000000000a', 'Closed one',     'مغلق', 'Closed one',       'parent',  'questionnaire', 'closed',    '[]', null, null),
  ('00000000-0000-4000-9f11-0000000000d6', '00000000-0000-4000-9f11-00000000000a', 'Deleted one',    'محذوف', 'Deleted one',     'parent',  'questionnaire', 'active',    '[]', null, now()),
  ('00000000-0000-4000-9f11-0000000000d7', '00000000-0000-4000-9f11-00000000000a', 'For teachers',   'للمعلمات', 'For teachers', 'teacher', 'questionnaire', 'active',    '[]', null, null);

-- Adam (child in Birds): the sent surveys, including the one for his class, and nothing else.
select pg_temp.act_as('00000000-0000-4000-9f11-000000000a02');
select is(pg_temp.seen(), 'All families, Birds only, Old published', 'Adam sees the sent family surveys, his class''s one included');
select is((select count(*)::int from public.surveys where title = 'Still a draft'), 0, 'a draft stays off the family''s screen');
select is((select count(*)::int from public.surveys where title = 'Closed one'), 0, 'a closed survey stays off the family''s screen');
select is((select count(*)::int from public.surveys where title = 'Deleted one'), 0, 'a deleted survey stays off the family''s screen');
select is((select count(*)::int from public.surveys where title = 'For teachers'), 0, 'a teachers'' survey stays off the family''s screen');

-- Omar (child in Cats): not the Birds-only survey.
select pg_temp.act_as('00000000-0000-4000-9f11-000000000a03');
select is(pg_temp.seen(), 'All families, Old published', 'a class-targeted survey stays off the other families'' screens');

-- The teacher: only the teachers' survey.
select pg_temp.act_as('00000000-0000-4000-9f11-000000000a04');
select is(pg_temp.seen(), 'For teachers', 'the teacher sees only the surveys addressed to teachers');

-- The admin still sees and manages everything, deleted included.
select pg_temp.act_as('00000000-0000-4000-9f11-000000000a01');
select is((select count(*)::int from public.surveys), 7, 'the admin sees every survey, the deleted one included');
select lives_ok($$update public.surveys set deleted_at = now() where id = '00000000-0000-4000-9f11-0000000000d1'$$, 'the admin can soft-delete a survey');
select is((select count(*)::int from public.surveys where id = '00000000-0000-4000-9f11-0000000000d1' and deleted_at is not null), 1, 'the delete stamps deleted_at and keeps the row');

-- And the family stops seeing it at once.
select pg_temp.act_as('00000000-0000-4000-9f11-000000000a02');
select is(pg_temp.seen(), 'Birds only, Old published', 'a soft-deleted survey leaves the family''s screen');

-- A family cannot change a survey: with no family write policy the update touches nothing.
update public.surveys set title = 'hack' where title = 'Birds only';
select pg_temp.act_as('00000000-0000-4000-9f11-000000000a01');
select is((select count(*)::int from public.surveys where title = 'hack'), 0, 'a family cannot edit a survey');

select * from finish();
rollback;

-- Database test · a teacher's events: the published ones that concern their classes (the whole
-- nursery, their class, or chosen children of their class), with how many of their children were
-- asked, said yes and were checked in; and the roster of one event (a teacher: their classes; an
-- admin: everyone). Never a draft, a cancelled event, another class's trip, nor a parent. Rolled back.
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
-- The teacher's events as "title asked/going/checked in".
create function pg_temp.events() returns text language sql as $$
  select coalesce(string_agg(format('%s %s/%s/%s', title_en, asked, going, checked_in), ', ' order by title_en), '-')
    from public.teacher_events()
$$;
-- An event's roster as "name status checked-in?".
create function pg_temp.roster(p_event uuid) returns text language sql as $$
  select coalesce(string_agg(format('%s %s %s', name_en, status, case when checked_in_at is null then 'false' else 'true' end), ', '), '-')
    from public.event_roster(p_event)
$$;

insert into public.nurseries (id, name_ar, name_en) values ('00000000-0000-4000-9700-00000000000a', 'حضانة', 'Teacher Nursery');
insert into public.classes (id, nursery_id, name_ar, name_en) values
  ('00000000-0000-4000-9700-0000000000b1', '00000000-0000-4000-9700-00000000000a', 'أ', 'Class A'),
  ('00000000-0000-4000-9700-0000000000b2', '00000000-0000-4000-9700-00000000000a', 'ب', 'Class B');
insert into auth.users (id, email) values
  ('00000000-0000-4000-9700-000000000a01', 'teach.admin@test.local'),
  ('00000000-0000-4000-9700-000000000a02', 'teach.teacher@test.local'),
  ('00000000-0000-4000-9700-000000000a04', 'teach.parent@test.local');
update public.users u
   set role = v.role::public.user_role, nursery_id = '00000000-0000-4000-9700-00000000000a', name_en = v.name_en, status = 'active'
  from (values
    ('00000000-0000-4000-9700-000000000a01', 'branch_admin', 'Admin'),
    ('00000000-0000-4000-9700-000000000a02', 'teacher', 'Teacher'),
    ('00000000-0000-4000-9700-000000000a04', 'parent', 'Mona')
  ) as v(id, role, name_en)
 where u.id = v.id::uuid;
-- The teacher teaches class A: Laila and Nour. Omar is in class B.
insert into public.class_staff (class_id, user_id) values ('00000000-0000-4000-9700-0000000000b1', '00000000-0000-4000-9700-000000000a02');
insert into public.children (id, nursery_id, class_id, full_name_ar, full_name_en, dob, status, enrollment_date) values
  ('00000000-0000-4000-9700-0000000000c1', '00000000-0000-4000-9700-00000000000a', '00000000-0000-4000-9700-0000000000b1', 'ليلى', 'Laila', '2022-01-01', 'active', '2026-01-01'),
  ('00000000-0000-4000-9700-0000000000c2', '00000000-0000-4000-9700-00000000000a', '00000000-0000-4000-9700-0000000000b2', 'عمر', 'Omar', '2022-01-01', 'active', '2026-01-01'),
  ('00000000-0000-4000-9700-0000000000c3', '00000000-0000-4000-9700-00000000000a', '00000000-0000-4000-9700-0000000000b1', 'نور', 'Nour', '2022-01-01', 'active', '2026-01-01');
insert into public.parent_children (parent_id, child_id, is_primary) values
  ('00000000-0000-4000-9700-000000000a04', '00000000-0000-4000-9700-0000000000c1', true);

-- The whole nursery (each child asked when it opens), class B's trip, a museum for Omar and Nour, a
-- visit for Omar alone, a draft and a cancelled party.
insert into public.events (id, nursery_id, title_ar, title_en, starts_at, category, target_scope, target_class_id, status, cancelled_at) values
  ('00000000-0000-4000-9700-0000000000e1', '00000000-0000-4000-9700-00000000000a', 'حفل', 'Party', now() + interval '5 days', 'activity', 'all', null, 'active', null),
  ('00000000-0000-4000-9700-0000000000e2', '00000000-0000-4000-9700-00000000000a', 'رحلة ب', 'Trip B', now() + interval '5 days', 'trip', 'class', '00000000-0000-4000-9700-0000000000b2', 'active', null),
  ('00000000-0000-4000-9700-0000000000e3', '00000000-0000-4000-9700-00000000000a', 'متحف', 'Museum', now() - interval '1 hour', 'trip', 'individual', null, 'active', null),
  ('00000000-0000-4000-9700-0000000000e4', '00000000-0000-4000-9700-00000000000a', 'طبيب', 'Doctor', now() + interval '5 days', 'doctor_visit', 'individual', null, 'active', null),
  ('00000000-0000-4000-9700-0000000000e5', '00000000-0000-4000-9700-00000000000a', 'مسودة', 'Draft', now() + interval '5 days', 'activity', 'all', null, 'draft', null),
  ('00000000-0000-4000-9700-0000000000e6', '00000000-0000-4000-9700-00000000000a', 'ملغى', 'Cancelled', now() + interval '5 days', 'activity', 'all', null, 'cancelled', now());
insert into public.permissions (child_id, event_id, permission_type, status) values
  ('00000000-0000-4000-9700-0000000000c2', '00000000-0000-4000-9700-0000000000e3', 'event', 'pending'),
  ('00000000-0000-4000-9700-0000000000c3', '00000000-0000-4000-9700-0000000000e3', 'event', 'granted'),
  ('00000000-0000-4000-9700-0000000000c2', '00000000-0000-4000-9700-0000000000e4', 'event', 'granted');
-- The scanner checked Nour in at the museum.
insert into public.event_attendance (event_id, child_id, nursery_id) values
  ('00000000-0000-4000-9700-0000000000e3', '00000000-0000-4000-9700-0000000000c3', '00000000-0000-4000-9700-00000000000a');

-- The teacher
select pg_temp.act_as('00000000-0000-4000-9700-000000000a02');
select is(pg_temp.events(), 'Museum 1/1/1, Party 2/0/0',
  'the teacher sees the party (her two children asked) and the museum (Nour going and checked in); not class B''s trip, Omar''s visit, the draft nor the cancelled party');
select is(pg_temp.roster('00000000-0000-4000-9700-0000000000e3'), 'Nour granted true', 'the museum''s roster: only her class''s child, going and checked in');
select is(pg_temp.roster('00000000-0000-4000-9700-0000000000e1'), 'Laila pending false, Nour pending false', 'the party''s roster: her two children, still to answer');
select throws_ok($$ select * from public.event_roster('00000000-0000-4000-9700-0000000000e5') $$, '42501', 'event_forbidden', 'not the roster of a draft');
select throws_ok($$ select public.my_class_children() $$, '42501', null, 'the helper is not called from the app');

-- The admin sees everyone asked.
select pg_temp.act_as('00000000-0000-4000-9700-000000000a01');
select is(pg_temp.roster('00000000-0000-4000-9700-0000000000e3'), 'Nour granted true, Omar pending false', 'the admin''s roster of the museum: every child asked, going first');
select is(pg_temp.roster('00000000-0000-4000-9700-0000000000e5'), '-', 'the admin may open a draft''s roster (nobody asked yet)');
select is(pg_temp.events(), '-', 'teacher_events is a teacher''s list');

-- A parent
select pg_temp.act_as('00000000-0000-4000-9700-000000000a04');
select throws_ok($$ select * from public.event_roster('00000000-0000-4000-9700-0000000000e1') $$, '42501', 'event_forbidden', 'a parent never reads a roster');
select is(pg_temp.events(), '-', 'nor the teacher''s list');

-- Nour's request withdrawn (soft): the museum is no longer the teacher's, and the roster skips it.
reset role;
update public.permissions set deleted_at = now()
 where event_id = '00000000-0000-4000-9700-0000000000e3' and child_id = '00000000-0000-4000-9700-0000000000c3';
select pg_temp.act_as('00000000-0000-4000-9700-000000000a02');
select is(pg_temp.events(), 'Party 2/0/0', 'a withdrawn request: the museum leaves the teacher''s list');
select pg_temp.act_as('00000000-0000-4000-9700-000000000a01');
select is(pg_temp.roster('00000000-0000-4000-9700-0000000000e3'), 'Omar pending false', 'and the roster');

select * from finish();
rollback;

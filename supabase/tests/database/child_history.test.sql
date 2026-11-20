-- Database test · everything the nursery holds about one child, read in one go.
--
-- The child's own details and family, the reports written about her, the days she came, the days
-- her family said she would be away, the events she was asked to, what she reached, her health
-- notes and what the teachers told her family. The teachers of her class read it and so do the
-- nursery's admins and her own family; a teacher of another class, another nursery's admin and
-- another family do not. Rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(16);

create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end;
$$;
create function pg_temp.hist() returns jsonb language sql as $$
  select public.get_child_history('00000000-0000-4000-9f16-0000000000c1')
$$;
create function pg_temp.n(p_part text) returns int language sql as $$
  select jsonb_array_length(pg_temp.hist() -> p_part)
$$;

insert into public.nurseries (id, name_ar, name_en) values
  ('00000000-0000-4000-9f16-00000000000a', 'حضانة', 'Hist Nursery'),
  ('00000000-0000-4000-9f16-00000000000b', 'أخرى', 'Other Nursery');
insert into public.classes (id, nursery_id, name_ar, name_en) values
  ('00000000-0000-4000-9f16-0000000000b1', '00000000-0000-4000-9f16-00000000000a', 'الفراشات', 'Butterflies'),
  ('00000000-0000-4000-9f16-0000000000b2', '00000000-0000-4000-9f16-00000000000a', 'النحل', 'Bees');
insert into auth.users (id, email) values
  ('00000000-0000-4000-9f16-000000000a01', 'ch.admin@test.local'),
  ('00000000-0000-4000-9f16-000000000a02', 'ch.hers@test.local'),
  ('00000000-0000-4000-9f16-000000000a03', 'ch.other@test.local'),
  ('00000000-0000-4000-9f16-000000000a04', 'ch.dad@test.local'),
  ('00000000-0000-4000-9f16-000000000a05', 'ch.stranger@test.local');
update public.users u
   set role = v.role::public.user_role, nursery_id = v.nursery::uuid, name_en = v.name_en, name_ar = v.name_en, status = 'active'
  from (values
    ('00000000-0000-4000-9f16-000000000a01', 'branch_admin', 'Admin',   '00000000-0000-4000-9f16-00000000000a'),
    ('00000000-0000-4000-9f16-000000000a02', 'teacher',      'Her Sara','00000000-0000-4000-9f16-00000000000a'),
    ('00000000-0000-4000-9f16-000000000a03', 'teacher',      'Other Nour','00000000-0000-4000-9f16-00000000000a'),
    ('00000000-0000-4000-9f16-000000000a04', 'parent',       'Dad',     '00000000-0000-4000-9f16-00000000000a'),
    ('00000000-0000-4000-9f16-000000000a05', 'parent',       'Stranger','00000000-0000-4000-9f16-00000000000a')
  ) as v(id, role, name_en, nursery)
 where u.id = v.id::uuid;
-- Sara teaches her class; Nour teaches the other one.
insert into public.class_staff (class_id, user_id, role) values
  ('00000000-0000-4000-9f16-0000000000b1', '00000000-0000-4000-9f16-000000000a02', 'lead'),
  ('00000000-0000-4000-9f16-0000000000b2', '00000000-0000-4000-9f16-000000000a03', 'lead');

insert into public.children (id, nursery_id, class_id, full_name_ar, full_name_en, dob, status, enrollment_date) values
  ('00000000-0000-4000-9f16-0000000000c1', '00000000-0000-4000-9f16-00000000000a', '00000000-0000-4000-9f16-0000000000b1',
   'ليلى', 'Layla', '2023-01-01', 'active', current_date - 100);
insert into public.parent_children (parent_id, child_id, relationship, is_primary) values
  ('00000000-0000-4000-9f16-000000000a04', '00000000-0000-4000-9f16-0000000000c1', 'father', true);

-- A past she should be able to read back.
insert into public.child_allergies (child_id, nursery_id, allergen_name, severity, reaction_type) values
  ('00000000-0000-4000-9f16-0000000000c1', '00000000-0000-4000-9f16-00000000000a', 'Milk', 'life_threatening', 'rash');
insert into public.daily_reports (child_id, nursery_id, report_date, teacher_id, status, mood, teacher_note) values
  ('00000000-0000-4000-9f16-0000000000c1', '00000000-0000-4000-9f16-00000000000a', current_date - 2,
   '00000000-0000-4000-9f16-000000000a02', 'draft', 'happy', 'A good day.'),
  ('00000000-0000-4000-9f16-0000000000c1', '00000000-0000-4000-9f16-00000000000a', current_date - 1,
   '00000000-0000-4000-9f16-000000000a02', 'draft', 'content', 'Quiet.');
insert into public.attendance_records (child_id, attendance_date, check_in, check_out, late_charge_status) values
  ('00000000-0000-4000-9f16-0000000000c1', current_date - 2,
   (current_date - 2 + time '08:00') at time zone 'Africa/Cairo', (current_date - 2 + time '16:00') at time zone 'Africa/Cairo', 'none');
insert into public.attendance_absence_reports (nursery_id, child_id, absence_date, reason, reported_by) values
  ('00000000-0000-4000-9f16-00000000000a', '00000000-0000-4000-9f16-0000000000c1', current_date - 3, 'sick',
   '00000000-0000-4000-9f16-000000000a04');
insert into public.milestones (id, child_id, nursery_id, category, milestone_name_ar, milestone_name_en, milestone_text, achieved_at, teacher_id) values
  ('00000000-0000-4000-9f16-0000000000d1', '00000000-0000-4000-9f16-0000000000c1', '00000000-0000-4000-9f16-00000000000a',
   'language', 'أول كلمة', 'First word', 'First word', current_date - 10, '00000000-0000-4000-9f16-000000000a02');
insert into public.health_records (child_id, record_type, record_date, notes) values
  ('00000000-0000-4000-9f16-0000000000c1', 'allergy', current_date - 20, 'Carries an inhaler.');
-- A colleague's message to the class's families, which her teacher should also see.
insert into public.family_messages (nursery_id, sender_id, sender_name_ar, sender_name_en, sender_role, audience, class_id, body) values
  ('00000000-0000-4000-9f16-00000000000a', '00000000-0000-4000-9f16-000000000a02', 'سارة', 'Her Sara', 'teacher',
   'class', '00000000-0000-4000-9f16-0000000000b1', 'Trip on Sunday.');

-- 1-8 · her own teacher reads the whole of it.
select pg_temp.act_as('00000000-0000-4000-9f16-000000000a02');
select is(pg_temp.hist() -> 'child' ->> 'name_en', 'Layla', 'the child''s own details come back');
select is(pg_temp.hist() -> 'child' -> 'class' ->> 'en', 'Butterflies', 'with the class she is in');
select is(pg_temp.n('parents'), 1, 'her family is named');
select is(pg_temp.n('allergies'), 1, 'what she must not eat is there');
select is(pg_temp.n('reports'), 2, 'the reports written about her are there');
select is(pg_temp.n('attendance'), 1, 'the days she came are there');
select is(pg_temp.n('absences'), 1, 'and the day her family said she would be away');
select is(pg_temp.n('milestones'), 1, 'what she reached is there');

-- 9-11 · the rest of her past.
select is(pg_temp.n('health'), 1, 'her health notes are there');
select is(pg_temp.n('messages'), 1, 'what the teachers told her family is there');
select is(pg_temp.hist() -> 'reports' -> 0 ->> 'date', (current_date - 1)::text, 'the newest report comes first');

-- 12-13 · the nursery's admin and her own family read it too.
select pg_temp.act_as('00000000-0000-4000-9f16-000000000a01');
select is(pg_temp.n('reports'), 2, 'the nursery''s admin reads it');
select pg_temp.act_as('00000000-0000-4000-9f16-000000000a04');
select is(pg_temp.n('reports'), 2, 'her own family reads it');

-- 14-16 · and nobody else does.
select pg_temp.act_as('00000000-0000-4000-9f16-000000000a03');
select throws_ok($$ select public.get_child_history('00000000-0000-4000-9f16-0000000000c1') $$,
                 '42501', 'child_history_forbidden', 'a teacher of another class cannot read it');
select pg_temp.act_as('00000000-0000-4000-9f16-000000000a05');
select throws_ok($$ select public.get_child_history('00000000-0000-4000-9f16-0000000000c1') $$,
                 '42501', 'child_history_forbidden', 'another family cannot read it');
select throws_ok($$ select public.get_child_history('00000000-0000-4000-9f16-0000000000cf') $$,
                 'P0002', 'child_not_found', 'a child who does not exist is not found');

select * from finish();
rollback;

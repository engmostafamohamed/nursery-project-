-- Database test · Class teams (who may set them, one lead and one backup per class, the log and
-- the teacher's notice), the teacher's classes and children, chats limited to the families of the
-- teacher's classes, and messages from the staff to families (who may send, to whom, who sent it,
-- what parents see and read).
-- Everything runs in one transaction that is rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(27);

insert into public.nurseries (id, name_ar, name_en, working_days) values
  ('00000000-0000-4000-7000-00000000000a', 'حضانة أ', 'Nursery A', '["sun","mon","tue","wed","thu","fri","sat"]'),
  ('00000000-0000-4000-7000-00000000000b', 'حضانة ب', 'Nursery B', '["sun","mon","tue","wed","thu","fri","sat"]');

-- Closing is midnight, so a child still here today is in extra hours right now.
update public.nursery_settings
   set late_pickup_grace_minutes = 5, standard_end_time = '00:00', late_billing_base = 'closing_time', timezone = 'Africa/Cairo'
 where nursery_id = '00000000-0000-4000-7000-00000000000a';

insert into auth.users (id, email) values
  ('00000000-0000-4000-7000-000000000a01', 'team.admin@test.local'),
  ('00000000-0000-4000-7000-000000000a02', 'team.head@test.local'),
  ('00000000-0000-4000-7000-000000000a03', 'team.sara@test.local'),
  ('00000000-0000-4000-7000-000000000a04', 'team.nadia@test.local'),
  ('00000000-0000-4000-7000-000000000a06', 'team.mona@test.local'),
  ('00000000-0000-4000-7000-000000000a07', 'team.huda@test.local'),
  ('00000000-0000-4000-7000-000000000a08', 'team.karim@test.local'),
  ('00000000-0000-4000-7000-000000000b01', 'team.admin.b@test.local'),
  ('00000000-0000-4000-7000-000000000b02', 'team.teacher.b@test.local');

update public.users u
   set role = v.role::public.user_role, nursery_id = v.nursery_id::uuid, name_ar = v.name_ar, name_en = v.name_en,
       phone = v.phone, status = 'active'
  from (values
    ('00000000-0000-4000-7000-000000000a01', 'branch_admin', '00000000-0000-4000-7000-00000000000a', 'المديرة', 'Head Admin', null),
    ('00000000-0000-4000-7000-000000000a02', 'teacher',      '00000000-0000-4000-7000-00000000000a', 'رئيسة المعلمات', 'Head Teacher', null),
    ('00000000-0000-4000-7000-000000000a03', 'teacher',      '00000000-0000-4000-7000-00000000000a', 'سارة', 'Sara', null),
    ('00000000-0000-4000-7000-000000000a04', 'teacher',      '00000000-0000-4000-7000-00000000000a', 'نادية', 'Nadia', null),
    ('00000000-0000-4000-7000-000000000a06', 'parent',       '00000000-0000-4000-7000-00000000000a', 'منى', 'Mona', '01011111111'),
    ('00000000-0000-4000-7000-000000000a07', 'parent',       '00000000-0000-4000-7000-00000000000a', 'هدى', 'Huda', '01033333333'),
    ('00000000-0000-4000-7000-000000000a08', 'parent',       '00000000-0000-4000-7000-00000000000a', 'كريم', 'Karim', '01022222222'),
    ('00000000-0000-4000-7000-000000000b01', 'branch_admin', '00000000-0000-4000-7000-00000000000b', 'مديرة ب', 'Admin B', null),
    ('00000000-0000-4000-7000-000000000b02', 'teacher',      '00000000-0000-4000-7000-00000000000b', 'معلمة ب', 'Teacher B', null)
  ) as v(id, role, nursery_id, name_ar, name_en, phone)
 where u.id = v.id::uuid;

-- The head teacher has the nursery's "Head of teachers" role; Nadia the nursery's "Teacher" role.
update public.users set role_id = (select id from public.roles where nursery_id = '00000000-0000-4000-7000-00000000000a' and key = 'head_teacher')
 where id = '00000000-0000-4000-7000-000000000a02';
update public.users set role_id = (select id from public.roles where nursery_id = '00000000-0000-4000-7000-00000000000a' and key = 'teacher')
 where id = '00000000-0000-4000-7000-000000000a04';

insert into public.classes (id, nursery_id, name_ar, name_en) values
  ('00000000-0000-4000-7000-0000000000e1', '00000000-0000-4000-7000-00000000000a', 'الفراشات', 'Butterflies'),
  ('00000000-0000-4000-7000-0000000000e2', '00000000-0000-4000-7000-00000000000a', 'النجوم', 'Stars');

insert into public.class_staff (class_id, user_id, role) values
  ('00000000-0000-4000-7000-0000000000e1', '00000000-0000-4000-7000-000000000a03', 'lead');

insert into public.children (id, nursery_id, full_name_ar, full_name_en, dob, status, enrollment_date, class_id) values
  ('00000000-0000-4000-7000-0000000000c1', '00000000-0000-4000-7000-00000000000a', 'ليلى', 'Laila', '2023-01-01', 'active', '2026-01-01', '00000000-0000-4000-7000-0000000000e1'),
  ('00000000-0000-4000-7000-0000000000c3', '00000000-0000-4000-7000-00000000000a', 'عمر', 'Omar', '2023-01-01', 'active', '2026-01-01', '00000000-0000-4000-7000-0000000000e1'),
  ('00000000-0000-4000-7000-0000000000c2', '00000000-0000-4000-7000-00000000000a', 'آدم', 'Adam', '2023-01-01', 'active', '2026-01-01', '00000000-0000-4000-7000-0000000000e2');

-- Mona is the mother of Laila and Omar, Karim Laila's father; Huda is Adam's mother.
insert into public.parent_children (parent_id, child_id, relationship, is_primary) values
  ('00000000-0000-4000-7000-000000000a06', '00000000-0000-4000-7000-0000000000c1', 'mother', true),
  ('00000000-0000-4000-7000-000000000a06', '00000000-0000-4000-7000-0000000000c3', 'mother', true),
  ('00000000-0000-4000-7000-000000000a08', '00000000-0000-4000-7000-0000000000c1', 'father', false),
  ('00000000-0000-4000-7000-000000000a07', '00000000-0000-4000-7000-0000000000c2', 'mother', true);

-- Laila is here today, past closing; Omar has not come.
alter table public.attendance_records disable trigger attendance_qr_working_hours_guard;
insert into public.attendance_records (child_id, attendance_date, check_in, check_in_method) values
  ('00000000-0000-4000-7000-0000000000c1', (now() at time zone 'Africa/Cairo')::date, now() - interval '1 hour', 'manual');
alter table public.attendance_records enable trigger attendance_qr_working_hours_guard;

create function pg_temp.act_as(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end;
$$;

create function pg_temp.team(p_class uuid) returns text
language sql as $$
  select coalesce(string_agg(format('%s:%s', u.name_en, cs.role), ', ' order by cs.role, u.name_en), '')
  from public.class_staff cs join public.users u on u.id = cs.user_id where cs.class_id = p_class
$$;

-- ---------------------------------------------------------------------------------------------
-- Class teams
select pg_temp.act_as('00000000-0000-4000-7000-000000000a02');

select is(
  (select format('%s classes, %s teachers, update %s', jsonb_array_length(t->'classes'), jsonb_array_length(t->'staff'), t->>'can_update')
     from public.get_class_teams('00000000-0000-4000-7000-00000000000a') t),
  '2 classes, 3 teachers, update true',
  'the head of teachers sees every class and teacher, and may change the teams'
);

select is(
  (select format('%s changed=%s replaced=%s', r->>'role', r->>'changed', r->>'replaced_user_id' = '00000000-0000-4000-7000-000000000a03')
     from public.set_class_team_member('00000000-0000-4000-7000-0000000000e1', '00000000-0000-4000-7000-000000000a04', 'lead') r),
  'lead changed=true replaced=t',
  'a new lead teacher takes the place of the old one'
);

-- Read as the owner: who is in a class is checked whatever the reader may see of the staff.
reset role;
select is(pg_temp.team('00000000-0000-4000-7000-0000000000e1'), 'Nadia:lead', 'one lead per class: the old lead leaves the class');
select pg_temp.act_as('00000000-0000-4000-7000-000000000a02');

select lives_ok(
  $$ select public.set_class_team_member('00000000-0000-4000-7000-0000000000e1', '00000000-0000-4000-7000-000000000a03', 'assistant') $$,
  'an assistant is added'
);
select lives_ok(
  $$ select public.set_class_team_member('00000000-0000-4000-7000-0000000000e2', '00000000-0000-4000-7000-000000000a03', 'substitute') $$,
  'a teacher can be in more than one class'
);

reset role;
select is(
  (select string_agg(format('%s %s %s', u.name_en, ch.action, coalesce(ch.role::text, '-')), '; ' order by u.name_en, ch.action)
     from public.class_team_changes ch join public.users u on u.id = ch.user_id
    where ch.class_id = '00000000-0000-4000-7000-0000000000e1'),
  'Nadia assigned lead; Sara assigned assistant; Sara removed -',
  'every change is logged'
);
select pg_temp.act_as('00000000-0000-4000-7000-000000000a02');

select throws_ok(
  $$ select public.set_class_team_member('00000000-0000-4000-7000-0000000000e1', '00000000-0000-4000-7000-000000000a06', 'assistant') $$,
  '22023', 'class_team_not_a_teacher',
  'only a teacher can join a class team'
);
select throws_ok(
  $$ select public.set_class_team_member('00000000-0000-4000-7000-0000000000e1', '00000000-0000-4000-7000-000000000b02', 'assistant') $$,
  '22023', 'class_team_not_a_teacher',
  'nor a teacher of another nursery'
);

select is(
  (select remove_class_team_member::text || ' ' || public.remove_class_team_member('00000000-0000-4000-7000-0000000000e2', '00000000-0000-4000-7000-000000000a03')::text
     from public.remove_class_team_member('00000000-0000-4000-7000-0000000000e2', '00000000-0000-4000-7000-000000000a03')),
  'true false',
  'a teacher leaves a class (once)'
);

-- Nadia is told she leads the Butterflies.
reset role;
select is(
  (select format('%s %s %s', n.template_key, n.template_params->'class'->>'en', n.template_params->'role'->>'i18n')
     from public.notifications n where n.user_id = '00000000-0000-4000-7000-000000000a04' and n.type = 'class_team'),
  'class_team_assigned Butterflies classTeam.roles.lead',
  'the teacher is told which class and place'
);

select pg_temp.act_as('00000000-0000-4000-7000-000000000a03');
select throws_ok(
  $$ select public.get_class_teams('00000000-0000-4000-7000-00000000000a') $$,
  '42501', 'class_team_forbidden',
  'a teacher without the class team permission cannot see or change the teams'
);

select pg_temp.act_as('00000000-0000-4000-7000-000000000b01');
select throws_ok(
  $$ select public.set_class_team_member('00000000-0000-4000-7000-0000000000e1', '00000000-0000-4000-7000-000000000a03', 'lead') $$,
  '42501', 'class_team_forbidden',
  'nor another nursery''s admin'
);

select pg_temp.act_as('00000000-0000-4000-7000-000000000a01');
select is(
  (select t->>'can_update' from public.get_class_teams('00000000-0000-4000-7000-00000000000a') t),
  'true',
  'the nursery''s admin manages the teams'
);

-- ---------------------------------------------------------------------------------------------
-- The teacher's classes and children (Nadia leads the Butterflies; Sara assists)
select pg_temp.act_as('00000000-0000-4000-7000-000000000a04');

select is(
  (select format('%s %s %s [%s]', c.name_en, c.my_role, c.children_count, (select string_agg(x->>'name_en' || ':' || (x->>'role'), ', ') from jsonb_array_elements(c.team) x))
     from public.get_my_classes() c),
  'Butterflies lead 2 [Nadia:lead, Sara:assistant]',
  'my classes: my place, the children and the team'
);

select is(
  (select string_agg(format('%s %s late=%s parents=%s', c.full_name_en, c.day_status, c.late_now, jsonb_array_length(c.parents)), '; ' order by c.full_name_en)
     from public.get_my_class_children() c),
  'Laila in_nursery late=t parents=2; Omar absent late=f parents=1',
  'my children: here and in extra hours now, absent; with their parents'
);

-- ---------------------------------------------------------------------------------------------
-- Chats with the families of the teacher's classes
select is(
  (select string_agg(format('%s (%s)', d.name_en, d.context_en), ', ' order by d.name_en)
     from public.chat_directory() d where d.role = 'parent'),
  'Karim (Laila), Mona (Laila, Omar)',
  'a teacher''s directory has the parents of the children in the teacher''s classes, with their children'
);

select throws_ok(
  $$ select public.create_chat_conversation('direct', null, array['00000000-0000-4000-7000-000000000a07']::uuid[]) $$,
  '42501', 'chat_member_not_allowed',
  'a teacher cannot start a chat with a family of another class'
);

select lives_ok(
  $$ select public.create_chat_conversation('direct', null, array['00000000-0000-4000-7000-000000000a06']::uuid[]) $$,
  'a teacher starts a chat with a family of the class'
);

-- ---------------------------------------------------------------------------------------------
-- Messages to families
select is(
  (select format('%s parents, %s children', r->>'parents', r->>'children')
     from public.send_family_message(
       array['00000000-0000-4000-7000-0000000000c1', '00000000-0000-4000-7000-0000000000c3']::uuid[],
       'Please bring a hat tomorrow.', 'children', '00000000-0000-4000-7000-0000000000e1') r),
  '2 parents, 2 children',
  'a message to two children reaches every parent of each'
);

select is(
  (select format('%s / %s / %s / %s / %s', m.sender_role, m.sender_role_title_en, coalesce(m.sender_department::text, '-'), m.sender_class_names_en, m.sender_class_role)
     from public.family_messages m where m.sender_id = '00000000-0000-4000-7000-000000000a04'),
  'teacher / Teacher / - / Butterflies / lead',
  'the message keeps who sent it: role, title, department, class and place'
);

select throws_ok(
  $$ select public.send_family_message(array['00000000-0000-4000-7000-0000000000c2']::uuid[], 'Hello', 'child') $$,
  '42501', 'family_message_child_not_in_your_class',
  'a teacher writes only to the families of the teacher''s classes'
);
select throws_ok(
  $$ select public.send_family_message(array['00000000-0000-4000-7000-0000000000c1']::uuid[], '   ', 'child') $$,
  '22023', 'family_message_body_invalid',
  'an empty message is refused'
);

select pg_temp.act_as('00000000-0000-4000-7000-000000000a06');
select is(
  (select format('%s | %s | %s | read=%s', m.body, m.sender_name_en, m.children_en, m.read_at is not null)
     from public.get_parent_family_messages() m),
  'Please bring a hat tomorrow. | Nadia | Laila, Omar | read=f',
  'the parent sees the message, who sent it and which of their children it is about'
);
select is(
  (select format('%s %s', n.template_key, n.template_params->'children'->>'en') from public.notifications n where n.user_id = auth.uid() and n.type = 'family_message'),
  'family_message Laila, Omar',
  'and gets a notification naming their children'
);
select is(public.mark_family_message_read((select message_id from public.get_parent_family_messages())), 2, 'reading it marks it read');

select pg_temp.act_as('00000000-0000-4000-7000-000000000a07');
select is(
  (select count(*)::int from public.get_parent_family_messages()) + (select count(*)::int from public.family_messages),
  0,
  'another family sees nothing of it'
);

select pg_temp.act_as('00000000-0000-4000-7000-000000000a04');
select is(
  (select format('%s children, %s families, %s read', s.children_count, s.parents_count, s.read_count) from public.get_sent_family_messages() s),
  '2 children, 2 families, 1 read',
  'the teacher sees how many families read it'
);

select * from finish();
rollback;

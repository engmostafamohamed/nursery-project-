-- Database test · the day before an event: at 5 pm in the nursery's time zone, each family with a
-- child going is told once (when, where, the check-in code), and each teacher of a class with
-- children going is told how many. Never a family still to answer, a withdrawn request, a draft, a
-- cancelled event or one further away; never twice. Rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(9);

-- The reminders each user got, as "type link".
create function pg_temp.notices(p_user uuid) returns text language sql as $$
  select coalesce(string_agg(format('%s %s', type, action_link), ', ' order by type), '-')
    from public.notifications where user_id = p_user and type like 'event_tomorrow%'
$$;

insert into public.nurseries (id, name_ar, name_en) values ('00000000-0000-4000-9800-00000000000a', 'حضانة', 'Tomorrow Nursery');
update public.nursery_settings set timezone = 'Africa/Cairo' where nursery_id = '00000000-0000-4000-9800-00000000000a';
insert into public.classes (id, nursery_id, name_ar, name_en) values
  ('00000000-0000-4000-9800-0000000000b1', '00000000-0000-4000-9800-00000000000a', 'أ', 'Class A'),
  ('00000000-0000-4000-9800-0000000000b2', '00000000-0000-4000-9800-00000000000a', 'ب', 'Class B');
insert into auth.users (id, email) values
  ('00000000-0000-4000-9800-000000000a02', 'tomorrow.teacher.a@test.local'),
  ('00000000-0000-4000-9800-000000000a03', 'tomorrow.teacher.b@test.local'),
  ('00000000-0000-4000-9800-000000000a04', 'tomorrow.mona@test.local'),
  ('00000000-0000-4000-9800-000000000a05', 'tomorrow.karim@test.local');
update public.users u
   set role = v.role::public.user_role, nursery_id = '00000000-0000-4000-9800-00000000000a', name_en = v.name_en, status = 'active'
  from (values
    ('00000000-0000-4000-9800-000000000a02', 'teacher', 'Teacher A'),
    ('00000000-0000-4000-9800-000000000a03', 'teacher', 'Teacher B'),
    ('00000000-0000-4000-9800-000000000a04', 'parent', 'Mona'),
    ('00000000-0000-4000-9800-000000000a05', 'parent', 'Karim')
  ) as v(id, role, name_en)
 where u.id = v.id::uuid;
insert into public.class_staff (class_id, user_id) values
  ('00000000-0000-4000-9800-0000000000b1', '00000000-0000-4000-9800-000000000a02'),
  ('00000000-0000-4000-9800-0000000000b2', '00000000-0000-4000-9800-000000000a03');
-- Mona's Laila and Nour are in class A; Karim's Omar in class B.
insert into public.children (id, nursery_id, class_id, full_name_ar, full_name_en, dob, status, enrollment_date) values
  ('00000000-0000-4000-9800-0000000000c1', '00000000-0000-4000-9800-00000000000a', '00000000-0000-4000-9800-0000000000b1', 'ليلى', 'Laila', '2022-01-01', 'active', '2026-01-01'),
  ('00000000-0000-4000-9800-0000000000c2', '00000000-0000-4000-9800-00000000000a', '00000000-0000-4000-9800-0000000000b2', 'عمر', 'Omar', '2022-01-01', 'active', '2026-01-01'),
  ('00000000-0000-4000-9800-0000000000c3', '00000000-0000-4000-9800-00000000000a', '00000000-0000-4000-9800-0000000000b1', 'نور', 'Nour', '2022-01-01', 'active', '2026-01-01');
insert into public.parent_children (parent_id, child_id, is_primary) values
  ('00000000-0000-4000-9800-000000000a04', '00000000-0000-4000-9800-0000000000c1', true),
  ('00000000-0000-4000-9800-000000000a04', '00000000-0000-4000-9800-0000000000c3', true),
  ('00000000-0000-4000-9800-000000000a05', '00000000-0000-4000-9800-0000000000c2', true);

-- "Now" is 1 Dec 2026, 5 pm in Cairo (3 pm UTC). The zoo trip is tomorrow at 9 am; beside it a
-- cancelled party and a draft tomorrow, a visit in two days, and a museum Omar was withdrawn from.
insert into public.events (id, nursery_id, title_ar, title_en, starts_at, location, category, target_scope, status, cancelled_at) values
  ('00000000-0000-4000-9800-0000000000e1', '00000000-0000-4000-9800-00000000000a', 'رحلة', 'Zoo trip', '2026-12-02 07:00+00', 'Giza Zoo', 'trip', 'individual', 'active', null),
  ('00000000-0000-4000-9800-0000000000e2', '00000000-0000-4000-9800-00000000000a', 'حفل', 'Party', '2026-12-02 08:00+00', null, 'activity', 'individual', 'cancelled', '2026-11-30'),
  ('00000000-0000-4000-9800-0000000000e3', '00000000-0000-4000-9800-00000000000a', 'مسودة', 'Draft', '2026-12-02 08:00+00', null, 'activity', 'individual', 'draft', null),
  ('00000000-0000-4000-9800-0000000000e4', '00000000-0000-4000-9800-00000000000a', 'زيارة', 'Visit', '2026-12-03 08:00+00', null, 'activity', 'individual', 'active', null),
  ('00000000-0000-4000-9800-0000000000e5', '00000000-0000-4000-9800-00000000000a', 'متحف', 'Museum', '2026-12-02 08:00+00', null, 'trip', 'individual', 'active', null);
insert into public.permissions (child_id, event_id, permission_type, status, deleted_at) values
  ('00000000-0000-4000-9800-0000000000c1', '00000000-0000-4000-9800-0000000000e1', 'event', 'granted', null),
  ('00000000-0000-4000-9800-0000000000c3', '00000000-0000-4000-9800-0000000000e1', 'event', 'granted', null),
  ('00000000-0000-4000-9800-0000000000c2', '00000000-0000-4000-9800-0000000000e1', 'event', 'pending', null),
  ('00000000-0000-4000-9800-0000000000c1', '00000000-0000-4000-9800-0000000000e2', 'event', 'granted', null),
  ('00000000-0000-4000-9800-0000000000c1', '00000000-0000-4000-9800-0000000000e3', 'event', 'granted', null),
  ('00000000-0000-4000-9800-0000000000c1', '00000000-0000-4000-9800-0000000000e4', 'event', 'granted', null),
  ('00000000-0000-4000-9800-0000000000c2', '00000000-0000-4000-9800-0000000000e5', 'event', 'granted', now());

select is(public.run_event_tomorrow_reminders('2026-12-01 14:00+00'), 0, 'at 4 pm in Cairo nobody is told yet');
select is(public.run_event_tomorrow_reminders('2026-12-01 15:00+00'), 2, 'at 5 pm: Mona once for her two children, and class A''s teacher');
select is(pg_temp.notices('00000000-0000-4000-9800-000000000a04'), 'event_tomorrow /parent/events/00000000-0000-4000-9800-0000000000e1',
  'Mona: the zoo trip only (not the cancelled party, the draft nor the visit in two days)');
select is(
  (select template_params - 'event' from public.notifications where user_id = '00000000-0000-4000-9800-000000000a04' and type = 'event_tomorrow'),
  '{"tz": "Africa/Cairo", "location": "Giza Zoo", "segments": ["place", "qr"], "start_time": "2026-12-02T07:00:00+00:00"}'::jsonb,
  'with the time, the time zone and the place');
select is(pg_temp.notices('00000000-0000-4000-9800-000000000a02'), 'event_tomorrow_staff /teacher/events?event=00000000-0000-4000-9800-0000000000e1',
  'class A''s teacher, linked to the roster');
select is((select (template_params ->> 'count')::int from public.notifications where user_id = '00000000-0000-4000-9800-000000000a02'), 2, 'two of her children are going');
select is(pg_temp.notices('00000000-0000-4000-9800-000000000a05') || ' / ' || pg_temp.notices('00000000-0000-4000-9800-000000000a03'), '- / -',
  'not Karim (Omar still to answer, his museum request withdrawn) nor class B''s teacher');
select is(public.run_event_tomorrow_reminders('2026-12-01 15:30+00'), 0, 'never twice');

set local role authenticated;
select throws_ok($$ select public.run_event_tomorrow_reminders() $$, '42501', null, 'the app cannot run the job');

select * from finish();
rollback;
